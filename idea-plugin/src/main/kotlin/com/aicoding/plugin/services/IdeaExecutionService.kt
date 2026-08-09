package com.aicoding.plugin.services

import com.intellij.execution.ExecutionListener
import com.intellij.execution.ExecutionManager
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.execution.RunManager
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.externalSystem.model.ProjectSystemId
import com.intellij.openapi.externalSystem.model.execution.ExternalSystemTaskExecutionSettings
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import kotlinx.serialization.Serializable
import org.jetbrains.idea.maven.execution.MavenRunner
import org.jetbrains.idea.maven.execution.MavenRunnerParameters
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap

@Serializable
data class IdeaRunConfigurationInfo(
    val id: String,
    val name: String,
    val type: String,
    val folder: String? = null,
    val temporary: Boolean = false,
)

@Serializable
data class IdeaRunConfigurationRequest(val id: String, val mode: String = "run")

@Serializable
data class IdeaBuildRequest(val tasks: List<String>)

@Serializable
data class IdeaExecutionLog(
    val id: Long,
    val configurationID: String,
    val name: String,
    val executor: String,
    val running: Boolean,
    val exitCode: Int? = null,
    val startedAt: Long,
    val completedAt: Long? = null,
    val text: String,
)

@Serializable
data class IdeaExecutionResponse(
    val success: Boolean,
    val message: String? = null,
    val logs: List<IdeaExecutionLog> = emptyList(),
)

@Serializable
data class IdeaBridgeStatus(
    val success: Boolean = true,
    val installed: Boolean,
    val enabled: Boolean,
    val location: String,
    val mavenAvailable: Boolean,
    val gradleAvailable: Boolean,
    val message: String? = null,
)

@Serializable
data class IdeaBridgeToggleRequest(val enabled: Boolean)

private const val MAVEN_PLUGIN_ID = "org.jetbrains.idea.maven"
private const val GRADLE_PLUGIN_ID = "com.intellij.gradle"
private val GRADLE_SYSTEM_ID = ProjectSystemId("GRADLE")

private class ExecutionBuffer(
    val id: Long,
    val configurationID: String,
    val name: String,
    val executor: String,
) {
    val startedAt = System.currentTimeMillis()
    val text = StringBuilder()
    @Volatile var running = true
    @Volatile var exitCode: Int? = null
    @Volatile var completedAt: Long? = null

    @Synchronized
    fun append(value: String) {
        text.append(value)
        if (text.length > MAX_LOG_CHARS) text.delete(0, text.length - MAX_LOG_CHARS)
    }

    @Synchronized
    fun snapshot() = IdeaExecutionLog(
        id = id,
        configurationID = configurationID,
        name = name,
        executor = executor,
        running = running,
        exitCode = exitCode,
        startedAt = startedAt,
        completedAt = completedAt,
        text = text.toString(),
    )

    companion object {
        private const val MAX_LOG_CHARS = 1_000_000
    }
}

class IdeaExecutionService(private val project: Project) : Disposable {
    private val logger = Logger.getInstance(IdeaExecutionService::class.java)
    private val buffers = ConcurrentHashMap<Long, ExecutionBuffer>()
    private val connection = project.messageBus.connect(this)

    init {
        connection.subscribe(ExecutionManager.EXECUTION_TOPIC, object : ExecutionListener {
            override fun processStarted(executorId: String, env: ExecutionEnvironment, handler: ProcessHandler) {
                val settings = env.runnerAndConfigurationSettings
                val id = env.executionId
                val buffer = ExecutionBuffer(
                    id = id,
                    configurationID = settings?.uniqueID ?: env.runProfile.name,
                    name = settings?.name ?: env.runProfile.name,
                    executor = executorId,
                )
                buffers[id] = buffer
                trimBuffers()
                handler.addProcessListener(object : ProcessAdapter() {
                    override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                        buffer.append(stripControlSequences(event.text))
                    }

                    override fun processTerminated(event: ProcessEvent) {
                        buffer.running = false
                        buffer.exitCode = event.exitCode
                        buffer.completedAt = System.currentTimeMillis()
                    }
                }, this@IdeaExecutionService)
            }
        })
    }

    fun configurations(): List<IdeaRunConfigurationInfo> = RunManager.getInstance(project).allSettings
        .filterNot { it.isTemplate }
        .map { settings ->
            IdeaRunConfigurationInfo(
                id = settings.uniqueID,
                name = settings.name,
                type = settings.type.displayName,
                folder = settings.folderName,
                temporary = settings.isTemporary,
            )
        }
        .sortedWith(compareBy<IdeaRunConfigurationInfo> { it.type }.thenBy { it.name.lowercase() })

    fun runConfiguration(request: IdeaRunConfigurationRequest): IdeaExecutionResponse = runCatching {
        val settings = RunManager.getInstance(project).allSettings.firstOrNull { it.uniqueID == request.id }
            ?: error("没有找到指定的 Run Configuration")
        val executor = if (request.mode.equals("debug", true)) {
            DefaultDebugExecutor.getDebugExecutorInstance()
        } else {
            DefaultRunExecutor.getRunExecutorInstance()
        }
        ApplicationManager.getApplication().invokeLater {
            ProgramRunnerUtil.executeConfiguration(settings, executor)
        }
        IdeaExecutionResponse(true, "已在 IDEA 中启动 ${settings.name}")
    }.getOrElse { IdeaExecutionResponse(false, it.message ?: "无法启动 Run Configuration") }

    fun runMaven(request: IdeaBuildRequest): IdeaExecutionResponse = runCatching {
        val goals = sanitizeTasks(request.tasks)
        val workingDirectory = project.basePath ?: error("当前项目没有工作目录")
        require(Files.exists(Path.of(workingDirectory, "pom.xml"))) { "当前项目根目录没有 pom.xml" }
        require(pluginEnabled(MAVEN_PLUGIN_ID)) { "当前 IDEA 没有启用 Maven 插件，无法运行 Maven 任务" }
        val parameters = MavenRunnerParameters(true, workingDirectory, "pom.xml", goals, emptyList())
        val runner = MavenRunner.getInstance(project)
        ApplicationManager.getApplication().invokeLater {
            runner.run(parameters, runner.settings.clone(), null)
        }
        IdeaExecutionResponse(true, "已在 IDEA Maven 中启动：${goals.joinToString(" ")}")
    }.getOrElse { IdeaExecutionResponse(false, it.message ?: "无法启动 Maven 任务") }

    fun runGradle(request: IdeaBuildRequest): IdeaExecutionResponse = runCatching {
        val tasks = sanitizeTasks(request.tasks)
        val workingDirectory = project.basePath ?: error("当前项目没有工作目录")
        require(
            Files.exists(Path.of(workingDirectory, "build.gradle")) ||
                Files.exists(Path.of(workingDirectory, "build.gradle.kts")),
        ) { "当前项目根目录没有 Gradle 构建文件" }
        require(pluginEnabled(GRADLE_PLUGIN_ID)) { "当前 IDEA 没有启用 Gradle 插件，无法运行 Gradle 任务" }
        val settings = ExternalSystemTaskExecutionSettings().apply {
            executionName = "Capybara AI: ${tasks.joinToString(" ")}"
            externalProjectPath = workingDirectory
            externalSystemIdString = GRADLE_SYSTEM_ID.id
            taskNames = tasks
        }
        ApplicationManager.getApplication().invokeLater {
            ExternalSystemUtil.runTask(
                settings,
                DefaultRunExecutor.EXECUTOR_ID,
                project,
                GRADLE_SYSTEM_ID,
            )
        }
        IdeaExecutionResponse(true, "已在 IDEA Gradle 中启动：${tasks.joinToString(" ")}")
    }.getOrElse { IdeaExecutionResponse(false, it.message ?: "无法启动 Gradle 任务") }

    fun logs(configurationID: String? = null): IdeaExecutionResponse {
        val values = buffers.values
            .asSequence()
            .filter { configurationID.isNullOrBlank() || it.configurationID == configurationID }
            .sortedByDescending { it.startedAt }
            .take(20)
            .map(ExecutionBuffer::snapshot)
            .toList()
        return IdeaExecutionResponse(true, logs = values)
    }

    /**
     * Keeps the port hint fresh so an already-installed bridge plugin can reach this project's
     * HTTP server. Installing the bridge itself stays an explicit, user-approved action.
     */
    fun publishBridgePort(frontendPort: Int) {
        runCatching {
            val ideaDirectory = (project.basePath?.let(Path::of) ?: return).resolve(".idea")
            Files.createDirectories(ideaDirectory)
            Files.writeString(ideaDirectory.resolve("capybara-ai-port"), frontendPort.toString())
        }
    }

    fun bridgeStatus(): IdeaBridgeStatus {
        val active = bridgeFile()
        val disabled = disabledBridgeFile()
        val enabled = Files.isRegularFile(active)
        val installed = enabled || Files.isRegularFile(disabled)
        return IdeaBridgeStatus(
            installed = installed,
            enabled = enabled,
            location = if (enabled) active.toString() else disabled.toString(),
            mavenAvailable = pluginEnabled(MAVEN_PLUGIN_ID),
            gradleAvailable = pluginEnabled(GRADLE_PLUGIN_ID),
        )
    }

    fun setBridgeEnabled(enabled: Boolean): IdeaBridgeStatus = runCatching {
        val active = bridgeFile()
        val disabled = disabledBridgeFile()
        Files.createDirectories(active.parent)
        if (enabled) {
            Files.writeString(active, bridgePluginSource())
            Files.deleteIfExists(disabled)
        } else {
            Files.writeString(disabled, bridgePluginSource())
            Files.deleteIfExists(active)
        }
        bridgeStatus().copy(
            message = if (enabled) {
                "IDEA 原生桥接已启用；新启动的 OpenCode 服务会自动加载"
            } else {
                "IDEA 原生桥接已停用；当前已运行的 OpenCode 服务会在下次启动后移除工具"
            },
        )
    }.getOrElse { error ->
        bridgeStatus().copy(success = false, message = error.message ?: "无法更新 IDEA 原生桥接状态")
    }

    /**
     * Keeps the built-in bridge source current before OpenCode starts. The file remains installed
     * after IDEA closes so an already-running shared OpenCode service does not lose the bridge on
     * the next project. A disabled bridge remains disabled.
     */
    fun activateBridge(frontendPort: Int) = runCatching {
        publishBridgePort(frontendPort)
        val active = bridgeFile()
        val disabled = disabledBridgeFile()
        Files.createDirectories(active.parent)
        if (Files.exists(disabled)) Files.writeString(disabled, bridgePluginSource())
        else Files.writeString(active, bridgePluginSource())
        // The permission.ask hook only runs when OpenCode itself decides to ask, and with no
        // `permission` block in opencode.jsonc everything defaults to allow — so the hook alone
        // is not enough. Scaffold the config once; the mode then refines it per session.
        project.getService(OpenCodeConfigService::class.java)?.applyPermissionOverride()
    }.getOrElse { logger.info("Unable to install the IDEA bridge: ${it.message}") }

    fun deactivateBridge() = runCatching {
        // Hand the user their own permission config back; IDEA only borrows it while it is open.
        project.getService(OpenCodeConfigService::class.java)?.restorePermissions()
        val ideaDirectory = project.basePath?.let(Path::of)?.resolve(".idea") ?: return@runCatching
        Files.deleteIfExists(ideaDirectory.resolve("capybara-ai-port"))
    }.getOrElse { logger.info("Unable to clear the IDEA bridge port: ${it.message}") }

    override fun dispose() {
        buffers.clear()
    }

    private fun bridgeFile(): Path =
        Path.of(System.getProperty("user.home")).resolve(".config/opencode/plugins/capybara-idea.ts")

    /** Present when the user turned the bridge off from the Plugins page. */
    private fun disabledBridgeFile(): Path = bridgeFile().resolveSibling("capybara-idea.ts.disabled")

    private fun pluginEnabled(id: String): Boolean =
        PluginManagerCore.getPlugin(PluginId.getId(id))?.isEnabled == true

    private fun sanitizeTasks(tasks: List<String>): List<String> {
        val clean = tasks.map(String::trim).filter(String::isNotBlank)
        require(clean.isNotEmpty()) { "至少需要一个构建任务" }
        require(clean.all { it.matches(Regex("^[A-Za-z0-9_.:-]+$")) }) { "构建任务包含无效字符" }
        return clean
    }

    private fun trimBuffers() {
        if (buffers.size <= 40) return
        buffers.values.sortedBy { it.startedAt }.take(buffers.size - 40).forEach { buffers.remove(it.id) }
    }

    private fun stripControlSequences(value: String): String = value
        .replace(Regex("\\u001B\\[[;\\d]*[ -/]*[@-~]"), "")
        .replace("\r", "")

    private fun bridgePluginSource(): String = """
        import { tool } from "@opencode-ai/plugin"
        import fs from "node:fs/promises"
        import path from "node:path"
        import os from "node:os"

        export const CapybaraIdea = async ({ directory }) => {
          const bridgePortFile = path.join(directory, ".idea", "capybara-ai-port")
          const request = async (prefix, route, init = {}) => {
            const port = (await fs.readFile(bridgePortFile, "utf8")).trim()
            const response = await fetch(`http://127.0.0.1:${'$'}{port}${'$'}{prefix}${'$'}{route}`, {
              headers: { "content-type": "application/json" },
              ...init,
            })
            const text = await response.text()
            if (!response.ok) throw new Error(text || `IDEA bridge failed: ${'$'}{response.status}`)
            return text
          }
          const call = (route, init) => request("/api", route, init)
          const registryFile = path.join(os.homedir(), ".config", "opencode", "capybara-ports.json")
          // One OpenCode process can serve several IDEA projects while this plugin is constructed
          // with a single `directory`. The registry lists every running plugin server so a request
          // can be routed to the project that actually owns the session.
          const allBridgePorts = async () => {
            const ports = []
            try {
              const own = (await fs.readFile(bridgePortFile, "utf8")).trim()
              if (own) ports.push(own)
            } catch (error) { /* this project may not be open */ }
            try {
              const registry = JSON.parse(await fs.readFile(registryFile, "utf8"))
              for (const value of Object.values(registry)) {
                const port = String(value).trim()
                if (port && !ports.includes(port)) ports.push(port)
              }
            } catch (error) { /* registry appears once a panel has started */ }
            return ports
          }
          const callPort = async (port, route, init = {}) => {
            const response = await fetch(`http://127.0.0.1:${'$'}{port}/api${'$'}{route}`, {
              headers: { "content-type": "application/json" },
              ...init,
            })
            if (!response.ok) throw new Error(`HTTP ${'$'}{response.status}`)
            return response.text()
          }
          const authorize = (context, permission, pattern = "*") =>
            context.ask({ permission, patterns: [pattern], always: [pattern], metadata: {} })
          // The built-in browser shares the same HTTP server; only the path prefix differs.
          const browser = (body) =>
            request("/browser", "/control", { method: "POST", body: JSON.stringify(body) })
          const ideaSystemPrompt = [
            "# IntelliJ IDEA environment",
            "You are running inside IntelliJ IDEA through the Capybara bridge. Workspace: " + directory + ".",
            "The idea_* tools are live IDE capabilities, not documentation. They exist right now and you may call them without asking the user first — the approval mode already gates whatever needs gating.",
            "",
            "## Which tool for what",
            "- Understanding the project or the file the user is looking at: idea_project_context, idea_editor_context. Cheaper and more accurate than inferring from paths.",
            "- Compiler and inspection errors, symbol usages, jumping the user to a location: idea_diagnostics, idea_symbol, idea_navigate.",
            "- Running, debugging, reading console output, Maven and Gradle: idea_run_configuration, idea_read_run_log, idea_maven, idea_gradle. Prefer these over a raw shell command — the output lands in IDEA's own tool windows where the user can act on it.",
            "- After creating, deleting or rewriting files outside the editor: idea_refresh_project, otherwise IDEA keeps showing stale content.",
            "",
            "## The built-in browser (idea_browser)",
            "A real Chromium window inside IDEA that you control. Use it whenever the task involves a web page: a dev server, a page the user mentions, a UI you just changed.",
            "Do NOT wait to be told to use it. If the work is about a page, open it yourself.",
            "1. Call idea_browser action 'status' first. If browserOpen is false, call action 'open' with the url — that opens the window; the user does not have to touch a menu.",
            "2. Call 'listPicks' before changing any UI. The user marks elements in the browser and writes what they want changed; those annotations are the real requirement and each carries a CSS selector you can trace back to the source.",
            "3. After editing frontend code, reload with 'navigate' and verify with 'getText' or 'screenshot' instead of asserting it works.",
            "Actions: status, open, navigate, click, type, getText, getHtml, waitFor, executeScript, screenshot, listPicks, clearPicks, openDevTools.",
            "",
            "## Restraint",
            "Do not call IDEA tools ceremonially. When a plain file read or shell command answers the question, use that. Pick the capability that gives the clearest result with the least disruption to the user's IDE.",
          ].join("\n")
          return {
            // OpenCode 1.18.x accepts `permission` on PATCH /session and PATCH /config, returns
            // 200, then discards it — so the composer's approval mode is enforced here instead.
            // If the IDEA server is unreachable we leave OpenCode's own decision untouched.
            "permission.ask": async (input, output) => {
              try {
                const route =
                  `/approval-mode/decide?sessionID=${'$'}{encodeURIComponent(input.sessionID || "")}` +
                  `&type=${'$'}{encodeURIComponent(input.type || "")}`
                // Ask every running plugin server and prefer the one that owns this session:
                // a single OpenCode process can serve several IDEA projects, and the mode lives
                // in whichever project opened the session.
                let decision = null
                let ownerPort = null
                for (const port of await allBridgePorts()) {
                  try {
                    const parsed = JSON.parse(await callPort(port, route))
                    if (!decision) decision = parsed
                    if (parsed && parsed.known) { decision = parsed; ownerPort = port; break }
                  } catch (error) { /* that project may have been closed */ }
                }
                if (decision && typeof decision.status === "string") {
                  output.status = decision.status
                  // This hook is the only place that sees asks for every session, so it is what
                  // lets the session list flag a run that is blocked in the background.
                  if (decision.status === "ask" && input.sessionID && ownerPort) {
                    await callPort(ownerPort, "/approval-mode/pending", {
                      method: "POST",
                      body: JSON.stringify({ sessionID: input.sessionID, pending: true }),
                    }).catch(() => {})
                  }
                }
              } catch (error) {
                // IDEA closed or the server moved: fall back to OpenCode's default handling.
              }
            },
            "experimental.chat.system.transform": async (input, output) => {
              if (!input.sessionID) return
              try {
                await fs.access(bridgePortFile)
                output.system.push(ideaSystemPrompt)
              } catch {
                // The global plugin can also be loaded by OpenCode instances outside IDEA.
              }
            },
            tool: {
              idea_run_configuration: tool({
                description: "List or start an IntelliJ IDEA Run/Debug configuration for the current project.",
                args: {
                  id: tool.schema.string().optional(),
                  mode: tool.schema.enum(["run", "debug"]).optional(),
                },
                async execute(args, context) {
                  if (!args.id) {
                    await authorize(context, "read", "idea:run-configurations")
                    return call("/ide/run-configurations")
                  }
                  await authorize(context, "idea_run_configuration", args.id)
                  return call("/ide/run", { method: "POST", body: JSON.stringify({ id: args.id, mode: args.mode ?? "run" }) })
                },
              }),
              idea_read_run_log: tool({
                description: "Read recent IntelliJ IDEA Run, Debug, Maven, or Gradle console output.",
                args: { configurationID: tool.schema.string().optional() },
                async execute(args, context) {
                  await authorize(context, "idea_read_run_log", args.configurationID ?? "*")
                  const query = args.configurationID ? `?configurationID=${'$'}{encodeURIComponent(args.configurationID)}` : ""
                  return call(`/ide/logs${'$'}{query}`)
                },
              }),
              idea_project_context: tool({
                description:
                  "Read IntelliJ IDEA's live project structure: SDK, modules, content/source roots, dependencies, open files, and current file.",
                args: {},
                async execute(_args, context) {
                  await authorize(context, "idea_project_context")
                  return call("/ide/project-context")
                },
              }),
              idea_editor_context: tool({
                description:
                  "Read the current IDEA editor caret, selection, language, line range, and nearby source text. " +
                  "Pass path and line to inspect another project file through IDEA's document model.",
                args: {
                  path: tool.schema.string().optional(),
                  line: tool.schema.number().optional(),
                  contextLines: tool.schema.number().optional(),
                },
                async execute(args, context) {
                  await authorize(context, "idea_editor_context", args.path ?? "*")
                  return call("/ide/editor-context", { method: "POST", body: JSON.stringify(args) })
                },
              }),
              idea_diagnostics: tool({
                description:
                  "Read IntelliJ IDEA's current inspections, compiler highlights, warnings, and errors for a project file.",
                args: {
                  path: tool.schema.string().optional(),
                  minSeverity: tool.schema.enum(["error", "warning", "weak_warning"]).optional(),
                  limit: tool.schema.number().optional(),
                },
                async execute(args, context) {
                  await authorize(context, "idea_diagnostics", args.path ?? "*")
                  return call("/ide/diagnostics", { method: "POST", body: JSON.stringify(args) })
                },
              }),
              idea_symbol: tool({
                description:
                  "Resolve the PSI symbol at a one-based file line/column and find project references or implementations using IDEA indexes.",
                args: {
                  path: tool.schema.string().optional(),
                  line: tool.schema.number(),
                  column: tool.schema.number().optional(),
                  action: tool.schema.enum(["references", "implementations"]),
                  limit: tool.schema.number().optional(),
                },
                async execute(args, context) {
                  await authorize(context, "idea_symbol", args.path ?? "*")
                  return call("/ide/symbol", { method: "POST", body: JSON.stringify(args) })
                },
              }),
              idea_navigate: tool({
                description: "Open a project file at a one-based line and column in the IntelliJ IDEA editor for the user.",
                args: {
                  path: tool.schema.string(),
                  line: tool.schema.number().optional(),
                  column: tool.schema.number().optional(),
                },
                async execute(args, context) {
                  await authorize(context, "idea_navigate", args.path)
                  return call("/ide/navigate", { method: "POST", body: JSON.stringify(args) })
                },
              }),
              idea_refresh_project: tool({
                description: "Save open IDEA documents and refresh the VFS index and Project tool window after external file changes.",
                args: {},
                async execute(_args, context) {
                  await authorize(context, "idea_refresh_project")
                  return call("/ide/refresh", { method: "POST", body: "{}" })
                },
              }),
              idea_maven: tool({
                description: "Run Maven goals through IntelliJ IDEA's native Maven runner.",
                args: { tasks: tool.schema.array(tool.schema.string()) },
                async execute(args, context) {
                  await authorize(context, "idea_maven", args.tasks.join(" "))
                  return call("/ide/maven", { method: "POST", body: JSON.stringify({ tasks: args.tasks }) })
                },
              }),
              idea_gradle: tool({
                description: "Run Gradle tasks through IntelliJ IDEA's native Gradle runner.",
                args: { tasks: tool.schema.array(tool.schema.string()) },
                async execute(args, context) {
                  await authorize(context, "idea_gradle", args.tasks.join(" "))
                  return call("/ide/gradle", { method: "POST", body: JSON.stringify({ tasks: args.tasks }) })
                },
              }),
              idea_browser: tool({
                description:
                  "Control the Capybara built-in browser window inside IntelliJ IDEA. " +
                  "Call action 'status' first and use 'open' when browserOpen is false; the browser opens as an " +
                  "IDEA-native independent window. Before changing UI code, call 'listPicks' to read elements and " +
                  "comments marked by the user. Actions: status, open, navigate, click, getText, getHtml, type, " +
                  "waitFor, executeScript, listenSSE, pickElement, stopPick, listPicks, clearPicks, addComment, " +
                  "openDevTools. 'screenshot' also needs the CEF debug port.",
                args: {
                  action: tool.schema.enum([
                    "status",
                    "open",
                    "navigate",
                    "click",
                    "getText",
                    "getHtml",
                    "type",
                    "waitFor",
                    "executeScript",
                    "listenSSE",
                    "screenshot",
                    "openDevTools",
                    "pickElement",
                    "stopPick",
                    "listPicks",
                    "clearPicks",
                    "addComment",
                  ]),
                  url: tool.schema.string().optional(),
                  selector: tool.schema.string().optional(),
                  pickId: tool.schema.string().optional(),
                  script: tool.schema.string().optional(),
                  text: tool.schema.string().optional(),
                  timeoutMs: tool.schema.number().optional(),
                  maxEvents: tool.schema.number().optional(),
                },
                async execute(args, context) {
                  const readOnly = new Set(["status", "getText", "getHtml", "waitFor", "listenSSE", "screenshot", "listPicks"])
                  const permission = readOnly.has(args.action) ? "read" : "idea_browser"
                  const target = args.selector ?? args.url ?? args.pickId ?? args.action
                  await authorize(context, permission, `${'$'}{args.action}:${'$'}{target}`)
                  return browser(args)
                },
              }),
            },
          }
        }
    """.trimIndent()
}
