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
    val installed: Boolean,
    val location: String,
    val mavenAvailable: Boolean,
    val gradleAvailable: Boolean,
)


private const val MAVEN_PLUGIN_ID = "org.jetbrains.idea.maven"
private const val GRADLE_PLUGIN_ID = "com.intellij.gradle"
private val GRADLE_SYSTEM_ID = ProjectSystemId("GRADLE")

/** Shared across projects: the bridge file is global, so removal waits for the last one to close. */
private val openProjects = java.util.concurrent.atomic.AtomicInteger(0)

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
        val file = bridgeFile()
        return IdeaBridgeStatus(
            installed = Files.isRegularFile(file),
            location = file.toString(),
            mavenAvailable = pluginEnabled(MAVEN_PLUGIN_ID),
            gradleAvailable = pluginEnabled(GRADLE_PLUGIN_ID),
        )
    }

    /**
     * Installs the bridge while an IDEA project is open and removes it when the last one closes,
     * so OpenCode sessions started outside IDEA never see the `idea_*` tools. A user who disabled
     * the plugin from the Plugins page (renaming it to `.ts.disabled`) is left alone.
     */
    fun activateBridge(frontendPort: Int) = runCatching {
        publishBridgePort(frontendPort)
        if (Files.exists(disabledBridgeFile())) return@runCatching
        val file = bridgeFile()
        Files.createDirectories(file.parent)
        Files.writeString(file, bridgePluginSource())
        openProjects.incrementAndGet()
    }.getOrElse { logger.info("Unable to install the IDEA bridge: ${it.message}") }

    fun deactivateBridge() = runCatching {
        if (openProjects.decrementAndGet() > 0) return@runCatching
        Files.deleteIfExists(bridgeFile())
    }.getOrElse { logger.info("Unable to remove the IDEA bridge: ${it.message}") }

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

        export const CapybaraIdea = async ({ directory }) => {
          const request = async (prefix, route, init = {}) => {
            const port = (await fs.readFile(path.join(directory, ".idea", "capybara-ai-port"), "utf8")).trim()
            const response = await fetch(`http://127.0.0.1:${'$'}{port}${'$'}{prefix}${'$'}{route}`, {
              headers: { "content-type": "application/json" },
              ...init,
            })
            const text = await response.text()
            if (!response.ok) throw new Error(text || `IDEA bridge failed: ${'$'}{response.status}`)
            return text
          }
          const call = (route, init) => request("/api", route, init)
          // The built-in browser shares the same HTTP server; only the path prefix differs.
          const browser = (body) =>
            request("/browser", "/control", { method: "POST", body: JSON.stringify(body) })
          return {
            // OpenCode 1.18.x accepts `permission` on PATCH /session and PATCH /config, returns
            // 200, then discards it — so the composer's approval mode is enforced here instead.
            // If the IDEA server is unreachable we leave OpenCode's own decision untouched.
            "permission.ask": async (input, output) => {
              try {
                const text = await request(
                  "/api",
                  `/approval-mode/decide?sessionID=${'$'}{encodeURIComponent(input.sessionID || "")}` +
                    `&type=${'$'}{encodeURIComponent(input.type || "")}`,
                )
                const decision = JSON.parse(text)
                if (decision && typeof decision.status === "string") {
                  output.status = decision.status
                }
              } catch (error) {
                // IDEA closed or the server moved: fall back to OpenCode's default handling.
              }
            },
            tool: {
              idea_run_configuration: tool({
                description: "List or start an IntelliJ IDEA Run/Debug configuration for the current project.",
                args: {
                  id: tool.schema.string().optional(),
                  mode: tool.schema.enum(["run", "debug"]).optional(),
                },
                async execute(args) {
                  if (!args.id) return call("/ide/run-configurations")
                  return call("/ide/run", { method: "POST", body: JSON.stringify({ id: args.id, mode: args.mode ?? "run" }) })
                },
              }),
              idea_read_run_log: tool({
                description: "Read recent IntelliJ IDEA Run, Debug, Maven, or Gradle console output.",
                args: { configurationID: tool.schema.string().optional() },
                async execute(args) {
                  const query = args.configurationID ? `?configurationID=${'$'}{encodeURIComponent(args.configurationID)}` : ""
                  return call(`/ide/logs${'$'}{query}`)
                },
              }),
              idea_maven: tool({
                description: "Run Maven goals through IntelliJ IDEA's native Maven runner.",
                args: { tasks: tool.schema.array(tool.schema.string()) },
                async execute(args) {
                  return call("/ide/maven", { method: "POST", body: JSON.stringify({ tasks: args.tasks }) })
                },
              }),
              idea_gradle: tool({
                description: "Run Gradle tasks through IntelliJ IDEA's native Gradle runner.",
                args: { tasks: tool.schema.array(tool.schema.string()) },
                async execute(args) {
                  return call("/ide/gradle", { method: "POST", body: JSON.stringify({ tasks: args.tasks }) })
                },
              }),
              idea_browser: tool({
                description:
                  "Control the Capybara built-in browser window inside IntelliJ IDEA. " +
                  "Call action 'status' first: if browserOpen is false, ask the user to open it via " +
                  "Tools > 打开水豚浏览器. Actions: status, navigate, click, getText, getHtml, type, " +
                  "waitFor, executeScript, listenSSE, openDevTools. 'screenshot' also needs the CEF debug port.",
                args: {
                  action: tool.schema.enum([
                    "status",
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
                  ]),
                  url: tool.schema.string().optional(),
                  selector: tool.schema.string().optional(),
                  script: tool.schema.string().optional(),
                  text: tool.schema.string().optional(),
                  timeoutMs: tool.schema.number().optional(),
                  maxEvents: tool.schema.number().optional(),
                },
                async execute(args) {
                  return browser(args)
                },
              }),
            },
          }
        }
    """.trimIndent()
}
