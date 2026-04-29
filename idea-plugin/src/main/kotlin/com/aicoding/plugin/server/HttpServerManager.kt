package com.aicoding.plugin.server

import com.aicoding.plugin.services.MessageService
import com.aicoding.plugin.services.OpenCodeServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.indexing.FileBasedIndex
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.util.concurrent.Executors
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import com.intellij.diff.DiffManager
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.contents.FileContentImpl
import com.intellij.diff.requests.DiffRequest
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.openapi.util.Key
import com.intellij.diff.DiffManagerEx
import com.intellij.diff.DiffDialogHints
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.impl.DocumentImpl
import com.intellij.openapi.fileEditor.FileDocumentManager

import com.intellij.openapi.ui.DialogWrapper
import javax.swing.JDialog
import javax.swing.JPanel
import javax.swing.JComponent
import java.nio.charset.StandardCharsets
import java.io.File
import java.security.MessageDigest
import java.math.BigInteger
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList

@Serializable
data class OpenCodeStatusResponse(
    val installed: Boolean,
    val running: Boolean,
    val serviceUrl: String,
    val servicePort: Int,
    val installationGuide: OpenCodeServiceManager.InstallationGuide,
    val version: String? = null
)

@Serializable
data class OpenCodeStartResponse(
    val success: Boolean,
    val serviceUrl: String,
    val servicePort: Int,
    val message: String
)

@Serializable
data class FileSearchRequest(
    val query: String,
    val searchType: String = "filename", // filename, content, both
    val caseSensitive: Boolean = false,
    val exactMatch: Boolean = false,
    val fuzzyMatch: Boolean = true,
    val extension: String? = null,
    val limit: Int = 50
)

@Serializable
data class FileSearchResult(
    val path: String,
    val name: String,
    val relativePath: String,
    val type: String, // file, directory
    val matches: List<SearchMatch>? = null
)

@Serializable
data class SearchMatch(
    val line: Int,
    val column: Int,
    val text: String,
    val highlightStart: Int,
    val highlightEnd: Int
)

@Serializable
data class FileSearchResponse(
    val success: Boolean,
    val results: List<FileSearchResult>,
    val total: Int,
    val query: String
)

@Serializable
data class ChatMessageRequest(
    val id: Long? = null,
    val type: String,
    val content: String,
    val fileName: String? = null,
    val lineStart: Int? = null,
    val lineEnd: Int? = null
)

@Serializable
data class SkillCreateRequest(
    val id: String,
    val scope: String = "project",
    val files: Map<String, String>
)

@Serializable
data class DiffViewerRequest(
    val filePath: String,
    val before: String,
    val after: String
)

@Serializable
data class SuccessResponse(
    val success: Boolean,
    val messageId: Long? = null,
    val message: String
)

@Serializable
data class FileContentResponse(
    val success: Boolean,
    val path: String,
    val name: String,
    val content: String
)

@Serializable
data class DirectoryEntry(
    val name: String,
    val path: String,
    val type: String, // file, directory
    val size: Long? = null
)

@Serializable
data class SkillMoveRequest(
    val skillId: String,
    val fromScope: String, // "project" or "global"
    val toScope: String,   // "project" or "global"
    val moveFiles: Boolean = false // true to move files, false to copy
)

@Serializable
data class RestartServiceRequest(
    val force: Boolean = false
)

@Serializable
data class DirectoryListResponse(
    val success: Boolean,
    val path: String,
    val entries: List<DirectoryEntry>,
    val error: String? = null
)

class HttpServerManager(private val project: Project) {
    private var server: HttpServer? = null
    private var port = 10000  // 前端服务器默认端口 (范围: 10000-50000)
    private val opencodeServiceManager: OpenCodeServiceManager = project.getService(OpenCodeServiceManager::class.java)!!
    private val messageService: MessageService = project.getService(MessageService::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val executor = Executors.newFixedThreadPool(10)
    
    // SSE 事件支持
    private val sseEventQueue = ConcurrentLinkedQueue<String>()
    private val sseClients = CopyOnWriteArrayList<java.io.OutputStream>()
    
    companion object {
        private const val FRONTEND_PORT_FILE_NAME = ".frontend-port"

        private const val FRONTEND_MIN_PORT = 10000
        private const val FRONTEND_MAX_PORT = 15000
        private const val FRONTEND_PORT_RANGE_SIZE = FRONTEND_MAX_PORT - FRONTEND_MIN_PORT + 1
        private const val FRONTEND_MAX_PROBE_ATTEMPTS = 10
    }

    private fun getConfigDir(): Path {
        val projectPath = project.basePath ?: System.getProperty("user.dir")
        return Paths.get(projectPath, ".opencode")
    }

    private fun getConfigFile(): Path {
        return getConfigDir().resolve("config.json")
    }

    // 获取项目级opencode.jsonc配置文件路径
    private fun getProjectConfigFile(): Path {
        return getConfigDir().resolve("opencode.jsonc")
    }

    // 获取用户home目录下的opencode配置目录
    private fun getGlobalConfigDir(): Path {
        val userHome = System.getProperty("user.home")
        return Paths.get(userHome, ".config", "opencode")
    }

    // 获取全局opencode.jsonc配置文件路径
    private fun getGlobalConfigFile(): Path {
        return getGlobalConfigDir().resolve("opencode.jsonc")
    }

    // 获取用户数据目录下的auth.json文件路径
    private fun getAuthFile(): Path {
        val userHome = System.getProperty("user.home")
        val os = System.getProperty("os.name").lowercase()
        return if (os.contains("win")) {
            // Windows: ~/.local/share/opencode/auth.json
            Paths.get(userHome, ".local", "share", "opencode", "auth.json")
        } else {
            // Linux/Mac: ~/.local/share/opencode/auth.json
            Paths.get(userHome, ".local", "share", "opencode", "auth.json")
        }
    }

    // 读取auth.json文件
    private fun readAuth(): JsonObject {
        val authFile = getAuthFile()
        if (!Files.exists(authFile)) {
            return JsonObject(emptyMap())
        }
        try {
            val content = Files.readString(authFile)
            return json.decodeFromString<JsonObject>(content)
        } catch (e: Exception) {
            println("Error reading auth file: ${e.message}")
            return JsonObject(emptyMap())
        }
    }

    // 写入auth.json文件（格式化输出）
    private fun writeAuth(auth: JsonObject) {
        try {
            val authFile = getAuthFile()
            val authDir = authFile.parent
            if (!Files.exists(authDir)) {
                Files.createDirectories(authDir)
            }
            val prettyJson = Json { prettyPrint = true; ignoreUnknownKeys = true }
            val content = prettyJson.encodeToString(auth)
            Files.write(authFile, content.toByteArray())
        } catch (e: Exception) {
            println("Error writing auth file: ${e.message}")
        }
    }

    // 读取全局opencode.jsonc文件
    private fun readGlobalConfig(): JsonObject {
        val configFile = getGlobalConfigFile()
        if (!Files.exists(configFile)) {
            return JsonObject(emptyMap())
        }
        try {
            val content = Files.readString(configFile)
            // 简单处理JSONC（移除注释）
            val cleanContent = content.replace(Regex("//.*$"), "").replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
            return json.decodeFromString<JsonObject>(cleanContent)
        } catch (e: Exception) {
            println("Error reading global config file: ${e.message}")
            return JsonObject(emptyMap())
        }
    }

    // 写入全局opencode.jsonc文件（格式化输出）
    private fun writeGlobalConfig(config: JsonObject) {
        try {
            val configFile = getGlobalConfigFile()
            val configDir = configFile.parent
            if (!Files.exists(configDir)) {
                Files.createDirectories(configDir)
            }
            val prettyJson = Json { prettyPrint = true; ignoreUnknownKeys = true }
            val content = prettyJson.encodeToString(config)
            Files.write(configFile, content.toByteArray())
        } catch (e: Exception) {
            println("Error writing global config file: ${e.message}")
        }
    }
    private fun readConfig(): JsonObject {
        val configFile = getConfigFile()
        if (!Files.exists(configFile)) {
            return JsonObject(emptyMap())
        }
        try {
            val content = Files.readString(configFile)
            return json.decodeFromString<JsonObject>(content)
        } catch (e: Exception) {
            println("Error reading config file: ${e.message}")
            return JsonObject(emptyMap())
        }
    }

    private fun writeConfig(config: JsonObject) {
        try {
            val configDir = getConfigDir()
            if (!Files.exists(configDir)) {
                Files.createDirectories(configDir)
            }
            val configFile = getConfigFile()
            val content = json.encodeToString(config)
            Files.write(configFile, content.toByteArray())
        } catch (e: Exception) {
            println("Error writing config file: ${e.message}")
        }
    }

    // 读取项目级opencode.jsonc文件
    private fun readProjectConfig(): JsonObject {
        val configFile = getProjectConfigFile()
        if (!Files.exists(configFile)) {
            return JsonObject(emptyMap())
        }
        try {
            val content = Files.readString(configFile)
            val cleanContent = content.replace(Regex("//.*$"), "").replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
            return json.decodeFromString<JsonObject>(cleanContent)
        } catch (e: Exception) {
            println("Error reading project config file: ${e.message}")
            return JsonObject(emptyMap())
        }
    }
    
    private fun getSavedPortFromFile(): Int? {
        try {
            val projectPath = project.basePath ?: return null
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            if (portFile.exists() && portFile.isFile) {
                val portStr = portFile.readText().trim()
                val port = portStr.toIntOrNull()
                if (port != null && port in FRONTEND_MIN_PORT..FRONTEND_MAX_PORT) {
                    println("读取前端端口文件: ${portFile.absolutePath}, 端口: $port")
                    return port
                }
            }
        } catch (e: Exception) {
            println("读取前端端口文件失败: ${e.message}")
        }
        return null
    }
    
    private fun savePortToFile(port: Int) {
        try {
            val projectPath = project.basePath ?: return
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            portFile.writeText(port.toString())
            println("保存前端端口到文件: ${portFile.absolutePath}, 端口: $port")
        } catch (e: Exception) {
            println("保存前端端口文件失败: ${e.message}")
        }
    }
    
    private fun clearPortFile() {
        try {
            val projectPath = project.basePath ?: return
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            if (portFile.exists()) {
                portFile.delete()
                println("清除前端端口文件: ${portFile.absolutePath}")
            }
        } catch (e: Exception) {
            println("清除前端端口文件失败: ${e.message}")
        }
    }



    private fun isPortAvailable(port: Int): Boolean {
        // 检查端口是否被任何服务占用（不仅仅是 opencode）
        try {
            val socket = java.net.Socket()
            socket.connect(java.net.InetSocketAddress("localhost", port), 1000)
            socket.close()
            // 连接成功，说明端口已被占用
            return false
        } catch (e: Exception) {
            // 连接失败，端口可能可用
            return true
        }
    }



    private fun getSavedFrontendPort(projectPath: String): Int? {
        try {
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            if (portFile.exists() && portFile.isFile) {
                val content = portFile.readText().trim()
                val port = content.toIntOrNull()
                if (port != null && port in FRONTEND_MIN_PORT..FRONTEND_MAX_PORT) {
                    println("读取前端端口 $port 从 ${portFile.absolutePath}")
                    return port
                } else {
                    println("端口文件内容无效或超出范围: $content")
                    // 删除无效的端口文件
                    try {
                        portFile.delete()
                        println("删除无效的端口文件")
                    } catch (e: Exception) {
                        println("删除端口文件失败: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            println("读取前端端口文件失败: ${e.message}")
        }
        return null
    }

    private fun saveFrontendPort(projectPath: String, port: Int) {
        try {
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            portFile.writeText(port.toString())
            println("保存前端端口 $port 到 ${portFile.absolutePath}")
        } catch (e: Exception) {
            println("保存前端端口文件失败: ${e.message}")
        }
    }

    private fun clearFrontendPortFile(projectPath: String) {
        try {
            val portFile = File(projectPath, FRONTEND_PORT_FILE_NAME)
            if (portFile.exists()) {
                portFile.delete()
                println("Cleared frontend port file ${portFile.absolutePath}")
            }
        } catch (e: Exception) {
            println("Failed to clear frontend port file: ${e.message}")
        }
    }

    private fun calculateFrontendPort(projectPath: String): Int {
        // 从最小端口开始顺序扫描第一个可用端口
        for (port in FRONTEND_MIN_PORT..FRONTEND_MAX_PORT) {
            if (isPortAvailable(port)) {
                println("选择前端端口 $port (顺序扫描)")
                return port
            }
        }
        
        // 所有端口都被占用，返回最小端口（启动时会继续扫描）
        println("所有前端端口范围都已被占用，返回最小端口")
        return FRONTEND_MIN_PORT
    }

    fun start() {
        // 先启动 OpenCode 服务
        startOpenCodeService()
        
        val projectPath = project.basePath
        
        // 尝试读取保存的端口
        var savedPort = projectPath?.let { getSavedFrontendPort(it) }
        
        // 检查保存的端口是否有效且可用
        if (savedPort != null) {
            if (savedPort !in FRONTEND_MIN_PORT..FRONTEND_MAX_PORT) {
                println("保存的端口 $savedPort 不在有效范围内 ($FRONTEND_MIN_PORT-$FRONTEND_MAX_PORT)，清除保存的端口文件")
                projectPath?.let { clearFrontendPortFile(it) }
                savedPort = null
            } else if (!isPortAvailable(savedPort)) {
                println("保存的端口 $savedPort 已被占用，清除保存的端口文件")
                projectPath?.let { clearFrontendPortFile(it) }
                savedPort = null
            } else {
                println("保存的端口 $savedPort 可用，将尝试使用")
            }
        }
        
        // 确定基础端口：优先使用可用的保存端口，否则重新计算端口
        val basePort = if (savedPort != null) {
            savedPort
        } else {
            projectPath?.let { calculateFrontendPort(it) } ?: FRONTEND_MIN_PORT
        }
        
        println("前端服务器扫描起始端口: $basePort (保存的端口: ${savedPort ?: "无"})")
        
        var started = false
        val maxAttempts = 50
        val portRange = FRONTEND_MIN_PORT..FRONTEND_MAX_PORT
        
        for (attempt in 0 until maxAttempts) {
            val tryPort = basePort + attempt
            val wrappedPort = if (tryPort > portRange.last) {
                portRange.first + (tryPort - portRange.last - 1)
            } else {
                tryPort
            }
            
            // 检查端口是否已被占用
            if (!isPortAvailable(wrappedPort)) {
                println("端口 $wrappedPort 已被占用，跳过")
                continue
            }
            
            
            
            // 尝试启动服务器
            println("尝试在端口 $wrappedPort 启动前端服务器...")
            try {
                port = wrappedPort
                server = HttpServer.create(InetSocketAddress(port), 0).apply {
                    createContext("/api", ApiHandler())
                    createContext("/", StaticHandler())
                    executor = Executors.newCachedThreadPool()
                    start()
                }
                started = true
                println("HTTP服务器启动成功，端口: $port")
                // 保存实际使用的端口到文件
                projectPath?.let { saveFrontendPort(it, port) }
                break
            } catch (e: java.net.BindException) {
                println("端口 $wrappedPort 绑定失败: ${e.message}")
                continue
            } catch (e: Exception) {
                println("在端口 $wrappedPort 启动服务器失败: ${e.message}")
                // 继续尝试下一个端口
            }
        }
        
        if (!started) {
            // 所有尝试失败，回退到顺序扫描（无锁）
            println("Hash-based port selection failed, falling back to sequential scan without locking")
            for (tryPort in FRONTEND_MIN_PORT..FRONTEND_MAX_PORT) {
                try {
                    port = tryPort
                    server = HttpServer.create(InetSocketAddress(port), 0).apply {
                        createContext("/api", ApiHandler())
                        createContext("/", StaticHandler())
                        executor = Executors.newCachedThreadPool()
                        start()
                    }
                    started = true
                    println("HTTP服务器启动成功，端口: $port")
                    projectPath?.let { saveFrontendPort(it, port) }
                    break
                } catch (e: java.net.BindException) {
                    continue
                }
            }
            
            if (!started) {
                throw RuntimeException("Cannot start HTTP server, all ports from $FRONTEND_MIN_PORT to $FRONTEND_MAX_PORT are occupied")
            }
        }
        
        // 注册消息监听器，通过SSE广播右键菜单消息
        println("Registering message listener for right-click events...")
        messageService.addListener { chatMessage ->
            try {
                println("[MessageService Listener] Broadcasting message via SSE: id=${chatMessage.id}, type=${chatMessage.type}")
                
                // 映射类型到前端期望的格式
                val mappedType = when (chatMessage.type) {
                    "add_to_chat" -> "add_to_chat" // 添加到对话的代码（前端默认处理）
                    "explain_code" -> "explain_code"    // 解释代码
                    "optimize_code" -> "optimize_code"      // 优化代码
                    "generate_test" -> "generate_test"      // 生成测试
                    else -> chatMessage.type       // 其他类型保持不变
                }
                
                // 构建SSE事件数据，包含ID
                val eventData = json.encodeToString(ChatMessageRequest(
                    id = chatMessage.id,
                    type = mappedType,
                    content = chatMessage.content,
                    fileName = chatMessage.fileName,
                    lineStart = chatMessage.lineRange?.start,
                    lineEnd = chatMessage.lineRange?.end
                ))
                
                // 通过SSE广播事件
                broadcastSSEEvent("chat_message", eventData)
                println("[MessageService Listener] Message broadcasted via SSE (mapped type: $mappedType)")
            } catch (e: Exception) {
                println("[MessageService Listener] Failed to broadcast message: ${e.message}")
                e.printStackTrace()
            }
        }
     }
     
     private fun deleteDirectory(dir: Path) {
         if (Files.exists(dir)) {
             Files.walk(dir).use { stream ->
                 stream.sorted(Comparator.reverseOrder())
                     .forEach { Files.deleteIfExists(it) }
             }
         }
     }
      
    private fun startOpenCodeService() {
        println("Starting OpenCode service...")
        
        // 检查OpenCode是否已安装
        if (!opencodeServiceManager.isServiceInstalled()) {
            println("OpenCode service is not installed. Please install with: npm install -g opencode-ai")
            return
        }
        
        // 尝试启动服务
        val success = opencodeServiceManager.startService()
        if (success) {
            println("OpenCode service started successfully on port ${opencodeServiceManager.getServicePort()}")
        } else {
            println("Failed to start OpenCode service. Will try to proxy to existing service if available.")
        }
    }

    fun stop() {
        server?.stop(0)
        // 不停止 OpenCode 服务，项目关闭后服务继续运行
    }

    fun getPort(): Int = port

    fun setProjectPath(projectPath: String) {
        opencodeServiceManager.setProjectPath(projectPath)
    }

    private fun sendResponse(exchange: HttpExchange, statusCode: Int, response: String) {
        exchange.responseHeaders.add("Content-Type", "application/json; charset=UTF-8")
        exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
        exchange.responseHeaders.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        exchange.responseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
        
        if (exchange.requestMethod == "OPTIONS") {
            exchange.sendResponseHeaders(204, -1)
            return
        }
        
        val responseBytes = response.toByteArray(Charsets.UTF_8)
        exchange.sendResponseHeaders(statusCode, responseBytes.size.toLong())
        exchange.responseBody.write(responseBytes)
        exchange.responseBody.close()
    }

    private inner class ApiHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val path = exchange.requestURI.path
            val requestMethod = exchange.requestMethod
            val query = exchange.requestURI.query
            // 支持 X-HTTP-Method-Override 头部
            val methodOverride = exchange.requestHeaders.getFirst("X-HTTP-Method-Override")
            val effectiveMethod = methodOverride?.takeIf { it.isNotBlank() } ?: requestMethod

            try {
                when {
                    // OpenCode service management
                    path == "/api/opencode/status" -> handleOpenCodeStatus(exchange)
                    path == "/api/opencode/stop" && effectiveMethod == "POST" -> handleOpenCodeStop(exchange)
                    
                    // OpenCode config persistence
                    path == "/api/opencode/config" && effectiveMethod == "PATCH" -> handleUpdateConfig(exchange)
                    // MCP management (direct file operations on global config)
                    path == "/api/opencode/mcp" && effectiveMethod == "POST" -> handleAddMCPServer(exchange)
                    path == "/api/opencode/mcp" && effectiveMethod == "GET" -> handleGetMCPConfig(exchange)
                    path == "/api/opencode/mcp" && effectiveMethod == "DELETE" -> handleDeleteMCPServer(exchange)
                    path == "/api/opencode/global/config" && effectiveMethod == "PATCH" -> handleUpdateGlobalConfig(exchange)
                    
                    // Model management (direct file operations)
                    path == "/api/model/auth" && effectiveMethod == "GET" -> handleGetModelAuth(exchange)
                    path == "/api/model/auth" && effectiveMethod == "PUT" -> handleSaveModelAuth(exchange)
                    path == "/api/model/auth" && effectiveMethod == "DELETE" -> handleDeleteModelAuth(exchange)
                    path == "/api/model/config" && effectiveMethod == "PUT" -> handleSaveModelConfig(exchange)
                    path == "/api/model/config" && effectiveMethod == "DELETE" -> handleDeleteModelConfig(exchange)
                    path == "/api/model/providers" && effectiveMethod == "GET" -> handleGetProviders(exchange)
                    
                    // OpenCode API proxy - 直接代理到 opencode 服务
                    path.startsWith("/api/opencode/") -> {
                        val opencodePath = path.removePrefix("/api/opencode")
                        proxyToOpenCode(exchange, opencodePath, effectiveMethod, query)
                    }
                    
                    // Chat message management
                    path == "/api/chat/messages" && effectiveMethod == "GET" -> handleGetChatMessages(exchange)
                    path.startsWith("/api/chat/messages/") && effectiveMethod == "GET" -> {
                        val id = path.substringAfterLast("/").toLongOrNull()
                        handleGetChatMessage(exchange, id)
                    }
                    path == "/api/chat/message" && effectiveMethod == "POST" -> handlePostChatMessage(exchange)
                    path.startsWith("/api/chat/messages/") && effectiveMethod == "DELETE" -> {
                        val id = path.substringAfterLast("/").toLongOrNull()
                        handleDeleteChatMessage(exchange, id)
                    }
                    
                    // Health check
                    path == "/api/health" -> {
                        sendResponse(exchange, 200, """{"status":"OK","port":$port,"opencodePort":${opencodeServiceManager.getServicePort()}}""")
                    }
                    
                    // Server info
                    path == "/api/server-info" -> {
                        sendResponse(exchange, 200, """{"port":$port,"opencodePort":${opencodeServiceManager.getServicePort()},"opencodeRunning":${opencodeServiceManager.isServiceRunning()}}""")
                    }
                    
                    // Project path
                    path == "/api/project-path" -> {
                        val projectPath = project.basePath ?: System.getProperty("user.dir")
                        sendResponse(exchange, 200, """{"path":"$projectPath"}""")
                    }
                    
                    // Skill creation
                    path == "/api/skill" && effectiveMethod == "POST" -> handleCreateSkill(exchange)
                    
                    // Skills list
                    path == "/api/skills" && effectiveMethod == "GET" -> handleGetSkills(exchange)
                    
                    // Skill migration (move files between scopes)
                    path == "/api/skill/move" && effectiveMethod == "POST" -> handleMoveSkill(exchange)
                    
                     // Skill export (download as ZIP)
                     path.startsWith("/api/skill/export/") && effectiveMethod == "GET" -> handleExportSkill(exchange)
                     
                     // Skill deletion
                     path.startsWith("/api/skill/") && effectiveMethod == "DELETE" -> handleDeleteSkill(exchange)
                     
                     // Restart service
                    path == "/api/service/restart" && effectiveMethod == "POST" -> handleRestartService(exchange)
                    
                    // File search
                    path == "/api/files/search" && effectiveMethod == "POST" -> handleFileSearch(exchange)
                    
                    // File content
                    path.startsWith("/api/files/content") && effectiveMethod == "GET" -> handleGetFileContent(exchange)
                    
                    // Directory listing
                    path.startsWith("/api/files/directory") && effectiveMethod == "GET" -> handleListDirectory(exchange)
                    
                    // Save file (for JCEF download)
                    path == "/api/files/save" && effectiveMethod == "POST" -> handleSaveFile(exchange)
                    
                    // Choose save path (show native file chooser, return selected path)
                    path == "/api/files/choose-save-path" && effectiveMethod == "POST" -> handleChooseSavePath(exchange)
                    
                    // Diff viewer
                    path == "/api/diff/open" && effectiveMethod == "POST" -> handleOpenDiffViewer(exchange)
                    
                    // SSE endpoint for Kotlin plugin events
                    path == "/api/events" && effectiveMethod == "GET" -> handleSSE(exchange)
                    
                    // Reload files from disk (after AI changes files)
                    path == "/api/reload" && effectiveMethod == "POST" -> handleReload(exchange)
                    
                    else -> sendResponse(exchange, 404, """{"error":"Not found"}""")
                }
            } catch (e: Exception) {
                sendResponse(exchange, 500, """{"error":"${e.message?.replace("\"", "\\\"")}"}""")
            }
        }
    }

    private inner class StaticHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            var path = exchange.requestURI.path
            if (path == "/") path = "/index.html"
            
            val resourcePath = "static${path}"
            val inputStream = javaClass.classLoader.getResourceAsStream(resourcePath)
            
            if (inputStream != null) {
                val contentType = when {
                    path.endsWith(".html") -> "text/html"
                    path.endsWith(".js") -> "application/javascript"
                    path.endsWith(".css") -> "text/css"
                    path.endsWith(".json") -> "application/json"
                    path.endsWith(".png") -> "image/png"
                    path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
                    path.endsWith(".svg") -> "image/svg+xml"
                    path.endsWith(".ico") -> "image/x-icon"
                    else -> "application/octet-stream"
                }
                
                exchange.responseHeaders.add("Content-Type", contentType)
                val bytes = inputStream.readBytes()
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.write(bytes)
                exchange.responseBody.close()
                inputStream.close()
            } else {
                // Serve index.html for SPA routing
                val indexStream = javaClass.classLoader.getResourceAsStream("static/index.html")
                if (indexStream != null) {
                    exchange.responseHeaders.add("Content-Type", "text/html")
                    val bytes = indexStream.readBytes()
                    exchange.sendResponseHeaders(200, bytes.size.toLong())
                    exchange.responseBody.write(bytes)
                    exchange.responseBody.close()
                    indexStream.close()
                } else {
                    val response = "Not found"
                    exchange.sendResponseHeaders(404, response.length.toLong())
                    exchange.responseBody.write(response.toByteArray())
                    exchange.responseBody.close()
                }
            }
        }
    }

    private fun handleOpenCodeStatus(exchange: HttpExchange) {
        val isInstalled = opencodeServiceManager.isServiceInstalled()
        val isRunning = opencodeServiceManager.isServiceRunning()
        val serviceUrl = opencodeServiceManager.getServiceUrl()
        val servicePort = opencodeServiceManager.getServicePort()
        val version = if (isInstalled) opencodeServiceManager.getVersion() else null
        
        val response = json.encodeToString(
            OpenCodeStatusResponse(
                installed = isInstalled,
                running = isRunning,
                serviceUrl = serviceUrl,
                servicePort = servicePort,
                installationGuide = opencodeServiceManager.getInstallationGuide(),
                version = version
            )
        )
        sendResponse(exchange, 200, response)
    }


    private fun handleOpenCodeStop(exchange: HttpExchange) {
        opencodeServiceManager.stopService()
        sendResponse(exchange, 200, """{"success":true,"message":"OpenCode service stopped"}""")
    }

    private fun proxyToOpenCode(exchange: HttpExchange, path: String, method: String, query: String?) {
        // 检查服务是否运行
        if (!opencodeServiceManager.isServiceRunning()) {
            println("OpenCode service is not running. Please start the service first.")
            sendResponse(exchange, 503, """{"error":"OpenCode service is not running. Please start the service via /api/opencode/start endpoint."}""")
            return
        }
        
        println("OpenCode service found on port ${opencodeServiceManager.getServicePort()}")
        
        try {
            val serviceUrl = opencodeServiceManager.getServiceUrl()
            val servicePort = opencodeServiceManager.getServicePort()
            
            val urlStr = buildString {
                append(serviceUrl)
                append(path)
                if (query != null) {
                    append("?")
                    append(query)
                }
            }
            
            println("Proxy to OpenCode ($servicePort): $method $urlStr")
            
            val connection = java.net.URL(urlStr).openConnection() as java.net.HttpURLConnection
            connection.connectTimeout = 10000
            // 对于AI响应，设置更长的读取超时
            connection.readTimeout = 300000 // 5分钟
            // 处理PATCH方法，HttpURLConnection在Java 8中不支持PATCH
            val finalMethod = if (method == "PATCH") "POST" else method
            connection.requestMethod = finalMethod
            
            // 复制必要的请求头
            val requestHeaders = exchange.requestHeaders
            val contentType = requestHeaders.getFirst("Content-Type")
            val accept = requestHeaders.getFirst("Accept")
            val methodOverride = requestHeaders.getFirst("X-HTTP-Method-Override")
            val opencodeDirectory = requestHeaders.getFirst("X-Opencode-Directory")
            
            if (contentType != null) {
                connection.setRequestProperty("Content-Type", contentType)
                println("Setting Content-Type: $contentType")
            } else if (method in listOf("POST", "PUT", "PATCH")) {
                // 如果没有Content-Type头，为JSON请求设置默认值
                connection.setRequestProperty("Content-Type", "application/json")
                println("Setting default Content-Type: application/json")
            }
            

            if (opencodeDirectory != null) {
                connection.setRequestProperty("X-Opencode-Directory", opencodeDirectory)
                println("Setting X-Opencode-Directory: $opencodeDirectory")
            }
            
            // Copy request body for POST/PUT/PATCH
            if (method in listOf("POST", "PUT", "PATCH")) {
                connection.doOutput = true
                val requestBody = exchange.requestBody.readBytes()
                println("Request body (${requestBody.size} bytes): ${String(requestBody, Charsets.UTF_8).take(500)}")
                connection.outputStream.write(requestBody)
                connection.outputStream.close()
            }
            
            val responseCode = connection.responseCode
            println("OpenCode response: $responseCode ${connection.responseMessage}")
            
            // 检查响应头
            val responseContentType = connection.contentType ?: "application/json"
            println("OpenCode response content-type: $responseContentType")
            
            // 设置响应头
            exchange.responseHeaders.add("Content-Type", responseContentType)
            exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
            exchange.responseHeaders.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            exchange.responseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
            
            // 对于 204 No Content 响应，直接关闭响应体，不传输任何数据
            if (responseCode == 204) {
                exchange.sendResponseHeaders(responseCode, -1)
                exchange.responseBody.close()
                return
            }
            
            // 发送响应头，长度未知（对于流式响应）
            exchange.sendResponseHeaders(responseCode, 0)
            
            // 流式传输响应体
            val inputStream = if (responseCode >= 400) {
                connection.errorStream
            } else {
                connection.inputStream
            }
            
            inputStream?.use { input ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                val output = exchange.responseBody
                
                try {
                    var isFirstChunk = true
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        if (isFirstChunk) {
                            val firstChunk = String(buffer, 0, bytesRead, Charsets.UTF_8)
                            println("First chunk of response (${bytesRead} bytes): ${firstChunk.take(500)}")
                            isFirstChunk = false
                        }
                        output.write(buffer, 0, bytesRead)
                        output.flush()
                    }
                } catch (e: Exception) {
                    // 客户端可能已断开连接，正常情况
                    println("Stream interrupted: ${e.message}")
                } finally {
                    output.close()
                }
            } ?: run {
                exchange.responseBody.close()
            }
            
            return
        } catch (e: java.net.ConnectException) {
            println("Connection refused to OpenCode service: ${e.message}")
            sendResponse(exchange, 503, """{"error":"Cannot connect to OpenCode service on port ${opencodeServiceManager.getServicePort()}. Service may not be running."}""")
        } catch (e: java.net.SocketTimeoutException) {
            println("Connection timeout to OpenCode service: ${e.message}")
            sendResponse(exchange, 504, """{"error":"Connection timeout to OpenCode service"}""")
        } catch (e: Exception) {
            println("Proxy error: ${e.message}")
            e.printStackTrace()
            sendResponse(exchange, 500, """{"error":"Proxy error: ${e.message}"}""")
        }
    }

    private fun handleGetChatMessages(exchange: HttpExchange) {
        val messages = messageService.getPendingMessages()
        sendResponse(exchange, 200, json.encodeToString(messages))
    }

    private fun handleGetChatMessage(exchange: HttpExchange, id: Long?) {
        if (id == null) {
            sendResponse(exchange, 400, """{"error":"Invalid message ID"}""")
            return
        }
        
        val message = messageService.getMessage(id)
        if (message == null) {
            sendResponse(exchange, 404, """{"error":"Message not found"}""")
        } else {
            sendResponse(exchange, 200, json.encodeToString(message))
        }
    }

    private fun handlePostChatMessage(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.bufferedReader().readText()
            println("Received chat message request: $requestBody")
            val request = json.decodeFromString<ChatMessageRequest>(requestBody)
            println("Parsed request: $request")
            
            val lineRange = if (request.lineStart != null && request.lineEnd != null) 
                Pair(request.lineStart, request.lineEnd) else null
            
            val messageId = messageService.addMessage(request.type, request.content, request.fileName, lineRange)
            
            // 尝试将消息转发到 OpenCode 服务以触发 AI 处理
            try {
                forwardToOpenCode("/chat/message", requestBody)
            } catch (e: Exception) {
                println("Failed to forward message to OpenCode: ${e.message}")
                // 继续执行，消息已本地存储
            }
            
            sendResponse(exchange, 200, json.encodeToString(SuccessResponse(
                success = true,
                messageId = messageId,
                message = "Message added successfully"
            )))
        } catch (e: Exception) {
            println("Error handling chat message: ${e.message}")
            e.printStackTrace()
            sendResponse(exchange, 500, """{"error":"Failed to process chat message: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    private fun forwardToOpenCode(path: String, requestBody: String): String? {
        val port = opencodeServiceManager.getServicePort()
        val url = java.net.URL("http://localhost:$port$path")
        val connection = url.openConnection() as java.net.HttpURLConnection
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        // 添加项目路径头部，用于工作区隔离
        val projectPath = project.basePath ?: System.getProperty("user.dir")
        connection.setRequestProperty("X-Opencode-Directory", projectPath)
        println("Forwarding to OpenCode with project path: $projectPath")
        connection.doOutput = true
        
        connection.outputStream.use { os ->
            os.write(requestBody.toByteArray(Charsets.UTF_8))
        }
        
        val responseCode = connection.responseCode
        if (responseCode !in 200..299) {
            println("Failed to forward to OpenCode: $responseCode ${connection.responseMessage}")
            return null
        }
        
        return connection.inputStream.bufferedReader().readText()
    }
    
    // SSE 事件处理
    private fun handleSSE(exchange: HttpExchange) {
        // 设置 SSE 响应头
        exchange.responseHeaders.add("Content-Type", "text/event-stream")
        exchange.responseHeaders.add("Cache-Control", "no-cache")
        exchange.responseHeaders.add("Connection", "keep-alive")
        exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
        exchange.responseHeaders.add("Access-Control-Allow-Methods", "GET, OPTIONS")
        exchange.responseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
        
        if (exchange.requestMethod == "OPTIONS") {
            exchange.sendResponseHeaders(204, -1)
            return
        }
        
        exchange.sendResponseHeaders(200, 0)
        val outputStream = exchange.responseBody
        
        // 添加到客户端列表
        sseClients.add(outputStream)
        println("[SSE] New client connected. Total clients: ${sseClients.size}")
        
        try {
            // 发送初始连接确认
            val connectEvent = "event: connected\ndata: {\"status\":\"ok\"}\n\n"
            outputStream.write(connectEvent.toByteArray(Charsets.UTF_8))
            outputStream.flush()
            
            // 保持连接打开，等待事件
            while (!Thread.currentThread().isInterrupted) {
                // 检查队列中是否有事件
                val event = sseEventQueue.poll()
                if (event != null) {
                    outputStream.write(event.toByteArray(Charsets.UTF_8))
                    outputStream.flush()
                } else {
                    // 没有事件，短暂休眠避免CPU占用
                    Thread.sleep(100)
                }
            }
        } catch (e: Exception) {
            println("[SSE] Client disconnected: ${e.message}")
        } finally {
            sseClients.remove(outputStream)
            println("[SSE] Client removed. Total clients: ${sseClients.size}")
        }
    }
    
    // 广播 SSE 事件到所有客户端
    fun broadcastSSEEvent(eventType: String, data: String) {
        val event = "event: $eventType\ndata: $data\n\n"
        sseEventQueue.add(event)
        println("[SSE] Event queued: $eventType")
    }

    private fun handleDeleteChatMessage(exchange: HttpExchange, id: Long?) {
        if (id == null) {
            sendResponse(exchange, 400, """{"error":"Invalid message ID"}""")
            return
        }
        
        messageService.removeMessage(id)
        sendResponse(exchange, 200, """{"success":true,"message":"Message removed"}""")
    }

    private fun handleCreateSkill(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.bufferedReader().readText()
            val request = json.decodeFromString<SkillCreateRequest>(requestBody)
            
            // Determine base directory
            val baseDir = if (request.scope == "global") {
                Paths.get(System.getProperty("user.home"), ".config", "opencode", "skills", request.id)
            } else {
                val projectPath = project.basePath ?: System.getProperty("user.dir")
                Paths.get(projectPath, ".opencode", "skills", request.id)
            }
            
            // Create directory if not exists
            Files.createDirectories(baseDir)
            
            // Create subdirectories
            val subDirs = listOf("templates", "examples", "references", "scripts")
            subDirs.forEach { dir ->
                Files.createDirectories(baseDir.resolve(dir))
            }
            
            // Collect existing files to delete those not in request
            val existingFiles = mutableSetOf<String>()
            Files.walk(baseDir).use { stream ->
                stream.filter { Files.isRegularFile(it) }
                    .forEach { file ->
                        val relative = baseDir.relativize(file).toString().replace('\\', '/')
                        existingFiles.add(relative)
                    }
            }
            
            // Write each file
            request.files.forEach { (filePath, content) ->
                val file = baseDir.resolve(filePath)
                Files.createDirectories(file.parent)
                Files.write(file, content.toByteArray())
                // Remove from existing files set (file will be kept)
                existingFiles.remove(filePath)
            }
            
            // Delete files that are no longer needed
            existingFiles.forEach { relativePath ->
                try {
                    Files.deleteIfExists(baseDir.resolve(relativePath))
                } catch (e: Exception) {
                    println("Failed to delete old file $relativePath: ${e.message}")
                }
            }
            
            sendResponse(exchange, 200, """{"success":true,"message":"Skill created successfully","path":"${baseDir.toAbsolutePath().toString().replace("\\", "/")}"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to create skill: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    private fun handleMoveSkill(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.bufferedReader().readText()
            val request = json.decodeFromString<SkillMoveRequest>(requestBody)
            
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            val userHome = System.getProperty("user.home")
            
            // Define source and target base directories
            val sourceBaseDir = when (request.fromScope) {
                "global" -> Paths.get(userHome, ".config", "opencode", "skills")
                else -> Paths.get(projectPath, ".opencode", "skills")
            }
            
            val targetBaseDir = when (request.toScope) {
                "global" -> Paths.get(userHome, ".config", "opencode", "skills")
                else -> Paths.get(projectPath, ".opencode", "skills")
            }
            
            val sourceSkillDir = sourceBaseDir.resolve(request.skillId)
            val targetSkillDir = targetBaseDir.resolve(request.skillId)
            
            if (!Files.exists(sourceSkillDir)) {
                sendResponse(exchange, 404, """{"error":"Skill not found in source directory: ${sourceSkillDir}"}""")
                return
            }
            
            if (request.moveFiles) {
                // Move: 文件已由 createSkill 写入新目录，只需删除旧目录
                deleteDirectory(sourceSkillDir)
                sendResponse(exchange, 200, """{"success":true,"message":"Skill moved successfully from ${request.fromScope} to ${request.toScope}","moved":true}""")
            } else {
                // Copy: 覆盖式复制到新目录（保留源文件）
                copyDirectory(sourceSkillDir, targetSkillDir)
                sendResponse(exchange, 200, """{"success":true,"message":"Skill copied successfully from ${request.fromScope} to ${request.toScope}","copied":true}""")
            }
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to move skill: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun copyDirectory(source: Path, target: Path) {
        Files.walk(source).use { stream ->
            stream.forEach { sourceFile ->
                val targetFile = target.resolve(source.relativize(sourceFile))
                if (Files.isDirectory(sourceFile)) {
                    Files.createDirectories(targetFile)
                } else {
                    Files.createDirectories(targetFile.parent)
                    Files.copy(sourceFile, targetFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                }
            }
        }
     }
     
     private fun handleDeleteSkill(exchange: HttpExchange) {
         try {
             val path = exchange.requestURI.path
             // Extract skill ID from path: /api/skill/{skillId}
             val skillId = path.removePrefix("/api/skill/")
             
             if (skillId.isEmpty()) {
                 sendResponse(exchange, 400, """{"error":"Skill ID is required"}""")
                 return
             }
             
             val projectPath = project.basePath ?: System.getProperty("user.dir")
             val userHome = System.getProperty("user.home")
             
             // List of possible skill directories to search (same as export)
             val possibleDirs = listOf(
                 Paths.get(userHome, ".config", "opencode", "skills", skillId),
                 Paths.get(projectPath, ".opencode", "skills", skillId),
                 Paths.get(userHome, ".claude", "skills", skillId),
                 Paths.get(projectPath, ".claude", "skills", skillId),
                 Paths.get(userHome, ".agents", "skills", skillId),
                 Paths.get(projectPath, ".agents", "skills", skillId)
             )
             
             // Find and delete the skill directory
             var deleted = false
             var errorMessage: String? = null
             
             for (skillDir in possibleDirs) {
                 if (Files.exists(skillDir)) {
                     try {
                         // Delete directory recursively
                         Files.walk(skillDir)
                             .sorted(Comparator.reverseOrder())
                             .forEach { Files.deleteIfExists(it) }
                         deleted = true
                         println("Deleted skill directory: $skillDir")
                     } catch (e: Exception) {
                         errorMessage = "Failed to delete skill directory $skillDir: ${e.message}"
                         println(errorMessage)
                     }
                 }
             }
             
             if (deleted) {
                 sendResponse(exchange, 200, """{"success":true,"message":"Skill deleted successfully"}""")
             } else if (errorMessage != null) {
                 sendResponse(exchange, 500, """{"error":"$errorMessage"}""")
             } else {
                 sendResponse(exchange, 404, """{"error":"Skill not found: $skillId"}""")
             }
         } catch (e: Exception) {
             sendResponse(exchange, 500, """{"error":"Failed to delete skill: ${e.message?.replace("\"", "\\\"")}"}""")
         }
     }
     
     private fun handleRestartService(exchange: HttpExchange) {
        try {
            // Use the project's OpenCodeServiceManager instance
            // Stop the current service
            opencodeServiceManager.stopService()
            
            // Start the service again
            opencodeServiceManager.startService()
            
            sendResponse(exchange, 200, """{"success":true,"message":"Service restarted successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to restart service: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 获取供应商认证信息从auth.json
    private fun handleGetModelAuth(exchange: HttpExchange) {
        try {
            val query = exchange.requestURI.query
            val params = query?.split("&")?.associate<String, String, String> {
                val parts = it.split("=", limit = 2)
                parts[0] to URLDecoder.decode(parts.getOrElse(1) { "" }, "UTF-8")
            } ?: emptyMap()
            
            val providerId = params["providerId"] ?: throw IllegalArgumentException("Missing providerId")
            
            val auth = readAuth()
            val providerAuth = auth[providerId] as? JsonObject
            val apiKey = providerAuth?.get("key") as? JsonPrimitive
            
            if (apiKey != null) {
                sendResponse(exchange, 200, """{"providerId":"$providerId","apiKey":"${apiKey.content}"}""")
            } else {
                sendResponse(exchange, 200, """{"providerId":"$providerId","apiKey":null}""")
            }
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to get auth: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 保存供应商认证信息到auth.json
    private fun handleSaveModelAuth(exchange: HttpExchange) {
        try {
            val requestBody = String(exchange.requestBody.readBytes())
            val data = json.decodeFromString<JsonObject>(requestBody)
            
            val providerId = data["providerId"]?.jsonPrimitive?.content
            val apiKey = data["apiKey"]?.jsonPrimitive?.content
            
            if (providerId == null || apiKey == null) {
                sendResponse(exchange, 400, """{"error":"providerId and apiKey are required"}""")
                return
            }
            
            // 读取现有的auth.json
            val auth = readAuth().toMutableMap()
            
            // 更新或添加供应商认证
            auth[providerId] = JsonObject(mapOf(
                "type" to JsonPrimitive("api"),
                "key" to JsonPrimitive(apiKey)
            ))
            
            // 写入auth.json
            writeAuth(JsonObject(auth))
            
            sendResponse(exchange, 200, """{"success":true,"message":"Auth saved successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to save auth: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 删除供应商认证信息从auth.json
    private fun handleDeleteModelAuth(exchange: HttpExchange) {
        try {
            val requestBody = String(exchange.requestBody.readBytes())
            val data = json.decodeFromString<JsonObject>(requestBody)
            
            val providerId = data["providerId"]?.jsonPrimitive?.content
            
            if (providerId == null) {
                sendResponse(exchange, 400, """{"error":"providerId is required"}""")
                return
            }
            
            // 读取现有的auth.json
            val auth = readAuth().toMutableMap()
            
            // 删除供应商认证
            auth.remove(providerId)
            
            // 写入auth.json
            writeAuth(JsonObject(auth))
            
            sendResponse(exchange, 200, """{"success":true,"message":"Auth deleted successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to delete auth: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 保存模型配置到opencode.jsonc
    private fun handleSaveModelConfig(exchange: HttpExchange) {
        try {
            val requestBody = String(exchange.requestBody.readBytes())
            val data = json.decodeFromString<JsonObject>(requestBody)
            
            val providerId = data["providerId"]?.jsonPrimitive?.content
            val providerConfig = data["config"]
            
            if (providerId == null || providerConfig == null) {
                sendResponse(exchange, 400, """{"error":"providerId and config are required"}""")
                return
            }
            
            // 读取现有的opencode.jsonc
            val globalConfig = readGlobalConfig().toMutableMap()
            
            // 获取或创建provider配置
            val providers = (globalConfig["provider"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
            
            // 更新供应商配置
            providers[providerId] = providerConfig
            
            // 更新全局配置
            globalConfig["provider"] = JsonObject(providers)
            
            // 写入opencode.jsonc
            writeGlobalConfig(JsonObject(globalConfig))
            
            sendResponse(exchange, 200, """{"success":true,"message":"Model config saved successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to save model config: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 删除模型配置从opencode.jsonc
    private fun handleDeleteModelConfig(exchange: HttpExchange) {
        try {
            val requestBody = String(exchange.requestBody.readBytes())
            val data = json.decodeFromString<JsonObject>(requestBody)
            
            val providerId = data["providerId"]?.jsonPrimitive?.content
            
            if (providerId == null) {
                sendResponse(exchange, 400, """{"error":"providerId is required"}""")
                return
            }
            
            // 读取现有的opencode.jsonc
            val globalConfig = readGlobalConfig().toMutableMap()
            
            // 获取provider配置
            val providers = (globalConfig["provider"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
            
            // 删除供应商配置
            providers.remove(providerId)
            
            // 更新全局配置
            globalConfig["provider"] = JsonObject(providers)
            
            // 写入opencode.jsonc
            writeGlobalConfig(JsonObject(globalConfig))
            
            sendResponse(exchange, 200, """{"success":true,"message":"Model config deleted successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to delete model config: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    // 获取所有供应商信息
    private fun handleGetProviders(exchange: HttpExchange) {
        try {
            // 读取auth.json获取已认证的供应商
            val auth = readAuth()
            
            // 读取opencode.jsonc获取供应商配置
            val globalConfig = readGlobalConfig()
            val providers = globalConfig["provider"] as? JsonObject ?: JsonObject(emptyMap())
            
            // 获取disabled_providers列表
            val disabledProviders = globalConfig["disabled_providers"] as? JsonArray
            val disabledSet = disabledProviders?.mapNotNull { (it as? JsonPrimitive)?.content }?.toSet() ?: emptySet()
            
            // 构建供应商列表
            val providerList = mutableListOf<JsonObject>()
            
            // 从 auth.json 中获取已认证的供应商
            auth.forEach { (providerId, authConfig) ->
                val authObj = authConfig as? JsonObject ?: return@forEach
                val authType = (authObj["type"] as? JsonPrimitive)?.content
                
                // 跳过禁用的供应商
                if (disabledSet.contains(providerId)) return@forEach
                
                // 获取供应商配置（从opencode.jsonc）
                val providerConfig = providers[providerId] as? JsonObject
                
                // 构建供应商信息
                val providerInfo = mutableMapOf<String, JsonElement>()
                providerInfo["id"] = JsonPrimitive(providerId)
                providerInfo["name"] = JsonPrimitive(providerConfig?.get("name")?.let { 
                    (it as? JsonPrimitive)?.content 
                } ?: providerId)
                providerInfo["isConnected"] = JsonPrimitive(true)
                
                // 判断是否为自定义厂商：opencode.jsonc中有该key且该key在provider中存在即为自定义
                // 因为自定义厂商在opencode.jsonc的provider下有完整配置（含models）
                val isCustomProvider = providers.containsKey(providerId) && providerConfig?.get("models") != null
                providerInfo["source"] = JsonPrimitive(if (isCustomProvider) "config" else "auth")
                
                // 从 auth.json 中提取 API key 并回显
                if (authType == "api") {
                    val apiKey = (authObj["key"] as? JsonPrimitive)?.content
                    if (apiKey != null) {
                        providerInfo["key"] = JsonPrimitive(apiKey)
                    }
                    providerInfo["hasApiKey"] = JsonPrimitive(true)
                }
                
                // 添加供应商配置中的models
                val models = providerConfig?.get("models") as? JsonObject
                if (models != null) {
                    providerInfo["models"] = models
                }
                
                providerList.add(JsonObject(providerInfo))
            }
            
            // 从opencode.jsonc中获取配置的供应商（但未在auth.json中认证的）
            providers.forEach { (providerId, providerConfig) ->
                if (!auth.containsKey(providerId)) {
                    // 跳过禁用的供应商
                    if (disabledSet.contains(providerId)) return@forEach
                    
                    val providerObj = providerConfig as? JsonObject ?: return@forEach
                    
                    val providerInfo = mutableMapOf<String, JsonElement>()
                    providerInfo["id"] = JsonPrimitive(providerId)
                    providerInfo["name"] = JsonPrimitive(providerObj["name"]?.let { 
                        (it as? JsonPrimitive)?.content 
                    } ?: providerId)
                    providerInfo["isConnected"] = JsonPrimitive(false)
                    providerInfo["source"] = JsonPrimitive("config")
                    
                    // 添加供应商配置中的models
                    val models = providerObj["models"] as? JsonObject
                    if (models != null) {
                        providerInfo["models"] = models
                    }
                    
                    providerList.add(JsonObject(providerInfo))
                }
            }
            
            val response = JsonObject(mapOf(
                "providers" to JsonArray(providerList)
            ))
            
            sendResponse(exchange, 200, json.encodeToString(response))
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to get providers: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleExportSkill(exchange: HttpExchange) {
        try {
            val path = exchange.requestURI.path
            // Extract skill ID from path: /api/skill/export/{skillId}
            val skillId = path.removePrefix("/api/skill/export/")
            
            if (skillId.isEmpty()) {
                sendResponse(exchange, 400, """{"error":"Skill ID is required"}""")
                return
            }
            
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            val userHome = System.getProperty("user.home")
            
            // List of possible skill directories to search
            val possibleDirs = listOf(
                Paths.get(userHome, ".config", "opencode", "skills", skillId),
                Paths.get(projectPath, ".opencode", "skills", skillId),
                Paths.get(userHome, ".claude", "skills", skillId),
                Paths.get(projectPath, ".claude", "skills", skillId),
                Paths.get(userHome, ".agents", "skills", skillId),
                Paths.get(projectPath, ".agents", "skills", skillId)
            )
            
            val skillDir = possibleDirs.firstOrNull { Files.exists(it) }
            
            if (skillDir == null || !Files.exists(skillDir)) {
                sendResponse(exchange, 404, """{"error":"Skill not found: $skillId"}""")
                return
            }
            
            // Create ZIP in memory
            val byteArrayOutputStream = java.io.ByteArrayOutputStream()
            java.util.zip.ZipOutputStream(byteArrayOutputStream).use { zipOut ->
                // Walk through the skill directory and add all files to ZIP
                Files.walk(skillDir).use { stream ->
                    stream.filter { Files.isRegularFile(it) }
                        .forEach { file ->
                            try {
                                val relativePath = skillDir.relativize(file).toString().replace('\\', '/')
                                val zipEntry = java.util.zip.ZipEntry(relativePath)
                                zipOut.putNextEntry(zipEntry)
                                Files.copy(file, zipOut)
                                zipOut.closeEntry()
                            } catch (e: Exception) {
                                println("Error adding file $file to ZIP: ${e.message}")
                            }
                        }
                }
            }
            
            val zipBytes = byteArrayOutputStream.toByteArray()
            
            // Send ZIP file as response
            exchange.responseHeaders.set("Content-Type", "application/zip")
            exchange.responseHeaders.set("Content-Disposition", "attachment; filename=\"$skillId.zip\"")
            exchange.sendResponseHeaders(200, zipBytes.size.toLong())
            exchange.responseBody.use { os ->
                os.write(zipBytes)
            }
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to export skill: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    private fun handleUpdateConfig(exchange: HttpExchange) {
        try {
            val requestBodyBytes = exchange.requestBody.readBytes()
            val updates = json.decodeFromString<JsonObject>(String(requestBodyBytes))
            
            // Read existing config
            val currentConfig = readConfig()
            // Merge updates (simple top-level merge)
            val merged = JsonObject(currentConfig.toMutableMap().apply {
                updates.forEach { (key, value) -> this[key] = value }
            })
            // Write to local config file
            writeConfig(merged)
            
            // Proxy to OpenCode service (need to reconstruct request body)
            val url = "${opencodeServiceManager.getServiceUrl()}/config"
            val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "POST"  // 使用POST，添加方法覆盖头部
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-HTTP-Method-Override", "PATCH")
            // 添加项目路径头部，用于工作区隔离
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            connection.setRequestProperty("X-Opencode-Directory", projectPath)
            println("Proxy config update with project path: $projectPath")
            connection.doOutput = true
            connection.outputStream.write(requestBodyBytes)
            connection.outputStream.close()
            
            val responseCode = connection.responseCode
            val responseBody = if (responseCode >= 400) {
                connection.errorStream?.readBytes()?.let { String(it) } ?: ""
            } else {
                connection.inputStream?.readBytes()?.let { String(it) } ?: ""
            }
            
            // Forward response to client
            exchange.responseHeaders.add("Content-Type", connection.contentType ?: "application/json")
            exchange.sendResponseHeaders(responseCode, responseBody.length.toLong())
            exchange.responseBody.write(responseBody.toByteArray())
            exchange.responseBody.close()
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to update config: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleAddMCPServer(exchange: HttpExchange) {
        try {
            val requestBodyBytes = exchange.requestBody.readBytes()
            val data = json.decodeFromString<JsonObject>(String(requestBodyBytes))
            
            // Read existing GLOBAL config
            val currentConfig = readGlobalConfig()
            // Extract mcp servers list or create
            val mcpServers = (currentConfig["mcp"] as? JsonObject) ?: JsonObject(emptyMap())
            // Add new server (use name as key)
            val serverName = data["name"]?.jsonPrimitive?.content ?: throw IllegalArgumentException("Missing name")
            val serverConfig = data["config"] ?: throw IllegalArgumentException("Missing config")
            val updatedMcpServers = JsonObject(mcpServers.toMutableMap().apply {
                this[serverName] = serverConfig
            })
            val merged = JsonObject(currentConfig.toMutableMap().apply {
                this["mcp"] = updatedMcpServers
            })
            writeGlobalConfig(merged)
            
            sendResponse(exchange, 200, """{"success":true,"message":"MCP server added successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to add MCP server: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleDeleteMCPServer(exchange: HttpExchange) {
        try {
            val requestBodyBytes = exchange.requestBody.readBytes()
            val data = json.decodeFromString<JsonObject>(String(requestBodyBytes))
            val serverName = data["name"]?.jsonPrimitive?.content ?: throw IllegalArgumentException("Missing name")
            
            val currentConfig = readGlobalConfig()
            val mcpServers = (currentConfig["mcp"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
            mcpServers.remove(serverName)
            val merged = JsonObject(currentConfig.toMutableMap().apply {
                this["mcp"] = JsonObject(mcpServers)
            })
            writeGlobalConfig(merged)
            
            sendResponse(exchange, 200, """{"success":true,"message":"MCP server deleted successfully"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to delete MCP server: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    // 获取MCP配置从全局opencode.jsonc
    private fun handleGetMCPConfig(exchange: HttpExchange) {
        try {
            // 只读取全局opencode.jsonc获取MCP配置
            val globalConfig = readGlobalConfig()
            val mcpConfig = globalConfig["mcp"] as? JsonObject ?: JsonObject(emptyMap())

            // 构建MCP服务器列表
            val mcpServers = mutableListOf<JsonObject>()
            
            mcpConfig.forEach { (serverName, serverConfig) ->
                val serverObj = serverConfig as? JsonObject ?: return@forEach
                
                val serverInfo = mutableMapOf<String, JsonElement>()
                serverInfo["id"] = JsonPrimitive(serverName)
                serverInfo["name"] = JsonPrimitive(serverName)
                
                // 提取type字段
                val type = (serverObj["type"] as? JsonPrimitive)?.content
                serverInfo["type"] = JsonPrimitive(type ?: "remote")
                
                // 提取enabled字段
                val enabledPrimitive = serverObj["enabled"] as? JsonPrimitive
                val enabled = enabledPrimitive?.content?.toBooleanStrictOrNull() ?: true
                serverInfo["enabled"] = JsonPrimitive(enabled)
                
                // 提取url字段（远程服务器）
                val url = (serverObj["url"] as? JsonPrimitive)?.content
                if (url != null) {
                    serverInfo["url"] = JsonPrimitive(url)
                }
                
                // 提取command字段（本地服务器）
                val command = serverObj["command"] as? JsonArray
                if (command != null) {
                    serverInfo["command"] = command
                }
                
                // 提取environment字段
                val environment = serverObj["environment"] as? JsonObject
                if (environment != null) {
                    serverInfo["environment"] = environment
                }
                
                // 提取headers字段
                val headers = serverObj["headers"] as? JsonObject
                if (headers != null) {
                    serverInfo["headers"] = headers
                }
                
                // 提取oauth字段
                val oauth = serverObj["oauth"]
                if (oauth != null) {
                    serverInfo["oauth"] = oauth
                }
                
                // 提取timeout字段
                val timeoutPrimitive = serverObj["timeout"] as? JsonPrimitive
                val timeout = timeoutPrimitive?.content?.toIntOrNull()
                if (timeout != null) {
                    serverInfo["timeout"] = JsonPrimitive(timeout)
                }
                
                mcpServers.add(JsonObject(serverInfo))
            }
            
            val response = JsonObject(mapOf(
                "servers" to JsonArray(mcpServers)
            ))
            
            sendResponse(exchange, 200, json.encodeToString(response))
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to get MCP config: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleUpdateGlobalConfig(exchange: HttpExchange) {
        try {
            val requestBodyBytes = exchange.requestBody.readBytes()
            val updates = json.decodeFromString<JsonObject>(String(requestBodyBytes))
            
            val currentConfig = readConfig()
            val merged = JsonObject(currentConfig.toMutableMap().apply {
                updates.forEach { (key, value) -> this[key] = value }
            })
            writeConfig(merged)
            
            // Proxy to OpenCode
            val url = "${opencodeServiceManager.getServiceUrl()}/global/config"
            val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "POST"  // 使用POST，添加方法覆盖头部
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-HTTP-Method-Override", "PATCH")
            // 添加项目路径头部，用于工作区隔离
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            connection.setRequestProperty("X-Opencode-Directory", projectPath)
            println("Proxy global config update with project path: $projectPath")
            connection.doOutput = true
            connection.outputStream.write(requestBodyBytes)
            connection.outputStream.close()
            
            val responseCode = connection.responseCode
            val responseBody = if (responseCode >= 400) {
                connection.errorStream?.readBytes()?.let { String(it) } ?: ""
            } else {
                connection.inputStream?.readBytes()?.let { String(it) } ?: ""
            }
            
            exchange.responseHeaders.add("Content-Type", connection.contentType ?: "application/json")
            exchange.sendResponseHeaders(responseCode, responseBody.length.toLong())
            exchange.responseBody.write(responseBody.toByteArray())
            exchange.responseBody.close()
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to update global config: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleGetSkills(exchange: HttpExchange) {
        try {
            val skills = mutableListOf<JsonObject>()
            
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            val userHome = System.getProperty("user.home")
            
            // List of all possible skill directories to scan
            val skillDirectories = listOf(
                // OpenCode format
                Pair(Paths.get(userHome, ".config", "opencode", "skills"), "global"),
                Pair(Paths.get(projectPath, ".opencode", "skills"), "project"),
                // Claude compatible format
                Pair(Paths.get(userHome, ".claude", "skills"), "global"),
                Pair(Paths.get(projectPath, ".claude", "skills"), "project"),
                // Agents compatible format
                Pair(Paths.get(userHome, ".agents", "skills"), "global"),
                Pair(Paths.get(projectPath, ".agents", "skills"), "project")
            )
            
            val processedSkillIds = mutableSetOf<String>()
            
            // Scan all directories
            skillDirectories.forEach { (skillsDir, scope) ->
                if (Files.exists(skillsDir)) {
                    try {
                        Files.list(skillsDir).use { stream ->
                            stream.filter { Files.isDirectory(it) }
                                .forEach { skillDir ->
                                    val skillId = skillDir.fileName.toString()
                                    // Avoid duplicates (same skill ID from multiple locations)
                                    if (!processedSkillIds.contains(skillId)) {
                                        readSkillInfo(skillDir, scope)?.let { skillInfo ->
                                            // Add source directory info - create new JsonObject with additional field
                                            val mutableMap = skillInfo.toMutableMap()
                                            mutableMap["sourceDir"] = JsonPrimitive(skillsDir.toAbsolutePath().toString())
                                            skills.add(JsonObject(mutableMap))
                                            processedSkillIds.add(skillId)
                                        }
                                    }
                                }
                        }
                    } catch (e: Exception) {
                        println("Error scanning skill directory ${skillsDir}: ${e.message}")
                    }
                }
            }
            
            val response = JsonObject(mapOf("skills" to JsonArray(skills)))
            sendResponse(exchange, 200, json.encodeToString(response))
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"error":"Failed to get skills: ${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    private fun readSkillInfo(skillDir: Path, scope: String): JsonObject? {
        try {
            val skillMd = skillDir.resolve("SKILL.md")
            if (!Files.exists(skillMd)) return null
            
            val content = Files.readString(skillMd)
            
            // 解析 YAML frontmatter
            val frontmatterRegex = Regex("""^---\s*\n(.*?)\n---\s*\n(.*)""", RegexOption.DOT_MATCHES_ALL)
            val match = frontmatterRegex.find(content)
            
            val metadata = mutableMapOf<String, Any>()
            metadata["id"] = skillDir.fileName.toString()
            metadata["scope"] = scope
            metadata["path"] = skillDir.toAbsolutePath().toString()
            
            if (match != null) {
                val frontmatter = match.groupValues[1]
                val body = match.groupValues[2]
                
                // 简单解析 YAML（仅支持基本键值对）
                frontmatter.lines().forEach { line ->
                    val trimmed = line.trim()
                    if (trimmed.isNotEmpty() && !trimmed.startsWith("#") && trimmed.contains(":")) {
                        val parts = trimmed.split(":", limit = 2)
                        if (parts.size == 2) {
                            val key = parts[0].trim()
                            var value = parts[1].trim()
                            
                            // 移除引号
                            if (value.startsWith("\"") && value.endsWith("\"") ||
                                value.startsWith("'") && value.endsWith("'")) {
                                value = value.substring(1, value.length - 1)
                            }
                            
                            metadata[key] = value
                        }
                    }
                }
                
                metadata["content"] = body.trim()
                metadata["description"] = metadata.getOrDefault("description", "").toString().ifEmpty {
                    body.lines().firstOrNull { it.trim().isNotEmpty() && !it.trim().startsWith("#") } ?: ""
                }
            } else {
                // 没有 frontmatter，使用整个内容
                metadata["content"] = content.trim()
                metadata["name"] = skillDir.fileName.toString()
                metadata["description"] = content.lines().firstOrNull { it.trim().isNotEmpty() && !it.trim().startsWith("#") } ?: ""
            }
            
            // 确保必要字段
            if (!metadata.containsKey("name")) {
                metadata["name"] = skillDir.fileName.toString()
            }
            if (!metadata.containsKey("version")) {
                metadata["version"] = "1.0.0"
            }
            if (!metadata.containsKey("description")) {
                metadata["description"] = ""
            }
            
            // 转换为 JsonObject
            val jsonMap = metadata.mapValues { (_, value) -> JsonPrimitive(value.toString()) }
            return JsonObject(jsonMap)
        } catch (e: Exception) {
            println("Error reading skill at ${skillDir}: ${e.message}")
            return null
        }
    }
    
    private fun handleFileSearch(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.bufferedReader().readText()
            val request = json.decodeFromString<FileSearchRequest>(requestBody)
            
            val projectPath = project.basePath ?: System.getProperty("user.dir")
            val projectBasePath = Paths.get(projectPath)
            
            val results = mutableListOf<FileSearchResult>()
            
            when (request.searchType) {
                "filename" -> {
                    ApplicationManager.getApplication().runReadAction {
                        // 搜索文件名
                        val allFileNames = FilenameIndex.getAllFilenames(project)
                        val matchingNames = allFileNames.filter { name ->
                            val query = request.query
                            when {
                                request.exactMatch -> name == query
                                request.caseSensitive -> name.contains(query)
                                else -> name.contains(query, ignoreCase = true)
                            }
                        }.take(request.limit)
                        
                        matchingNames.forEach { fileName ->
                            val virtualFiles = FilenameIndex.getVirtualFilesByName(fileName, GlobalSearchScope.projectScope(project))
                            virtualFiles.forEach { virtualFile ->
                                if (!virtualFile.isDirectory) {
                                    // 检查扩展名
                                    if (request.extension != null) {
                                        val normalizedExtension = if (request.extension.startsWith(".")) request.extension else ".${request.extension}"
                                        if (!virtualFile.name.endsWith(normalizedExtension)) {
                                            return@forEach
                                        }
                                    }
                                    val relativePath = try {
                                        projectBasePath.relativize(Paths.get(virtualFile.path)).toString()
                                    } catch (e: Exception) {
                                        virtualFile.path
                                    }
                                    
                                    results.add(FileSearchResult(
                                        path = virtualFile.path,
                                        name = virtualFile.name,
                                        relativePath = relativePath,
                                        type = "file"
                                    ))
                                }
                            }
                        }
                    }
                }
                "content" -> {
                    // 搜索文件内容 - 使用递归遍历项目目录
                    val projectBasePath = project.basePath ?: System.getProperty("user.dir")
                    val projectDir = Paths.get(projectBasePath)
                    var count = 0
                    
                    val normalizedExtension = request.extension?.let { if (it.startsWith(".")) it else ".$it" }
                    Files.walk(projectDir).use { stream ->
                        stream.filter { filePath ->
                            Files.isRegularFile(filePath) && !filePath.toString().contains(".git") && 
                            (normalizedExtension == null || filePath.toString().endsWith(normalizedExtension))
                        }
                            .limit(1000) // 限制搜索文件数量
                            .forEach { filePath ->
                                if (count >= request.limit) return@forEach
                                
                                try {
                                    val content = Files.readString(filePath)
                                    val lines = content.lines()
                                    val matches = mutableListOf<SearchMatch>()
                                    
                                    lines.forEachIndexed { index, line ->
                                        val found = when {
                                            request.exactMatch -> {
                                                if (request.caseSensitive) line == request.query
                                                else line.equals(request.query, ignoreCase = true)
                                            }
                                            request.fuzzyMatch -> {
                                                if (request.caseSensitive) line.contains(request.query)
                                                else line.contains(request.query, ignoreCase = true)
                                            }
                                            else -> {
                                                if (request.caseSensitive) line.contains(request.query)
                                                else line.contains(request.query, ignoreCase = true)
                                            }
                                        }
                                        
                                        if (found) {
                                            val startIndex = if (request.caseSensitive) {
                                                line.indexOf(request.query)
                                            } else {
                                                line.indexOf(request.query, ignoreCase = true)
                                            }
                                            
                                            if (startIndex >= 0) {
                                                matches.add(SearchMatch(
                                                    line = index + 1,
                                                    column = startIndex + 1,
                                                    text = line.trim(),
                                                    highlightStart = startIndex,
                                                    highlightEnd = startIndex + request.query.length
                                                ))
                                            }
                                        }
                                    }
                                    
                                    if (matches.isNotEmpty()) {
                                        val relativePath = try {
                                            projectDir.relativize(filePath).toString()
                                        } catch (e: Exception) {
                                            filePath.toString()
                                        }
                                        
                                        results.add(FileSearchResult(
                                            path = filePath.toString(),
                                            name = filePath.fileName.toString(),
                                            relativePath = relativePath,
                                            type = "file",
                                            matches = matches.take(10) // 限制每个文件最多10个匹配
                                        ))
                                        count++
                                    }
                                } catch (e: Exception) {
                                    // 跳过无法读取的文件
                                    return@forEach
                                }
                            }
                    }
                }
                "both" -> {
                    // 同时搜索文件名和内容
                    ApplicationManager.getApplication().runReadAction {
                        val allFileNames = FilenameIndex.getAllFilenames(project)
                        val matchingNames = allFileNames.filter { name ->
                            val query = request.query
                            when {
                                request.exactMatch -> name == query
                                request.caseSensitive -> name.contains(query)
                                else -> name.contains(query, ignoreCase = true)
                            }
                        }.take(request.limit / 2)
                        
                        matchingNames.forEach { fileName ->
                            val virtualFiles = FilenameIndex.getVirtualFilesByName(fileName, GlobalSearchScope.projectScope(project))
                            virtualFiles.forEach { virtualFile ->
                                if (!virtualFile.isDirectory) {
                                    val relativePath = try {
                                        projectBasePath.relativize(Paths.get(virtualFile.path)).toString()
                                    } catch (e: Exception) {
                                        virtualFile.path
                                    }
                                    
                                    results.add(FileSearchResult(
                                        path = virtualFile.path,
                                        name = virtualFile.name,
                                        relativePath = relativePath,
                                        type = "file"
                                    ))
                                }
                            }
                        }
                    }
                    
                    // 搜索内容 - 使用递归遍历项目目录
                    val projectBasePath = project.basePath ?: System.getProperty("user.dir")
                    val projectDir = Paths.get(projectBasePath)
                    var count = 0
                    
                    Files.walk(projectDir).use { stream ->
                        stream.filter { Files.isRegularFile(it) && !it.toString().contains(".git") }
                            .limit(500) // 限制搜索文件数量
                            .forEach { filePath ->
                                if (count >= request.limit / 2) return@forEach
                                
                                try {
                                    val content = Files.readString(filePath)
                                    val lines = content.lines()
                                    val matches = mutableListOf<SearchMatch>()
                                    
                                    lines.forEachIndexed { index, line ->
                                        val found = when {
                                            request.exactMatch -> {
                                                if (request.caseSensitive) line == request.query
                                                else line.equals(request.query, ignoreCase = true)
                                            }
                                            else -> {
                                                if (request.caseSensitive) line.contains(request.query)
                                                else line.contains(request.query, ignoreCase = true)
                                            }
                                        }
                                        
                                        if (found) {
                                            val startIndex = if (request.caseSensitive) {
                                                line.indexOf(request.query)
                                            } else {
                                                line.indexOf(request.query, ignoreCase = true)
                                            }
                                            
                                            if (startIndex >= 0) {
                                                matches.add(SearchMatch(
                                                    line = index + 1,
                                                    column = startIndex + 1,
                                                    text = line.trim(),
                                                    highlightStart = startIndex,
                                                    highlightEnd = startIndex + request.query.length
                                                ))
                                            }
                                        }
                                    }
                                    
                                    if (matches.isNotEmpty()) {
                                        val relativePath = try {
                                            projectDir.relativize(filePath).toString()
                                        } catch (e: Exception) {
                                            filePath.toString()
                                        }
                                        
                                        results.add(FileSearchResult(
                                            path = filePath.toString(),
                                            name = filePath.fileName.toString(),
                                            relativePath = relativePath,
                                            type = "file",
                                            matches = matches.take(5)
                                        ))
                                        count++
                                    }
                                } catch (e: Exception) {
                                    return@forEach
                                }
                            }
                    }
                }
            }
            
            val response = FileSearchResponse(
                success = true,
                results = results.take(request.limit),
                total = results.size,
                query = request.query
            )
            
            sendResponse(exchange, 200, json.encodeToString(response))
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleListDirectory(exchange: HttpExchange) {
        try {
            val query = exchange.requestURI.query
            val params = query?.split("&")?.associate<String, String, String> {
                val parts = it.split("=", limit = 2)
                val key = parts[0]
                val value = parts.getOrElse(1) { "" }
                key to URLDecoder.decode(value, "UTF-8")
            } ?: emptyMap()
            
            var dirPath = params["path"] ?: throw IllegalArgumentException("Missing path parameter")
            // 规范化路径分隔符：将正斜杠替换为反斜杠（Windows）
            dirPath = dirPath.replace('/', '\\')
            // 规范化路径：去除末尾的路径分隔符
            dirPath = dirPath.trimEnd('\\', '/')
            
            println("DEBUG: Listing directory: $dirPath")
            
            val dir = LocalFileSystem.getInstance().findFileByPath(dirPath)
            
            // 如果目录不存在，返回空列表而不是错误
            if (dir == null || !dir.isDirectory) {
                println("DEBUG: Directory not found or is not a directory: $dirPath")
                sendResponse(exchange, 200, json.encodeToString(DirectoryListResponse(
                    success = true,
                    path = dirPath,
                    entries = emptyList()
                )))
                return
            }
            
            val entries = mutableListOf<DirectoryEntry>()
            dir.children.forEach { child ->
                entries.add(DirectoryEntry(
                    name = child.name,
                    path = child.path,
                    type = if (child.isDirectory) "directory" else "file",
                    size = if (!child.isDirectory) child.length else null
                ))
            }
            
            // Sort: directories first, then files alphabetically
            val sortedEntries = entries.sortedWith(
                compareBy(
                    { if (it.type == "directory") 0 else 1 },
                    { it.name.lowercase() }
                )
            )
            
            sendResponse(exchange, 200, json.encodeToString(DirectoryListResponse(
                success = true,
                path = dirPath,
                entries = sortedEntries
            )))
        } catch (e: Exception) {
            e.printStackTrace()
            sendResponse(exchange, 500, json.encodeToString(DirectoryListResponse(
                success = false,
                path = "",
                entries = emptyList(),
                error = e.message
            )))
        }
    }
    
    private fun handleGetFileContent(exchange: HttpExchange) {
        try {
            val query = exchange.requestURI.query
            val params = query?.split("&")?.associate<String, String, String> {
                val parts = it.split("=", limit = 2)
                parts[0] to URLDecoder.decode(parts.getOrElse(1) { "" }, "UTF-8")
            } ?: emptyMap()
            
            var filePath = params["path"] ?: throw IllegalArgumentException("Missing path parameter")
            // 规范化路径分隔符：将正斜杠替换为反斜杠（Windows）
            filePath = filePath.replace('/', '\\')
            
            val file = LocalFileSystem.getInstance().findFileByPath(filePath)
                ?: throw IllegalArgumentException("File not found: $filePath")
            
            val content = String(file.contentsToByteArray(), Charsets.UTF_8)
            
            sendResponse(exchange, 200, json.encodeToString(FileContentResponse(
                success = true,
                path = filePath,
                name = file.name,
                content = content
            )))
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    // 保存文件（用于JCEF环境下载）
    private fun handleChooseSavePath(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.readBytes().decodeToString()
            val data = json.decodeFromString<JsonObject>(requestBody)
            val fileName = data["fileName"]?.jsonPrimitive?.content ?: "download"
            
            var responseJson = """{"success":false,"message":"User cancelled","path":null}"""
            
            javax.swing.SwingUtilities.invokeAndWait {
                try {
                    val fileChooser = javax.swing.JFileChooser()
                    fileChooser.fileSelectionMode = javax.swing.JFileChooser.FILES_ONLY
                    fileChooser.selectedFile = java.io.File(fileName)
                    fileChooser.dialogTitle = "选择保存路径"
                    
                    val result = fileChooser.showSaveDialog(null)
                    if (result == javax.swing.JFileChooser.APPROVE_OPTION) {
                        val saveFile = fileChooser.selectedFile
                        val path = saveFile.absolutePath.replace("\\", "/")
                        responseJson = """{"success":true,"path":"$path"}"""
                    }
                } catch (e: Exception) {
                    println("Error choosing save path: ${e.message}")
                    responseJson = """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}"""
                }
            }
            
            sendResponse(exchange, 200, responseJson)
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }

    private fun handleSaveFile(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.readBytes().decodeToString()
            val data = json.decodeFromString<JsonObject>(requestBody)
            
            val fileName = data["fileName"]?.jsonPrimitive?.content
            val content = data["content"]?.jsonPrimitive?.content
            val mimeType = data["mimeType"]?.jsonPrimitive?.content ?: "application/octet-stream"
            // 支持直接传入保存路径（绕过文件选择对话框）
            val savePath = data["savePath"]?.jsonPrimitive?.content
            
            if (fileName == null || content == null) {
                sendResponse(exchange, 400, """{"success":false,"error":"fileName and content are required"}""")
                return
            }
            
            // Decode base64 content
            val decodedBytes = java.util.Base64.getDecoder().decode(content)
            
            if (savePath != null) {
                // 直接写入指定路径
                try {
                    java.nio.file.Files.write(java.nio.file.Paths.get(savePath), decodedBytes)
                    sendResponse(exchange, 200, """{"success":true,"message":"File saved successfully","path":"$savePath"}""")
                } catch (e: Exception) {
                    sendResponse(exchange, 500, """{"success":false,"error":"Failed to write file: ${e.message?.replace("\"", "\\\"")}"}""")
                }
                return
            }
            
            // Use Swing invokeAndWait to show the file dialog on EDT and wait for result
            var responseJson = """{"success":false,"message":"User cancelled"}"""
            
            javax.swing.SwingUtilities.invokeAndWait {
                try {
                    val fileChooser = javax.swing.JFileChooser()
                    fileChooser.fileSelectionMode = javax.swing.JFileChooser.FILES_ONLY
                    fileChooser.selectedFile = java.io.File(fileName)
                    fileChooser.dialogTitle = "保存文件"
                    
                    val result = fileChooser.showSaveDialog(null)
                    if (result == javax.swing.JFileChooser.APPROVE_OPTION) {
                        val saveFile = fileChooser.selectedFile
                        java.nio.file.Files.write(saveFile.toPath(), decodedBytes)
                        responseJson = """{"success":true,"message":"File saved successfully","path":"${saveFile.absolutePath.replace("\\", "\\\\")}"}"""
                    }
                } catch (e: Exception) {
                    println("Error saving file: ${e.message}")
                    e.printStackTrace()
                    responseJson = """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}"""
                }
            }
            
            sendResponse(exchange, 200, responseJson)
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun handleOpenDiffViewer(exchange: HttpExchange) {
        try {
            val requestBody = exchange.requestBody.bufferedReader().readText()
            val request = json.decodeFromString<DiffViewerRequest>(requestBody)
            
            println("Diff viewer requested for file: ${request.filePath}")
            println("Before content length: ${request.before.length}")
            println("After content length: ${request.after.length}")
            
            // 在EDT线程中执行UI操作
            ApplicationManager.getApplication().invokeLater {
                try {
                    // 提取文件名（不含路径），处理可能的路径格式问题
                    val fileName = try {
                        Paths.get(request.filePath).fileName.toString()
                    } catch (e: Exception) {
                        // 如果Paths解析失败，使用简单的字符串处理
                        val path = request.filePath
                        val lastSlash = maxOf(path.lastIndexOf('\\'), path.lastIndexOf('/'))
                        if (lastSlash >= 0 && lastSlash < path.length - 1) {
                            path.substring(lastSlash + 1)
                        } else {
                            "file"
                        }
                    }
                    
                    // 清理文件名中的非法字符
                    val sanitizedFileName = sanitizeFileName(fileName)
                    
                    println("Extracted filename: $fileName, sanitized: $sanitizedFileName from path: ${request.filePath}")
                    
                    // 获取原始文件的文件类型
                    val fileTypeManager = FileTypeManager.getInstance()
                    val originalFileType = fileTypeManager.getFileTypeByFileName(fileName)
                    println("Original file type: $originalFileType")
                    
                    // 创建带后缀的临时文件名（在扩展名之前添加后缀）
                    val beforeFileName = addSuffixToFileName(sanitizedFileName, "before")
                    val afterFileName = addSuffixToFileName(sanitizedFileName, "after")
                    println("Before temp file: $beforeFileName, After temp file: $afterFileName")
                    
                    // 创建共享临时目录，确保两个文件在同一目录
                    val sharedTempDir = Files.createTempDirectory("aicoding_diff_shared").toFile()
                    sharedTempDir.deleteOnExit()
                    println("Shared temp directory: ${sharedTempDir.absolutePath}")
                    
                    // 在共享目录中创建临时虚拟文件用于显示差异
                    val beforeFile = createTempVirtualFileInDir(sharedTempDir, beforeFileName, request.before)
                    val afterFile = createTempVirtualFileInDir(sharedTempDir, afterFileName, request.after)
                    
                    // 检查虚拟文件状态
                    println("Before virtual file: ${beforeFile.path}, exists: ${beforeFile.exists()}, length: ${beforeFile.length}")
                    println("After virtual file: ${afterFile.path}, exists: ${afterFile.exists()}, length: ${afterFile.length}")
                    
                    // 创建SimpleDiffRequest
                    val beforeContent = FileContentImpl(project, beforeFile)
                    val afterContent = FileContentImpl(project, afterFile)
                    println("Before content type: ${beforeContent.contentType}, After content type: ${afterContent.contentType}")
                    
                    // 检查内容是否可读
                    try {
                        val beforeText = beforeFile.contentsToByteArray().toString(StandardCharsets.UTF_8)
                        val afterText = afterFile.contentsToByteArray().toString(StandardCharsets.UTF_8)
                        println("Before file content sample (first 200 chars): ${beforeText.take(200)}")
                        println("After file content sample (first 200 chars): ${afterText.take(200)}")
                    } catch (e: Exception) {
                        println("Failed to read file contents: ${e.message}")
                    }
                    
                    // 首先尝试使用DiffContentFactory创建DocumentContent（主要方案）
                    println("Trying DiffContentFactory for DocumentContent...")
                    var diffOpened = false
                    
                    try {
                        val diffContentFactory = DiffContentFactory.getInstance()
                        
                        // 方法1: 从文件创建DocumentContent
                        try {
                            println("Trying DiffContentFactory.create from files...")
                            val beforeDocContent = diffContentFactory.create(project, beforeFile)
                            val afterDocContent = diffContentFactory.create(project, afterFile)
                            
                            // 设置为只读内容
                            try {
                                beforeDocContent.putUserData(DiffUserDataKeys.FORCE_READ_ONLY, true)
                                afterDocContent.putUserData(DiffUserDataKeys.FORCE_READ_ONLY, true)
                            } catch (e: Exception) {
                                println("Warning: Could not set read-only flag: ${e.message}")
                            }
                            
                            val docDiffRequest = SimpleDiffRequest("${request.filePath} - 修改对比", beforeDocContent, afterDocContent, "修改前", "修改后")
                            
                            // 设置在独立窗口中打开
//                            setDiffWindowFlags(docDiffRequest)
//                            showDiffInSeparateWindow(project, docDiffRequest)
                            docDiffRequest.putUserData(DiffUserDataKeys.GO_TO_SOURCE_DISABLE, true)
                            docDiffRequest.putUserData(DiffUserDataKeys.DO_NOT_IGNORE_WHITESPACES, true)
                            
                            // 使用showDiff在独立窗口中打开
                            try {
                                DiffManager.getInstance().showDiff(project, docDiffRequest, DiffDialogHints.FRAME)
                                println("Diff viewer opened successfully in separate window with FileDocumentContent")
                                // 首先尝试DiffManagerEx
//                                try {
//                                    DiffManagerEx.getInstance().showDiff(project, docDiffRequest)
//                                    println("Diff viewer opened successfully in separate window with DiffManagerEx")
//                                } catch (e: ClassNotFoundException) {
//                                    // DiffManagerEx不可用，尝试普通DiffManager
//                                    DiffManager.getInstance().showDiff(project, docDiffRequest, DiffDialogHints.FRAME)
//                                    println("Diff viewer opened successfully in separate window with FileDocumentContent")
//                                } catch (e: NoSuchMethodError) {
//                                    // showDiff方法不存在，回退到普通showDiff
//                                    println("showDiff not available, using showDiff")
//                                    DiffManager.getInstance().showDiff(project, docDiffRequest, DiffDialogHints.FRAME)
//                                    println("Diff viewer opened successfully with FileDocumentContent")
//                                }
                            } catch (e: Exception) {
                                // 所有方法都失败，记录错误
                                println("All diff showing methods failed: ${e.message}")
                                throw e
                            }
                            
                            diffOpened = true
                            return@invokeLater
                        } catch (e: Exception) {
                            println("Failed to create DocumentContent from files: ${e.message}")
                        }
                    } catch (e: Exception) {
                        println("DiffContentFactory approach failed: ${e.message}")
                    }
                } catch (e: Exception) {
                    println("Failed to open diff viewer: ${e.message}")
                    e.printStackTrace()
                }
            }
            
            sendResponse(exchange, 200, """{"success":true,"message":"Diff viewer opened"}""")
        } catch (e: Exception) {
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
    
    private fun sanitizeFileName(filename: String): String {
        // 替换Windows文件名中的非法字符
        var sanitized = filename
        val invalidChars = charArrayOf('<', '>', ':', '"', '/', '\\', '|', '?', '*')
        for (ch in invalidChars) {
            sanitized = sanitized.replace(ch, '_')
        }
        // 移除首尾空格和点
        sanitized = sanitized.trim { it <= ' ' || it == '.' }
        // 如果为空，使用默认名称
        if (sanitized.isEmpty()) {
            return "file"
        }
        return sanitized
    }
    
    private fun addSuffixToFileName(fileName: String, suffix: String): String {
        // 在扩展名之前添加后缀，例如: "file.kt" + "before" -> "file.before.kt"
        val dotIndex = fileName.lastIndexOf('.')
        return if (dotIndex > 0) {
            val nameWithoutExt = fileName.substring(0, dotIndex)
            val extension = fileName.substring(dotIndex) // 包含点
            "$nameWithoutExt.$suffix$extension"
        } else {
            "$fileName.$suffix"
        }
    }
    
    private fun createTempVirtualFile(filename: String, content: String): VirtualFile {
        // 创建临时虚拟文件
        val tempDir = Files.createTempDirectory("aicoding_diff").toFile()
        tempDir.deleteOnExit()
        
        // 确保文件名是安全的
        val safeFilename = sanitizeFileName(filename)
        val tempFile = File(tempDir, safeFilename)
        println("Creating temp file: ${tempFile.absolutePath}, content length: ${content.length}")
        
        // 写入文件内容
        tempFile.writeText(content, StandardCharsets.UTF_8)
        tempFile.deleteOnExit()
        
        // 强制刷新本地文件系统
        val localFileSystem = LocalFileSystem.getInstance()
        localFileSystem.refresh(true)
        
        // 尝试查找虚拟文件
        val virtualFile = localFileSystem.findFileByPath(tempFile.absolutePath)
        if (virtualFile == null) {
            println("WARNING: Virtual file not found immediately, trying refreshAndFindFileByPath")
            return localFileSystem.refreshAndFindFileByPath(tempFile.absolutePath) ?: 
                throw IllegalStateException("Failed to create virtual file for: ${tempFile.absolutePath}")
        }
        
        println("Virtual file found: ${virtualFile.path}, exists: ${virtualFile.exists()}, length: ${virtualFile.length}")
        return virtualFile
    }
    
    private fun createTempVirtualFileInDir(tempDir: File, filename: String, content: String): VirtualFile {
        // 在指定目录中创建临时虚拟文件
        println("Creating temp file in shared directory: ${tempDir.absolutePath}/$filename, content length: ${content.length}")
        
        // 确保文件名是安全的
        val safeFilename = sanitizeFileName(filename)
        val tempFile = File(tempDir, safeFilename)
        
        // 写入文件内容
        tempFile.writeText(content, StandardCharsets.UTF_8)
        tempFile.deleteOnExit()
        
        // 强制刷新本地文件系统
        val localFileSystem = LocalFileSystem.getInstance()
        localFileSystem.refresh(true)
        
        // 尝试查找虚拟文件
        val virtualFile = localFileSystem.findFileByPath(tempFile.absolutePath)
        if (virtualFile == null) {
            println("WARNING: Virtual file not found immediately in shared dir, trying refreshAndFindFileByPath")
            return localFileSystem.refreshAndFindFileByPath(tempFile.absolutePath) ?: 
                throw IllegalStateException("Failed to create virtual file for: ${tempFile.absolutePath}")
        }
        
        println("Virtual file in shared dir found: ${virtualFile.path}, exists: ${virtualFile.exists()}, length: ${virtualFile.length}")
        return virtualFile
    }
    
    private fun setDiffWindowFlags(diffRequest: SimpleDiffRequest): Boolean {
        // Try to set window placement flags via reflection
        val possibleWindowFlags = listOf(
            "OPEN_IN_NEW_WINDOW",
            "NEW_WINDOW", 
            "PLACE_IN_NEW_WINDOW",
            "WINDOW_MODE",
            "SEPARATE_WINDOW",
            "DIFF_WINDOW",
            "MODAL_WINDOW",
            "WINDOW",
            "DIFF_IN_NEW_WINDOW"
        )
        var windowFlagSet = false
        for (flagName in possibleWindowFlags) {
            try {
                val field = DiffUserDataKeys::class.java.getField(flagName)
                val key = field.get(null) as Key<Boolean>
                diffRequest.putUserData(key, true)
                println("Set window flag: $flagName")
                windowFlagSet = true
                break
            } catch (e: Exception) {
                // Continue to next flag
            }
        }
        if (!windowFlagSet) {
            println("Warning: No window flag found in DiffUserDataKeys. Diff may open in current window.")
        }
        
        // Try to set read-only flags on request (content flags already set)
        val possibleReadOnlyFlags = listOf(
            "FORCE_READ_ONLY",
            "READ_ONLY",
            "READ_ONLY_CONTENT"
        )
        for (flagName in possibleReadOnlyFlags) {
            try {
                val field = DiffUserDataKeys::class.java.getField(flagName)
                val key = field.get(null) as Key<Boolean>
                diffRequest.putUserData(key, true)
                println("Set read-only flag: $flagName")
                break
            } catch (e: Exception) {
                // Continue to next flag
            }
        }
        
        // Set other known flags
        try {
            diffRequest.putUserData(DiffUserDataKeys.GO_TO_SOURCE_DISABLE, true)
        } catch (e: Exception) {
            println("Warning: GO_TO_SOURCE_DISABLE not available")
        }
        try {
            diffRequest.putUserData(DiffUserDataKeys.DO_NOT_IGNORE_WHITESPACES, true)
        } catch (e: Exception) {
            println("Warning: DO_NOT_IGNORE_WHITESPACES not available")
        }
        
        return windowFlagSet
    }

    private fun showDiffInSeparateWindow(project: Project, request: SimpleDiffRequest) {
        try {
            val diffTool = com.intellij.diff.DiffManager.getInstance()

            // 尝试使用 showDiffDialog 方法（这个方法会强制打开独立窗口）
            val showDiffDialogMethod = diffTool.javaClass.getMethod(
                "showDiffDialog",
                com.intellij.openapi.project.Project::class.java,
                com.intellij.diff.requests.DiffRequest::class.java,
                com.intellij.diff.DiffDialogHints::class.java
            )

            showDiffDialogMethod.invoke(diffTool, project, request, DiffDialogHints.FRAME)
            println("✓ Diff opened in separate window via showDiffDialog")

        } catch (e: NoSuchMethodException) {
            println("⚠ showDiffDialog not available, falling back to showDiff")
            DiffManager.getInstance().showDiff(project, request, DiffDialogHints.FRAME)
        } catch (e: Exception) {
            println("✗ Error: ${e.message}")
            DiffManager.getInstance().showDiff(project, request, DiffDialogHints.FRAME)
        }
    }
    
    // Reload all files from disk (triggered when AI session becomes idle)
    private fun handleReload(exchange: HttpExchange) {
        try {
            com.intellij.openapi.vfs.VirtualFileManager.getInstance().asyncRefresh {
                println("[Reload] Files refreshed from disk")
            }
            sendResponse(exchange, 200, """{"success":true,"message":"File refresh triggered"}""")
        } catch (e: Exception) {
            println("[Reload] Error: ${e.message}")
            sendResponse(exchange, 500, """{"success":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
        }
    }
}