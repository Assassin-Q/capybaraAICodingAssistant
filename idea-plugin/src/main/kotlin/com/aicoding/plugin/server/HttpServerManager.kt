package com.aicoding.plugin.server

import com.aicoding.plugin.services.ApprovalDecision
import com.aicoding.plugin.services.ApprovalHookErrorRequest
import com.aicoding.plugin.services.ApprovalModeRequest
import com.aicoding.plugin.services.ApprovalModeResponse
import com.aicoding.plugin.services.ApprovalModeService
import com.aicoding.plugin.services.BrowserControlRequest
import com.aicoding.plugin.services.BrowserControlResponse
import com.aicoding.plugin.services.BrowserControlService
import com.aicoding.plugin.services.ChatMessage
import com.aicoding.plugin.services.DevelopmentEnvironmentsRequest
import com.aicoding.plugin.services.GitCommitDialogRequest
import com.aicoding.plugin.services.GitFileDiffRequest
import com.aicoding.plugin.services.FileAttachRequest
import com.aicoding.plugin.services.FrontendLogRequest
import com.aicoding.plugin.services.FrontendLogService
import com.aicoding.plugin.services.FileSearchRequest
import com.aicoding.plugin.services.GitStatusService
import com.aicoding.plugin.services.IdeaFileSearchService
import com.aicoding.plugin.services.IdeThemeMappingRequest
import com.aicoding.plugin.services.IdeThemeRequest
import com.aicoding.plugin.services.IdeThemeService
import com.aicoding.plugin.services.IdeaBuildRequest
import com.aicoding.plugin.services.IdeaBridgeToggleRequest
import com.aicoding.plugin.services.IdeaDiffFileRequest
import com.aicoding.plugin.services.IdeaDiffService
import com.aicoding.plugin.services.IdeaExecutionService
import com.aicoding.plugin.services.IdeaDiagnosticRequest
import com.aicoding.plugin.services.IdeaEditorContextRequest
import com.aicoding.plugin.services.IdeaInlineDiffRequest
import com.aicoding.plugin.services.IdeaInsightService
import com.aicoding.plugin.services.IdeaNavigateRequest
import com.aicoding.plugin.services.IdeaRunConfigurationRequest
import com.aicoding.plugin.services.IdeaSymbolRequest
import com.aicoding.plugin.services.LineRange
import com.aicoding.plugin.services.MemorySettingsRequest
import com.aicoding.plugin.services.MemorySystemService
import com.aicoding.plugin.services.MessageService
import com.aicoding.plugin.services.OpenCodeEndpoint
import com.aicoding.plugin.services.OpenCodeServerManager
import com.aicoding.plugin.services.OpenCodeSnapshotDiffRequest
import com.aicoding.plugin.services.OpenCodeSnapshotDiffService
import com.aicoding.plugin.services.OpenCodeConfigService
import com.aicoding.plugin.services.PluginFileRequest
import com.aicoding.plugin.services.PluginImportRequest
import com.aicoding.plugin.services.PluginLocationRequest
import com.aicoding.plugin.services.PluginManagementService
import com.aicoding.plugin.services.RemoveProviderRequest
import com.aicoding.plugin.services.SaveProviderRequest
import com.aicoding.plugin.services.SkillHubDetailRequest
import com.aicoding.plugin.services.SkillHubDetailService
import com.aicoding.plugin.services.SkillHubFileRequest
import com.aicoding.plugin.services.SkillHubInstallRequest
import com.aicoding.plugin.services.SkillHubSearchRequest
import com.aicoding.plugin.services.SkillImportRequest
import com.aicoding.plugin.services.SkillLocationRequest
import com.aicoding.plugin.services.SkillManagementService
import com.intellij.ide.ui.LafManagerListener
import com.intellij.ide.projectView.ProjectView
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.util.ui.UIUtil
import com.intellij.util.messages.MessageBusConnection
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.OutputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@Serializable
private data class ProjectPathResponse(val path: String?)

@Serializable
private data class HealthResponse(val healthy: Boolean, val port: Int)

@Serializable
private data class ReloadResponse(val success: Boolean)

@Serializable
private data class SaveFileRequest(val filename: String, val content: String)

@Serializable
private data class SaveFileResponse(val saved: Boolean, val path: String? = null)

@Serializable
private data class MemoryInstallRequest(val force: Boolean = false)

@Serializable
private data class MemoryScanRequest(val sync: Boolean = true)

@Serializable
private data class IdeContextEvent(
    val id: Long,
    val type: String,
    val content: String,
    val kind: String? = null,
    val fileName: String? = null,
    val lineRange: LineRange? = null,
    val timestamp: Long,
)

@Serializable
private data class IdeThemeEvent(val theme: String)

@Serializable
private data class BranchChangedEvent(val from: String, val to: String)

@Serializable
private data class RestartRequest(val force: Boolean = false)

@Serializable
private data class ApprovalPendingRequest(val sessionID: String, val pending: Boolean = true)

@Serializable
private data class ApprovalPendingEvent(val sessions: List<String>)

class HttpServerManager(private val project: Project) {
    init {
        // The panel owns the instance; services only need a way to reach broadcastSse.
        active[project] = this
    }

    private val json = Json { encodeDefaults = false; ignoreUnknownKeys = true }

    /**
     * Responses always carry every field, including defaults.
     *
     * Dropping them has broken the client four separate times: an empty `files` list made
     * `status.files.length` throw and took down the whole panel, `page` of 1 vanished and turned
     * paging into NaN, and a `success` of true read as undefined. The client cannot distinguish
     * "absent because it equals the default" from "absent because something went wrong", so the
     * wire format stops asking it to. `json` above keeps the old behaviour for reads and for the
     * config files, where emitting defaults would write keys the user never set.
     */
    private val responseJson = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val messageService = project.getService(MessageService::class.java)
    private val openCodeServer = OpenCodeServerManager(project.basePath)
    private val memorySystem = MemorySystemService(project, openCodeServer)
    private val ideaDiffService = IdeaDiffService(project)
    private val snapshotDiffService = OpenCodeSnapshotDiffService()
    private val skillService = SkillManagementService(project)
    private val skillHubDetailService = project.getService(SkillHubDetailService::class.java)
    private val pluginService = PluginManagementService(project)
    private val executionService = IdeaExecutionService(project)
    private val insightService = IdeaInsightService(project)
    private val fileSearchService = IdeaFileSearchService(project)
    private val frontendLogService = FrontendLogService()
    private val approvalModeService = project.getService(ApprovalModeService::class.java)
    private val browserService = project.getService(BrowserControlService::class.java)
    private val gitStatusService = project.getService(GitStatusService::class.java)
    private val openCodeConfigService = project.getService(OpenCodeConfigService::class.java)
    private var branchWatcher: java.util.concurrent.ScheduledExecutorService? = null
    private val sseClients = CopyOnWriteArrayList<OutputStream>()
    private var server: HttpServer? = null
    private var executor: ExecutorService? = null
    private var lafConnection: MessageBusConnection? = null
    private var projectPath: String? = project.basePath
    private var port = 0
    private var openCodeEndpoint = OpenCodeEndpoint(projectPath = project.basePath)

    private val lafManagerListener = LafManagerListener {
        val theme = currentIdeaTheme()
        openCodeEndpoint = openCodeEndpoint.copy(ideaTheme = theme)
        broadcastSse("ide.theme", responseJson.encodeToString(IdeThemeEvent(theme)))
    }

    private val messageListener: (ChatMessage) -> Unit = { message ->
        broadcastSse("chat_message", responseJson.encodeToString(message.toEvent()))
    }

    fun start() {
        if (server != null) {
            return
        }

        val createdServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        createdServer.createContext("/api", ApiHandler())
        // Shares this server and port — the built-in browser never opens one of its own.
        createdServer.createContext("/browser", BrowserHandler())
        createdServer.createContext("/", StaticHandler())
        executor = Executors.newCachedThreadPool()
        createdServer.executor = executor
        createdServer.start()
        server = createdServer
        port = createdServer.address.port
        updateRegistry(register = true)
        // OpenCode discovers plugins only during startup, so publish the bridge before probing
        // or launching the service. This makes the first plugin-managed launch usable immediately.
        executionService.activateBridge(port)
        openCodeEndpoint = runCatching {
            openCodeServer.start(port)
        }.getOrElse { error ->
            OpenCodeEndpoint(
                projectPath = projectPath,
                error = error.message ?: "无法启动或发现 OpenCode 服务。",
            )
        }.copy(
            frontendPort = port,
            ideaTheme = currentIdeaTheme(),
        )
        lafConnection = ApplicationManager.getApplication().messageBus.connect().also { connection ->
            connection.subscribe(LafManagerListener.TOPIC, lafManagerListener)
        }
        messageService.addListener(messageListener)
        startBranchWatcher()
        executor?.execute {
            runCatching { memorySystem.ensureDefaultInstalled() }
                .onFailure { error -> println("Memory system initialization failed: ${error.message}") }
        }
        println("Capybara frontend server started on http://127.0.0.1:$port")
    }

    /**
     * Registry of every plugin server currently running, keyed by project path.
     *
     * The bridge plugin is installed globally and binds its `directory` once, so with one OpenCode
     * process serving several IDEA projects it can only find one port file. This file lets it
     * reach all of them and ask which one owns the session.
     */
    private fun registryFile(): File =
        File(System.getProperty("user.home"), ".config/opencode/capybara-ports.json")

    private fun updateRegistry(register: Boolean) {
        runCatching {
            val path = projectPath ?: return
            val file = registryFile()
            file.parentFile?.mkdirs()
            val current = runCatching {
                (json.parseToJsonElement(file.readText()) as? kotlinx.serialization.json.JsonObject)
                    ?.mapValues { it.value.toString().trim('"') }
                    ?.toMutableMap()
            }.getOrNull() ?: mutableMapOf()
            if (register) current[path] = port.toString() else current.remove(path)
            file.writeText(
                current.entries.joinToString(",", "{", "}") { (key, value) ->
                    "\"${key.replace("\\", "\\\\").replace("\"", "\\\"")}\":\"$value\""
                }
            )
        }
    }

    fun stop() {
        updateRegistry(register = false)
        messageService.removeListener(messageListener)
        lafConnection?.disconnect()
        lafConnection = null
        openCodeServer.stop()
        ideaDiffService.dispose()
        branchWatcher?.shutdownNow()
        branchWatcher = null
        executionService.deactivateBridge()
        Disposer.dispose(executionService)
        sseClients.forEach { output ->
            runCatching { output.close() }
        }
        sseClients.clear()
        server?.stop(0)
        executor?.shutdownNow()
        executor = null
        server = null
        port = 0
    }

    fun getPort(): Int = port

    private fun currentIdeaTheme(): String = if (UIUtil.isUnderDarcula()) "dark" else "light"

    fun setProjectPath(projectPath: String) {
        this.projectPath = projectPath
    }

    private fun ChatMessage.toEvent(): IdeContextEvent = IdeContextEvent(
        id = id,
        type = type,
        content = content,
        kind = kind,
        fileName = fileName,
        lineRange = lineRange,
        timestamp = timestamp,
    )

    private inner class ApiHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            if (exchange.requestMethod == "OPTIONS") {
                writeResponse(exchange, 204, "", "application/json")
                return
            }

            try {
                when {
                    exchange.requestURI.path == "/api/project-path" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, ProjectPathResponse(projectPath))
                    exchange.requestURI.path == "/api/opencode-info" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, openCodeEndpoint)
                    exchange.requestURI.path == "/api/opencode/restart" && exchange.requestMethod == "POST" ->
                        handleRestartOpenCode(exchange)
                    exchange.requestURI.path == "/api/opencode/remove-provider" && exchange.requestMethod == "POST" ->
                        writeJson(exchange, 200, openCodeConfigService.removeProvider(body<RemoveProviderRequest>(exchange)))
                    exchange.requestURI.path == "/api/events" && exchange.requestMethod == "GET" ->
                        handleSse(exchange)
                    exchange.requestURI.path == "/api/reload" && exchange.requestMethod == "POST" ->
                        handleReload(exchange)
                    exchange.requestURI.path == "/api/save-file" && exchange.requestMethod == "POST" ->
                        handleSaveFile(exchange)
                    exchange.requestURI.path == "/api/diff/open" && exchange.requestMethod == "POST" ->
                        handleOpenDiff(exchange)
                    exchange.requestURI.path == "/api/diff/snapshot" && exchange.requestMethod == "POST" ->
                        handleSnapshotDiff(exchange)
                    exchange.requestURI.path == "/api/diff/inline" && exchange.requestMethod == "POST" ->
                        handleInlineDiff(exchange)
                    exchange.requestURI.path == "/api/diff/inline" && exchange.requestMethod == "DELETE" ->
                        writeJson(exchange, 200, ideaDiffService.clearInline())
                    exchange.requestURI.path == "/api/memory/status" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, memorySystem.status())
                    exchange.requestURI.path == "/api/memory/install" && exchange.requestMethod == "POST" ->
                        handleMemoryInstall(exchange)
                    exchange.requestURI.path == "/api/memory/settings" && exchange.requestMethod == "POST" ->
                        handleMemorySettings(exchange)
                    exchange.requestURI.path == "/api/memory/scan" && exchange.requestMethod == "POST" ->
                        handleMemoryScan(exchange)
                    exchange.requestURI.path == "/api/memory/environments" && exchange.requestMethod == "POST" ->
                        handleMemoryEnvironments(exchange)
                    exchange.requestURI.path == "/api/memory/memories" && exchange.requestMethod == "GET" ->
                        writeResponse(
                            exchange,
                            200,
                            memorySystem.listMemories(exchange.requestURI.rawQuery),
                            "application/json; charset=utf-8",
                        )
                    exchange.requestURI.path == "/api/memory/memories" && exchange.requestMethod == "POST" ->
                        handleAddMemory(exchange)
                    exchange.requestURI.path.startsWith("/api/memory/memories/") && exchange.requestMethod == "DELETE" ->
                        handleDeleteMemory(exchange)
                    exchange.requestURI.path == "/api/memory/profile" && exchange.requestMethod == "GET" ->
                        writeResponse(exchange, 200, memorySystem.userProfile(), "application/json; charset=utf-8")
                    exchange.requestURI.path == "/api/memory/profile/refresh" && exchange.requestMethod == "POST" ->
                        writeResponse(exchange, 200, memorySystem.refreshUserProfile(), "application/json; charset=utf-8")
                    exchange.requestURI.path == "/api/memory/dashboard" && exchange.requestMethod == "POST" ->
                        writeJson(exchange, 200, memorySystem.openDashboard())
                    exchange.requestURI.path == "/api/health" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, HealthResponse(true, port))
                    exchange.requestURI.path == "/api/server-info" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, HealthResponse(true, port))
                    exchange.requestURI.path == "/api/opencode/save-provider" && exchange.requestMethod == "POST" ->
                        writeJson(exchange, 200, openCodeConfigService.saveProvider(body<SaveProviderRequest>(exchange)))
                    exchange.requestURI.path.startsWith("/api/approval-mode") -> handleApprovalMode(exchange)
                    exchange.requestURI.path.startsWith("/api/skills") -> handleSkills(exchange)
                    exchange.requestURI.path.startsWith("/api/plugins") -> handlePlugins(exchange)
                    exchange.requestURI.path.startsWith("/api/git/") -> handleGit(exchange)
                    exchange.requestURI.path.startsWith("/api/ide/") -> handleIde(exchange)
                    else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
                }
            } catch (error: Exception) {
                println("Frontend API request failed: ${error.message}")
                writeResponse(exchange, 500, "Internal server error", "text/plain; charset=utf-8")
            }
        }
    }

    /** `POST /browser/control` and `GET /browser/status`, served on the existing port. */
    private inner class BrowserHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            if (exchange.requestMethod == "OPTIONS") {
                writeResponse(exchange, 204, "", "application/json")
                return
            }
            try {
                when {
                    exchange.requestURI.path == "/browser/control" && exchange.requestMethod == "POST" ->
                        writeJson(exchange, 200, browserService.control(body<BrowserControlRequest>(exchange)))
                    exchange.requestURI.path == "/browser/status" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, browserService.status())
                    else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
                }
            } catch (error: Exception) {
                writeJson(
                    exchange,
                    200,
                    BrowserControlResponse(
                        success = false,
                        message = error.message ?: "浏览器指令解析失败",
                    ),
                )
            }
        }
    }

    private inner class StaticHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            if (exchange.requestMethod != "GET" && exchange.requestMethod != "HEAD") {
                exchange.responseHeaders.add("Allow", "GET, HEAD")
                writeResponse(exchange, 405, "Method not allowed", "text/plain; charset=utf-8")
                return
            }

            val requestPath = URLDecoder.decode(exchange.requestURI.path, Charsets.UTF_8)
            val safePath = requestPath.takeUnless { it.contains("..") } ?: "/"
            val isSpaRoute = safePath == "/" ||
                (!safePath.startsWith("/assets/") && !safePath.substringAfterLast('/').contains('.'))
            val resourcePath = "static${if (safePath == "/") "/index.html" else safePath}"
            val resource = javaClass.classLoader.getResourceAsStream(resourcePath)
                ?: if (isSpaRoute) javaClass.classLoader.getResourceAsStream("static/index.html") else null

            if (resource == null) {
                // A missing index.html means the plugin jar has no bundled frontend, which used to
                // surface as a bare "404" in the tool window with no way to tell why.
                val indexMissing = javaClass.classLoader.getResource("static/index.html") == null
                val detail = if (indexMissing) {
                    "插件包内没有前端资源（static/index.html 缺失）。请重新执行 gradle buildPlugin 并重新安装插件。"
                } else {
                    "找不到前端资源：$resourcePath"
                }
                println("Capybara static asset missing: $resourcePath (indexMissing=$indexMissing)")
                writeResponse(exchange, 404, detail, "text/plain; charset=utf-8")
                return
            }

            val contentType = contentType(if (safePath == "/") "/index.html" else safePath)
            // index.html lives at a fixed URL and points at content-hashed bundles, so a cached
            // copy pins the whole UI to an old build — reinstalling the plugin changes nothing
            // because the cache lives in JCEF's profile, not in the jar. Assets carry a hash in
            // their name, so they are safe to cache forever.
            if (safePath.startsWith("/assets/")) {
                exchange.responseHeaders.add("Cache-Control", "public, max-age=31536000, immutable")
            } else {
                exchange.responseHeaders.add("Cache-Control", "no-store, must-revalidate")
                exchange.responseHeaders.add("Pragma", "no-cache")
            }
            resource.use {
                val body = it.readBytes()
                if (exchange.requestMethod == "HEAD") {
                    exchange.responseHeaders.add("Content-Type", contentType)
                    exchange.responseHeaders.add("Content-Length", body.size.toString())
                    exchange.sendResponseHeaders(200, -1)
                    exchange.close()
                } else {
                    writeResponse(exchange, 200, body, contentType)
                }
            }
        }
    }

    private fun handleReload(exchange: HttpExchange) {
        val refresh = Runnable {
            VirtualFileManager.getInstance().syncRefresh()
            ProjectView.getInstance(project).refresh()
        }
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) refresh.run() else application.invokeAndWait(refresh)
        writeJson(exchange, 200, ReloadResponse(true))
    }

    private fun handleSaveFile(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<SaveFileRequest>(input.readText())
        }
        val filename = request.filename.substringAfterLast('/').substringAfterLast('\\').ifBlank { "conversation.md" }
        var target: File? = null
        val chooseTarget = Runnable {
            val descriptor = FileSaverDescriptor("保存对话", "选择文件保存位置")
            val dialog = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
            val projectDirectory = project.basePath?.let { path ->
                LocalFileSystem.getInstance().findFileByPath(path)
            }
            target = dialog.save(projectDirectory, filename)?.file
        }
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) chooseTarget.run() else application.invokeAndWait(chooseTarget)
        val file = target
        if (file == null) {
            writeJson(exchange, 200, SaveFileResponse(saved = false))
            return
        }
        file.parentFile?.mkdirs()
        file.writeText(request.content, Charsets.UTF_8)
        VirtualFileManager.getInstance().asyncRefresh(null)
        writeJson(exchange, 200, SaveFileResponse(saved = true, path = file.absolutePath))
    }

    private fun handleOpenDiff(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<IdeaDiffFileRequest>(input.readText())
        }
        writeJson(exchange, 200, ideaDiffService.open(request))
    }

    private fun handleSnapshotDiff(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<OpenCodeSnapshotDiffRequest>(input.readText())
        }
        writeJson(exchange, 200, snapshotDiffService.diff(request))
    }

    private fun handleInlineDiff(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<IdeaInlineDiffRequest>(input.readText())
        }
        writeJson(exchange, 200, ideaDiffService.applyInline(request))
    }

    private fun handleMemoryInstall(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
        val request = body.takeIf { it.isNotBlank() }
            ?.let { json.decodeFromString<MemoryInstallRequest>(it) }
            ?: MemoryInstallRequest()
        writeJson(exchange, 200, memorySystem.installDefault(request.force))
    }

    private fun handleMemorySettings(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<MemorySettingsRequest>(input.readText())
        }
        writeJson(exchange, 200, memorySystem.updateSettings(request))
    }

    private fun handleMemoryScan(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
        val request = body.takeIf { it.isNotBlank() }
            ?.let { json.decodeFromString<MemoryScanRequest>(it) }
            ?: MemoryScanRequest()
        writeJson(exchange, 200, memorySystem.scanEnvironments(request.sync))
    }

    private fun handleMemoryEnvironments(exchange: HttpExchange) {
        val request = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { input ->
            json.decodeFromString<DevelopmentEnvironmentsRequest>(input.readText())
        }
        writeJson(exchange, 200, memorySystem.updateEnvironments(request))
    }

    private fun handleAddMemory(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
        writeResponse(exchange, 200, memorySystem.addMemory(body), "application/json; charset=utf-8")
    }

    private fun handleDeleteMemory(exchange: HttpExchange) {
        val id = exchange.requestURI.path.substringAfterLast('/')
        writeResponse(exchange, 200, memorySystem.deleteMemory(id), "application/json; charset=utf-8")
    }

    private fun handleRestartOpenCode(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
        val force = body.takeIf { it.isNotBlank() }
            ?.let { runCatching { json.decodeFromString<RestartRequest>(it).force }.getOrDefault(false) }
            ?: false
        openCodeEndpoint = runCatching {
            openCodeServer.restart(port, force)
        }.getOrElse { error ->
            OpenCodeEndpoint(
                projectPath = projectPath,
                error = error.message ?: "无法重启 OpenCode 服务。",
            )
        }.copy(
            frontendPort = port,
            ideaTheme = currentIdeaTheme(),
        )
        // Lets any other connected view refresh without polling.
        broadcastSse("opencode.restarted", responseJson.encodeToString(openCodeEndpoint))
        writeJson(exchange, 200, openCodeEndpoint)
    }

    private inline fun <reified T> body(exchange: HttpExchange): T =
        exchange.requestBody.bufferedReader(Charsets.UTF_8).use { json.decodeFromString<T>(it.readText()) }

    private fun queryParam(exchange: HttpExchange, name: String): String? = exchange.requestURI.rawQuery
        ?.split('&')
        ?.firstOrNull { it.startsWith("$name=") }
        ?.substringAfter('=')
        ?.let { URLDecoder.decode(it, Charsets.UTF_8) }

    /**
     * Enforcement entry point for the OpenCode `permission.ask` hook.
     *
     * OpenCode discards the `permission` payload sent to `PATCH /session` and `PATCH /config`
     * (verified against 1.18.12: 200 back, nothing applied), so the mode has to be enforced here.
     */
    private fun handleApprovalMode(exchange: HttpExchange) {
        val route = exchange.requestURI.path.removePrefix("/api/approval-mode").substringBefore('?')
        val method = exchange.requestMethod
        when {
            route == "/rules" && method == "GET" -> writeJson(exchange, 200, approvalModeService.rules())
            route == "/pending" && method == "GET" ->
                writeJson(exchange, 200, ApprovalPendingEvent(approvalModeService.pendingSessions()))
            route == "/pending" && method == "POST" -> {
                val request = body<ApprovalPendingRequest>(exchange)
                if (approvalModeService.setPending(request.sessionID, request.pending)) {
                    broadcastSse(
                        "approval.pending",
                        responseJson.encodeToString(ApprovalPendingEvent(approvalModeService.pendingSessions())),
                    )
                }
                writeJson(exchange, 200, ApprovalPendingEvent(approvalModeService.pendingSessions()))
            }
            route == "/decide" && method == "GET" -> {
                val sessionID = queryParam(exchange, "sessionID").orEmpty()
                val type = queryParam(exchange, "type").orEmpty()
                writeJson(
                    exchange,
                    200,
                    ApprovalDecision(
                        status = approvalModeService.decide(sessionID, type),
                        known = approvalModeService.knows(sessionID),
                    ),
                )
            }
            route == "/hook-error" && method == "POST" -> {
                // A hook that fires and then throws used to be indistinguishable from one that never
                // fires, because the bridge's catch was empty. Now the failure has somewhere to go.
                approvalModeService.recordHookError(body<ApprovalHookErrorRequest>(exchange).message)
                writeJson(exchange, 200, ApprovalPendingEvent(approvalModeService.pendingSessions()))
            }
            route == "" && method == "GET" -> {
                val sessionID = queryParam(exchange, "sessionID").orEmpty()
                // Reading a session's mode claims it for this project, which is how the bridge
                // knows where to route its approvals and its IDEA system prompt.
                writeJson(exchange, 200, ApprovalModeResponse(sessionID, approvalModeService.claim(sessionID)))
            }
            route == "" && method == "POST" -> {
                val request = body<ApprovalModeRequest>(exchange)
                val mode = approvalModeService.set(request.sessionID, request.mode)
                writeJson(exchange, 200, ApprovalModeResponse(request.sessionID, mode))
            }
            else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
        }
    }

    private fun handleSkills(exchange: HttpExchange) {
        val route = exchange.requestURI.path.removePrefix("/api/skills")
        val method = exchange.requestMethod
        when {
            route == "" && method == "GET" -> writeJson(exchange, 200, skillService.list())
            route == "/import" && method == "POST" ->
                writeJson(exchange, 200, skillService.import(body<SkillImportRequest>(exchange)))
            route == "/enabled" && method == "POST" ->
                writeJson(exchange, 200, skillService.setEnabled(body<SkillLocationRequest>(exchange)))
            route == "/delete" && method == "POST" ->
                writeJson(exchange, 200, skillService.delete(body<SkillLocationRequest>(exchange)))
            route == "/hub/status" && method == "GET" -> writeJson(exchange, 200, skillService.skillHubStatus())
            route == "/hub/search" && method == "POST" ->
                writeJson(exchange, 200, skillService.searchSkillHub(body<SkillHubSearchRequest>(exchange)))
            route == "/hub/install" && method == "POST" ->
                writeJson(exchange, 200, skillService.installFromSkillHub(body<SkillHubInstallRequest>(exchange)))
            route == "/hub/detail" && method == "POST" ->
                writeJson(exchange, 200, skillHubDetailService.detail(body<SkillHubDetailRequest>(exchange)))
            route == "/hub/file" && method == "POST" ->
                writeJson(exchange, 200, skillHubDetailService.file(body<SkillHubFileRequest>(exchange)))
            else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
        }
    }

    private fun handlePlugins(exchange: HttpExchange) {
        val route = exchange.requestURI.path.removePrefix("/api/plugins")
        val method = exchange.requestMethod
        when {
            route == "" && method == "GET" -> writeJson(exchange, 200, pluginService.list())
            route == "/save" && method == "POST" ->
                writeJson(exchange, 200, pluginService.save(body<PluginFileRequest>(exchange)))
            route == "/import" && method == "POST" ->
                writeJson(exchange, 200, pluginService.import(body<PluginImportRequest>(exchange)))
            route == "/enabled" && method == "POST" ->
                writeJson(exchange, 200, pluginService.setEnabled(body<PluginLocationRequest>(exchange)))
            route == "/delete" && method == "POST" ->
                writeJson(exchange, 200, pluginService.delete(body<PluginLocationRequest>(exchange)))
            else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
        }
    }

    /**
     * Switching branches under a live session silently invalidates whatever the assistant read
     * earlier, so the conversation is told when it happens.
     */
    private fun startBranchWatcher() {
        gitStatusService.consumeBranchChange()
        branchWatcher = java.util.concurrent.Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "capybara-branch-watcher").apply { isDaemon = true }
        }.also { scheduler ->
            scheduler.scheduleWithFixedDelay({
                runCatching {
                    val (previous, current) = gitStatusService.consumeBranchChange()
                    if (previous != null && current != null && previous != current) {
                        broadcastSse(
                            "git.branch-changed",
                            responseJson.encodeToString(BranchChangedEvent(from = previous, to = current)),
                        )
                    }
                }
            }, 5, 5, java.util.concurrent.TimeUnit.SECONDS)
        }
    }

    private fun handleGit(exchange: HttpExchange) {
        val route = exchange.requestURI.path.removePrefix("/api/git").substringBefore('?')
        val method = exchange.requestMethod
        when {
            route == "/status" && method == "GET" -> writeJson(exchange, 200, gitStatusService.status())
            route == "/diff-summary" && method == "GET" -> writeJson(exchange, 200, gitStatusService.diffSummary())
            route == "/commit-dialog" && method == "POST" ->
                writeJson(exchange, 200, gitStatusService.openCommitDialog(body<GitCommitDialogRequest>(exchange)))
            route == "/push" && method == "POST" -> writeJson(exchange, 200, gitStatusService.openPushDialog())
            route == "/file-diff" && method == "POST" ->
                writeJson(exchange, 200, gitStatusService.openFileDiff(body<GitFileDiffRequest>(exchange)))
            else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
        }
    }

    private fun handleIde(exchange: HttpExchange) {
        val route = exchange.requestURI.path.removePrefix("/api/ide")
        val method = exchange.requestMethod
        when {
            route == "/run-configurations" && method == "GET" ->
                writeJson(exchange, 200, executionService.configurations())
            route == "/run" && method == "POST" ->
                writeJson(exchange, 200, executionService.runConfiguration(body<IdeaRunConfigurationRequest>(exchange)))
            route == "/maven" && method == "POST" ->
                writeJson(exchange, 200, executionService.runMaven(body<IdeaBuildRequest>(exchange)))
            route == "/gradle" && method == "POST" ->
                writeJson(exchange, 200, executionService.runGradle(body<IdeaBuildRequest>(exchange)))
            route == "/logs" && method == "GET" -> {
                val configurationID = exchange.requestURI.rawQuery
                    ?.split('&')
                    ?.firstOrNull { it.startsWith("configurationID=") }
                    ?.substringAfter('=')
                    ?.let { URLDecoder.decode(it, Charsets.UTF_8) }
                writeJson(exchange, 200, executionService.logs(configurationID))
            }
            route == "/project-context" && method == "GET" ->
                writeJson(exchange, 200, insightService.projectContext())
            route == "/editor-context" && method == "POST" ->
                writeJson(exchange, 200, insightService.editorContext(body<IdeaEditorContextRequest>(exchange)))
            route == "/diagnostics" && method == "POST" ->
                writeJson(exchange, 200, insightService.diagnostics(body<IdeaDiagnosticRequest>(exchange)))
            route == "/symbol" && method == "POST" ->
                writeJson(exchange, 200, insightService.symbol(body<IdeaSymbolRequest>(exchange)))
            route == "/navigate" && method == "POST" ->
                writeJson(exchange, 200, insightService.navigate(body<IdeaNavigateRequest>(exchange)))
            route == "/client-log" && method == "POST" ->
                writeJson(exchange, 200, frontendLogService.append(body<FrontendLogRequest>(exchange)))
            route == "/client-log" && method == "GET" -> {
                val limit = queryParam(exchange, "limit")?.toIntOrNull() ?: 200
                writeJson(exchange, 200, frontendLogService.tail(limit))
            }
            route == "/client-log" && method == "DELETE" ->
                writeJson(exchange, 200, frontendLogService.clear())
            route == "/file-attach" && method == "POST" ->
                writeJson(exchange, 200, fileSearchService.attach(body<FileAttachRequest>(exchange)))
            route == "/file-search" && method == "POST" ->
                writeJson(exchange, 200, fileSearchService.search(body<FileSearchRequest>(exchange)))
            route == "/refresh" && method == "POST" -> writeJson(exchange, 200, insightService.refresh())
            route == "/bridge" && method == "GET" -> writeJson(exchange, 200, executionService.bridgeStatus())
            route == "/bridge/enabled" && method == "POST" ->
                writeJson(exchange, 200, executionService.setBridgeEnabled(body<IdeaBridgeToggleRequest>(exchange).enabled))
            route == "/theme" && method == "GET" -> writeJson(exchange, 200, IdeThemeService.settings())
            route == "/theme" && method == "POST" ->
                writeJson(exchange, 200, IdeThemeService.apply(body<IdeThemeRequest>(exchange)))
            route == "/theme/settings" && method == "POST" ->
                writeJson(exchange, 200, IdeThemeService.updateMapping(body<IdeThemeMappingRequest>(exchange)))
            else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
        }
    }

    private fun handleSse(exchange: HttpExchange) {
        exchange.responseHeaders.add("Content-Type", "text/event-stream; charset=utf-8")
        exchange.responseHeaders.add("Cache-Control", "no-cache")
        exchange.responseHeaders.add("Connection", "keep-alive")
        exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
        exchange.sendResponseHeaders(200, 0)

        val output = exchange.responseBody
        sseClients.add(output)
        try {
            writeSse(output, "connected", "{\"status\":\"ok\"}")
            writeSse(output, "ide.theme", responseJson.encodeToString(IdeThemeEvent(currentIdeaTheme())))
            while (server != null && !Thread.currentThread().isInterrupted) {
                Thread.sleep(15000)
                writeSse(output, null, "{\"type\":\"keep-alive\"}")
            }
        } catch (_: Exception) {
            // The browser closed the stream or the plugin is shutting down.
        } finally {
            sseClients.remove(output)
            runCatching { output.close() }
        }
    }

    companion object {
        private val active = java.util.concurrent.ConcurrentHashMap<Project, HttpServerManager>()

        /** The running server for a project, or null before the tool window has been opened. */
        fun forProject(project: Project): HttpServerManager? = active[project]
    }

    fun broadcastSse(eventType: String, data: String) {
        val clients = sseClients.toList()
        clients.forEach { output ->
            try {
                writeSse(output, eventType, data)
            } catch (_: Exception) {
                sseClients.remove(output)
                runCatching { output.close() }
            }
        }
    }

    private fun writeSse(output: OutputStream, eventType: String?, data: String) {
        synchronized(output) {
            val event = buildString {
                if (eventType != null) {
                    append("event: ").append(eventType).append('\n')
                }
                append("data: ").append(data).append("\n\n")
            }
            output.write(event.toByteArray(Charsets.UTF_8))
            output.flush()
        }
    }

    private inline fun <reified T> writeJson(exchange: HttpExchange, status: Int, value: T) {
        writeResponse(exchange, status, responseJson.encodeToString(value), "application/json; charset=utf-8")
    }

    private fun writeResponse(exchange: HttpExchange, status: Int, body: String, contentType: String) {
        writeResponse(exchange, status, body.toByteArray(Charsets.UTF_8), contentType)
    }

    private fun writeResponse(exchange: HttpExchange, status: Int, body: ByteArray, contentType: String) {
        exchange.responseHeaders.add("Content-Type", contentType)
        exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
        exchange.responseHeaders.add("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        exchange.responseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
        exchange.sendResponseHeaders(status, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    private fun contentType(path: String): String = when {
        path.endsWith(".html") -> "text/html; charset=utf-8"
        path.endsWith(".js") -> "application/javascript; charset=utf-8"
        path.endsWith(".css") -> "text/css; charset=utf-8"
        path.endsWith(".json") -> "application/json; charset=utf-8"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".webp") -> "image/webp"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".woff") -> "font/woff"
        path.endsWith(".ico") -> "image/x-icon"
        else -> "application/octet-stream"
    }
}
