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
    /** No default: `encodeDefaults = false` would drop it and the client would read undefined. */
    val success: Boolean,
    val installed: Boolean,
    val enabled: Boolean,
    val location: String,
    val mavenAvailable: Boolean,
    val gradleAvailable: Boolean,
    /** Evidence that OpenCode is really running this bridge; null means the hook never fired. */
    val lastApprovalHook: String? = null,
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
            success = true,
            enabled = enabled,
            location = if (enabled) active.toString() else disabled.toString(),
            mavenAvailable = pluginEnabled(MAVEN_PLUGIN_ID),
            gradleAvailable = pluginEnabled(GRADLE_PLUGIN_ID),
            lastApprovalHook = project.getService(ApprovalModeService::class.java)?.lastHookCall,
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

        export const CapybaraIdea = async ({ directory, serverUrl }) => {
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
          /**
           * Which IDEA project owns this session, as { path, port }.
           *
           * The plugin is constructed with a single `directory`, so with one OpenCode process
           * serving several projects that value is wrong for every session but one — the prompt
           * would then name the wrong workspace, or stop being injected entirely once that one
           * project closed. The registry knows every running plugin server, and /approval-mode
           * answers `known` for the project that opened the session.
           */
          const ownerOfSession = async (sessionID) => {
            if (!sessionID) return null
            let registry = {}
            try {
              registry = JSON.parse(await fs.readFile(registryFile, "utf8"))
            } catch (error) { /* no panel has started yet */ }
            const entries = Object.entries(registry)
            try {
              const own = (await fs.readFile(bridgePortFile, "utf8")).trim()
              if (own && !entries.some(([, port]) => String(port).trim() === own)) {
                entries.unshift([directory, own])
              }
            } catch (error) { /* this project may not be open */ }
            for (const [path, port] of entries) {
              try {
                const route = "/approval-mode/decide?sessionID=" + encodeURIComponent(sessionID) + "&type=read"
                const parsed = JSON.parse(await callPort(String(port).trim(), route))
                if (parsed && parsed.known) return { path, port: String(port).trim() }
              } catch (error) { /* that project may have closed */ }
            }
            return null
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
          const ideaSystemPrompt = (workspace) => [
            "# IntelliJ IDEA environment",
            "You are running inside IntelliJ IDEA through the Capybara bridge. Workspace: " + workspace + ".",
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
            "NEVER open a URL or an HTML file with a shell command - no 'start', 'open', 'xdg-open', " +
            "'cmd /c start', 'Start-Process', and no spawning a static file server. Those launch the " +
            "user's external browser, which you cannot inspect, script or screenshot, so the task " +
            "silently becomes unverifiable. A local file works too: call open with a file:// URL.",
            "1. Call idea_browser action 'status' first. If browserOpen is false, call action 'open' with the url — that opens the window; the user does not have to touch a menu.",
            "2. Call 'listPicks' before changing any UI. The user marks elements in the browser and writes what they want changed; those annotations are the real requirement and each carries a CSS selector you can trace back to the source.",
            "3. After editing frontend code, reload with 'navigate' and verify with 'getText' or 'screenshot' instead of asserting it works.",
            "Actions: status, open, navigate, click, type, getText, getHtml, waitFor, executeScript, screenshot, listPicks, clearPicks, openDevTools.",
            "",
            "## Task list",
            "If you opened a todo list, keep it truthful. Mark each item completed as you finish it, not in one batch at the end.",
            "Never finish a turn with an item still 'in_progress' - the panel shows that list to the user, so a stale entry tells them work is still running when it is not. If you abandoned an item, mark it cancelled and say why.",
            "",
            "## Restraint",
            "Do not call IDEA tools ceremonially. When a plain file read or shell command answers the question, use that. Pick the capability that gives the clearest result with the least disruption to the user's IDE.",
          ].join("\n")
          /**
           * Resolve one approval against the owning project. Returns "allow" / "ask" / null,
           * plus the port that answered, so the caller can report a pending ask back to it.
           */
          const resolveApproval = async (sessionID, type) => {
            const route =
              `/approval-mode/decide?sessionID=${'$'}{encodeURIComponent(sessionID || "")}` +
              `&type=${'$'}{encodeURIComponent(type || "")}`
            // Ask every running plugin server and prefer the one that owns this session: a single
            // OpenCode process can serve several IDEA projects, and the mode lives in whichever
            // project opened the session.
            let decision = null
            let ownerPort = null
            for (const port of await allBridgePorts()) {
              try {
                const parsed = JSON.parse(await callPort(port, route))
                if (!decision) decision = parsed
                if (parsed && parsed.known) { decision = parsed; ownerPort = port; break }
              } catch (error) { /* that project may have been closed */ }
            }
            return { decision, ownerPort }
          }

          return {
            /**
             * The real enforcement point.
             *
             * `permission.ask` is documented by OpenCode 1.18.12 but never dispatched — the string
             * appears exactly once in the binary, inside the docs blob, with no call site. The
             * `permission.asked` bus event is what its own TUI listens to, and that one is real.
             *
             * The reply goes out over plain HTTP rather than through the SDK client, which has no
             * `permission` namespace at all — `client.permission.reply(...)` threw a TypeError that,
             * with no try/catch, killed the handler before anything was sent.
             *
             * Route and body are both taken from the server's own API surface and confirmed against
             * a live instance: `POST /permission/{requestID}/reply` with `{"reply":"once"}` clears
             * the request and the tool proceeds. `POST /session/{id}/permissions/{permissionID}`
             * with `{"response":...}`, which the generated SDK types describe, answers 200 and
             * leaves the permission pending — so even an `ok` check could not catch that mistake.
             * `GET /permission` lists what is still outstanding, which is how that was proven.
             */
            event: async ({ event }) => {
              if (!event || event.type !== "permission.asked") return
              const request = event.properties || {}
              try {
                const { decision, ownerPort } = await resolveApproval(request.sessionID, request.permission)
                if (decision && decision.status === "allow") {
                  const route = `permission/${'$'}{encodeURIComponent(request.id)}/reply` +
                    `?directory=${'$'}{encodeURIComponent(directory)}`
                  const response = await fetch(new URL(route, serverUrl), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    // "once" rather than "always": the mode is per session and the user can lower
                    // it mid-run, so a persisted rule would outlive the consent it came from.
                    body: JSON.stringify({ reply: "once" }),
                  })
                  if (!response.ok) throw new Error(`permission reply HTTP ${'$'}{response.status}`)
                  return
                }
                // Left for the user to answer. This hook is the only place that sees asks for every
                // session, so it is what lets the session list flag a run blocked in the background.
                if (request.sessionID && ownerPort) {
                  await callPort(ownerPort, "/approval-mode/pending", {
                    method: "POST",
                    body: JSON.stringify({ sessionID: request.sessionID, pending: true }),
                  }).catch(() => {})
                }
              } catch (error) {
                // Without this the handler died silently and the run just sat on a prompt.
                try {
                  const ports = await allBridgePorts()
                  if (ports.length > 0) {
                    await callPort(ports[0], "/approval-mode/hook-error", {
                      method: "POST",
                      body: JSON.stringify({ message: String((error && error.message) || error) }),
                    })
                  }
                } catch (ignored) { /* nothing left to report to */ }
              }
            },
            // Kept for the OpenCode build that starts dispatching it. Harmless meanwhile: when it
            // does fire and allows, no `permission.asked` event follows, so the two cannot collide.
            "permission.ask": async (input, output) => {
              try {
                const { decision, ownerPort } = await resolveApproval(input.sessionID, input.type)
                if (decision && typeof decision.status === "string") {
                  output.status = decision.status
                  if (decision.status === "ask" && input.sessionID && ownerPort) {
                    await callPort(ownerPort, "/approval-mode/pending", {
                      method: "POST",
                      body: JSON.stringify({ sessionID: input.sessionID, pending: true }),
                    }).catch(() => {})
                  }
                }
              } catch (error) {
                // An empty catch here made a hook that fires-and-fails indistinguishable from one
                // that never fires at all. Report the failure so the Plugins page can say which.
                try {
                  const ports = await allBridgePorts()
                  if (ports.length > 0) {
                    await callPort(ports[0], "/approval-mode/hook-error", {
                      method: "POST",
                      body: JSON.stringify({ message: String((error && error.message) || error) }),
                    })
                  }
                } catch (ignored) {
                  // Nothing left to report to.
                }
              }
            },
            "experimental.chat.system.transform": async (input, output) => {
              if (!input.sessionID) return
              // No owning project means this session belongs to an OpenCode running outside IDEA,
              // and it must not be told it has an IDE.
              const owner = await ownerOfSession(input.sessionID)
              if (owner) output.system.push(ideaSystemPrompt(owner.path))
            },
            tool: {
              idea_run_configuration: tool({
                description:
                  "IntelliJ Run/Debug configurations. Use instead of guessing a shell command: it runs the " +
                  "user's own configuration, with their env, JVM args and working directory, and the output " +
                  "lands in IDEA's Run window. " +
                  "Without id: returns [{ id, name, type, folder, temporary }] - id is what you pass back. " +
                  "With id (plus optional mode 'run' or 'debug', default 'run'): starts it and returns " +
                  "{ success, message }. Starting is asynchronous - read the output with idea_read_run_log.",
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
                description:
                  "Console output of runs started through IDEA (Run, Debug, Maven, Gradle). Use after " +
                  "idea_run_configuration, idea_maven or idea_gradle, and to inspect a run the user started " +
                  "themselves. " +
                  "Returns { success, logs: [{ id, configurationID, name, executor, running, exitCode, " +
                  "startedAt, completedAt, text }] }; running=true means it is still going, so poll again. " +
                  "text is ANSI-stripped and capped at the most recent ~1M characters.",
                args: { configurationID: tool.schema.string().optional() },
                async execute(args, context) {
                  await authorize(context, "idea_read_run_log", args.configurationID ?? "*")
                  const query = args.configurationID ? `?configurationID=${'$'}{encodeURIComponent(args.configurationID)}` : ""
                  return call(`/ide/logs${'$'}{query}`)
                },
              }),
              idea_project_context: tool({
                description:
                  "IDEA's live project model. Use before assuming a layout from paths - it reflects the real " +
                  "module graph, including generated, excluded and library roots that are invisible on disk. " +
                  "Takes no arguments. Returns { success, projectName, basePath, sdk, sdkVersion, " +
                  "modules: [{ name, sdk, contentRoots[], sourceRoots[], dependencies[] }], openFiles[], " +
                  "currentFile }.",
                args: {},
                async execute(_args, context) {
                  await authorize(context, "idea_project_context")
                  return call("/ide/project-context")
                },
              }),
              idea_editor_context: tool({
                description:
                  "What the user is looking at right now, or any file through IDEA's document model. Use when " +
                  "they say 'this method' or 'here' without naming a file, and to read a file with unsaved " +
                  "editor changes - this sees the buffer, a plain file read does not. " +
                  "Args: path, line, contextLines (default 40); all optional, empty means the active editor. " +
                  "Returns { success, path, language, line, column, lineCount, selectionStartLine, " +
                  "selectionEndLine, selectedText, contextStartLine, contextEndLine, context }. " +
                  "Lines are one-based.",
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
                  "IDEA's own inspections and compiler highlights for a file - the same squiggles the user " +
                  "sees. Use to check your edit before claiming it compiles, instead of running a full build. " +
                  "Args: path (default active file), minSeverity 'error', 'warning', 'weak_warning' or " +
                  "'info' (default 'warning'), limit (default 200). " +
                  "Returns { success, path, analysisComplete, diagnostics: [{ severity, description, line, " +
                  "column, endLine, endColumn, inspectionId }] }. " +
                  "analysisComplete=false means IDEA is still indexing, so the list may be short - retry.",
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
                  "Resolve the symbol at a position and find its usages through IDEA's indexes. Far more " +
                  "accurate than grep: it follows imports, overloads and inheritance, and ignores comments " +
                  "and strings. " +
                  "Args: path (default active file), line (required, one-based), column (default 1), " +
                  "action 'references' or 'implementations' (default 'references'), limit (default 100). " +
                  "Returns { success, symbol, definition: { path, line, column, name, kind, preview }, " +
                  "results: [same shape] }.",
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
                description:
                  "Scroll the user's editor to a location. Purely a UI action for their benefit - it returns " +
                  "no file content, so use idea_editor_context to read code. Good when pointing out where a " +
                  "problem is. " +
                  "Args: path (required), line (default 1), column (default 1), one-based. " +
                  "Returns { success, message }.",
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
                description:
                  "Make IDEA notice changes made outside its editor. Call after creating, deleting or " +
                  "rewriting files with shell or file tools, otherwise the user keeps seeing stale content " +
                  "and stale inspections. Not needed after edits made through IDEA's own tools. " +
                  "Takes no arguments. Returns { success, message }.",
                args: {},
                async execute(_args, context) {
                  await authorize(context, "idea_refresh_project")
                  return call("/ide/refresh", { method: "POST", body: "{}" })
                },
              }),
              idea_maven: tool({
                description:
                  "Maven through IDEA's own runner, so it uses the project's configured Maven home, profiles " +
                  "and settings.xml, and the output lands in the Maven tool window. Requires pom.xml in the " +
                  "project root and the Maven plugin enabled. " +
                  "Args: tasks - goals as an array, e.g. ['clean','test']. " +
                  "Returns { success, message }; it starts asynchronously, so read the result with " +
                  "idea_read_run_log.",
                args: { tasks: tool.schema.array(tool.schema.string()) },
                async execute(args, context) {
                  await authorize(context, "idea_maven", args.tasks.join(" "))
                  return call("/ide/maven", { method: "POST", body: JSON.stringify({ tasks: args.tasks }) })
                },
              }),
              idea_gradle: tool({
                description:
                  "Gradle through IDEA's external build system, so it reuses the project's JDK, daemon and " +
                  "linked Gradle settings. Requires the Gradle plugin enabled. " +
                  "Args: tasks - task names as an array, e.g. ['clean','build']. " +
                  "Returns { success, message }; it starts asynchronously, so read the result with " +
                  "idea_read_run_log.",
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
                  "screenshot, openDevTools. " +
                  "Returns { success, action, result, message, status: { browserOpen, currentUrl, " +
                  "scriptBridgeReady, screenshotAvailable, picks[] }, picks[] }. " +
                  "Each pick is { id, selector, tagName, text, outerHtml, rect, url, comment } - the comment " +
                  "is what the user wrote about that element and the selector traces back to your source.",
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
