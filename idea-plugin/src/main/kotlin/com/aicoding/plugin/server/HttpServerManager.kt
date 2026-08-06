package com.aicoding.plugin.server

import com.aicoding.plugin.services.ChatMessage
import com.aicoding.plugin.services.LineRange
import com.aicoding.plugin.services.MemorySettingsRequest
import com.aicoding.plugin.services.MemorySystemService
import com.aicoding.plugin.services.MessageService
import com.aicoding.plugin.services.OpenCodeEndpoint
import com.aicoding.plugin.services.OpenCodeServerManager
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
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
    val fileName: String? = null,
    val lineRange: LineRange? = null,
    val timestamp: Long,
)

@Serializable
private data class IdeThemeEvent(val theme: String)

class HttpServerManager(private val project: Project) {
    private val json = Json { encodeDefaults = false; ignoreUnknownKeys = true }
    private val messageService = project.getService(MessageService::class.java)
    private val openCodeServer = OpenCodeServerManager(project.basePath)
    private val memorySystem = MemorySystemService(project, openCodeServer)
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
        broadcastSse("ide.theme", json.encodeToString(IdeThemeEvent(theme)))
    }

    private val messageListener: (ChatMessage) -> Unit = { message ->
        broadcastSse("chat_message", json.encodeToString(message.toEvent()))
    }

    fun start() {
        if (server != null) {
            return
        }

        val createdServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        createdServer.createContext("/api", ApiHandler())
        createdServer.createContext("/", StaticHandler())
        executor = Executors.newCachedThreadPool()
        createdServer.executor = executor
        createdServer.start()
        server = createdServer
        port = createdServer.address.port
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
        executor?.execute {
            runCatching { memorySystem.ensureDefaultInstalled() }
                .onFailure { error -> println("Memory system initialization failed: ${error.message}") }
        }
        println("Capybara frontend server started on http://127.0.0.1:$port")
    }

    fun stop() {
        messageService.removeListener(messageListener)
        lafConnection?.disconnect()
        lafConnection = null
        openCodeServer.stop()
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
                    exchange.requestURI.path == "/api/events" && exchange.requestMethod == "GET" ->
                        handleSse(exchange)
                    exchange.requestURI.path == "/api/reload" && exchange.requestMethod == "POST" ->
                        handleReload(exchange)
                    exchange.requestURI.path == "/api/save-file" && exchange.requestMethod == "POST" ->
                        handleSaveFile(exchange)
                    exchange.requestURI.path == "/api/memory/status" && exchange.requestMethod == "GET" ->
                        writeJson(exchange, 200, memorySystem.status())
                    exchange.requestURI.path == "/api/memory/install" && exchange.requestMethod == "POST" ->
                        handleMemoryInstall(exchange)
                    exchange.requestURI.path == "/api/memory/settings" && exchange.requestMethod == "POST" ->
                        handleMemorySettings(exchange)
                    exchange.requestURI.path == "/api/memory/scan" && exchange.requestMethod == "POST" ->
                        handleMemoryScan(exchange)
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
                    else -> writeResponse(exchange, 404, "Not found", "text/plain; charset=utf-8")
                }
            } catch (error: Exception) {
                println("Frontend API request failed: ${error.message}")
                writeResponse(exchange, 500, "Internal server error", "text/plain; charset=utf-8")
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
                writeResponse(exchange, 404, "Frontend asset not found", "text/plain; charset=utf-8")
                return
            }

            val contentType = contentType(if (safePath == "/") "/index.html" else safePath)
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
        VirtualFileManager.getInstance().asyncRefresh {
            println("IDEA virtual file system refreshed after OpenCode edit")
        }
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

    private fun handleAddMemory(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
        writeResponse(exchange, 200, memorySystem.addMemory(body), "application/json; charset=utf-8")
    }

    private fun handleDeleteMemory(exchange: HttpExchange) {
        val id = exchange.requestURI.path.substringAfterLast('/')
        writeResponse(exchange, 200, memorySystem.deleteMemory(id), "application/json; charset=utf-8")
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
            writeSse(output, "ide.theme", json.encodeToString(IdeThemeEvent(currentIdeaTheme())))
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
        writeResponse(exchange, status, json.encodeToString(value), "application/json; charset=utf-8")
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
