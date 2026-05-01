package com.aicoding.plugin.services

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import kotlinx.serialization.Serializable
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.File
import java.util.concurrent.atomic.AtomicInteger


@Service(Service.Level.PROJECT)
class OpenCodeServiceManager : Disposable {
    private var process: Process?
        get() = companionObject.sharedProcess
        set(value) { companionObject.sharedProcess = value }
    
    private var opencodePort: Int
        get() = companionObject.sharedPort
        set(value) { companionObject.sharedPort = value }
    
    private var projectPath: String? = null
    
    private var serviceStarted: Boolean
        get() = companionObject.sharedServiceStarted
        set(value) { companionObject.sharedServiceStarted = value }
    
    // 便捷访问伴生对象
    private val companionObject get() = OpenCodeServiceManager
    
    companion object {
        // 端口配置常量
        // 前端端口范围：10000-15000，后端端口范围：15001-20000
        private const val MIN_PORT = 15001      // OpenCode 服务起始端口
        private const val MAX_PORT = 20000      // OpenCode 服务结束端口
        
        // 共享状态：所有项目实例共享同一个OpenCode服务进程
        private var sharedProcess: Process? = null
        private var sharedPort: Int = MIN_PORT
        private var sharedServiceStarted = false
        private var firstProjectPath: String? = null
        private val activeProjectCount = AtomicInteger(0)
        
        // 同步锁
        private val lock = Any()
        
        fun incrementProjectCount() {
            activeProjectCount.incrementAndGet()
            println("OpenCode service project count incremented to ${activeProjectCount.get()}")
        }
        
        fun decrementProjectCount(): Boolean {
            val newCount = activeProjectCount.decrementAndGet()
            println("OpenCode service project count decremented to $newCount")
            return newCount <= 0
        }
        
        fun getProjectCount(): Int {
            return activeProjectCount.get()
        }
    }

    fun setProjectPath(path: String) {
        projectPath = path
        // 每次启动从最小端口开始尝试
        opencodePort = MIN_PORT
        println("Project path set to $path, starting port: $opencodePort")
    }
    

    

    

    

    

    

    
    fun isServiceRunning(): Boolean {
        return serviceStarted && isPortRunning(opencodePort)
    }
    
    private fun isPortRunning(port: Int): Boolean {
        try {
            val url = java.net.URL("http://localhost:$port/global/health")
            println("Checking if OpenCode service is running on port $port (URL: $url)")
            val connection = url.openConnection() as java.net.HttpURLConnection
            connection.connectTimeout = 3000
            connection.readTimeout = 5000
            connection.requestMethod = "GET"
            val responseCode = connection.responseCode
            println("OpenCode service check on port $port: HTTP $responseCode")
            if (responseCode == 200) {
                println("OpenCode service is running on port $port")
                return true
            } else {
                println("OpenCode service not responding with 200 on port $port (got $responseCode)")
            }
        } catch (e: Exception) {
            println("OpenCode service check failed on port $port: ${e.message}")
        }
        return false
    }
    

    
    private fun isPortAvailable(port: Int): Boolean {
        // 检查端口是否被任何服务占用（不仅仅是 opencode）
        try {
            println("Checking if port $port is available...")
            val socket = java.net.Socket()
            socket.connect(java.net.InetSocketAddress("localhost", port), 2000)
            socket.close()
            // 连接成功，说明端口已被占用
            println("Port $port is already in use")
            return false
        } catch (e: Exception) {
            // 连接失败，端口可能可用
            println("Port $port appears to be available: ${e.message}")
            return true
        }
    }
    
    private fun isOpenCodeServiceOnPort(port: Int): Boolean {
        try {
            val url = java.net.URL("http://localhost:$port/global/health")
            println("Checking if port $port is running OpenCode service...")
            val connection = url.openConnection() as java.net.HttpURLConnection
            connection.connectTimeout = 3000
            connection.readTimeout = 5000
            connection.requestMethod = "GET"
            val responseCode = connection.responseCode
            if (responseCode == 200) {
                // 检查响应内容是否包含opencode标识（可选）
                val response = connection.inputStream.bufferedReader().readText()
                println("Port $port is running OpenCode service: HTTP 200")
                return true
            } else {
                println("Port $port is not running OpenCode service (HTTP $responseCode)")
            }
        } catch (e: Exception) {
            println("Port $port is not running OpenCode service: ${e.message}")
        }
        return false
    }

    fun startService(): Boolean {

        
        // 同步块确保只有一个线程尝试启动服务
        synchronized(lock) {
            // 如果共享服务已经启动且端口在运行，直接返回成功
            if (sharedServiceStarted && isPortRunning(sharedPort)) {
                println("OpenCode service is already running on port $sharedPort")
                return true
            }
            
            val opencodeCommand = getOpenCodeCommand()
            if (opencodeCommand == null) {
                println("OpenCode command not found, service cannot be started")
                return false
            }

            println("使用 OpenCode 命令: $opencodeCommand")
            println("扫描端口范围: $MIN_PORT - $MAX_PORT")
            
            // 顺序扫描端口，按照端口递增方式查找可用端口
            for (port in MIN_PORT..MAX_PORT) {
                // 检查端口是否被占用
                if (!isPortAvailable(port)) {
                    // 端口被占用，检查是否是被OpenCode服务占用
                    println("端口 $port 被占用，检查是否OpenCode服务...")
                    if (isOpenCodeServiceOnPort(port)) {
                        // 如果是OpenCode服务，直接使用
                        println("端口 $port 已被OpenCode服务占用，直接使用")
                        sharedPort = port
                        sharedServiceStarted = true
                        return true
                    } else {
                        // 如果不是OpenCode服务，跳过此端口
                        println("端口 $port 被非OpenCode服务占用，跳过")
                        continue
                    }
                }

                // 尝试启动服务
                println("尝试在端口 $port 启动 OpenCode 服务...")
                try {
                    val processBuilder = ProcessBuilder(opencodeCommand, "serve", "--port", port.toString())
                    
                    // 设置工作目录：使用第一个启动服务的项目路径
                    val targetProjectPath = if (firstProjectPath == null && projectPath != null) {
                        firstProjectPath = projectPath
                        projectPath
                    } else {
                        firstProjectPath
                    }
                    
                    targetProjectPath?.let { path ->
                        val dir = File(path)
                        if (dir.exists() && dir.isDirectory) {
                            processBuilder.directory(dir)
                            println("Starting opencode service in project directory: $path")
                        }
                    }
                    
                    processBuilder.redirectErrorStream(true)
                    sharedProcess = processBuilder.start()
                    
                    // 等待服务启动，并检查健康状态
                    var serviceReady = false
                    for (i in 1..10) {
                        Thread.sleep(1000)
                        
                        // 检查进程是否还在运行
                        if (sharedProcess?.isAlive != true) {
                            println("OpenCode process died during startup")
                            break
                        }
                        
                        // 检查服务是否响应
                        try {
                            val url = java.net.URL("http://localhost:$port/global/health")
                            val connection = url.openConnection() as java.net.HttpURLConnection
                            connection.connectTimeout = 2000
                            connection.requestMethod = "GET"
                            val responseCode = connection.responseCode
                            if (responseCode == 200) {
                                sharedPort = port
                                serviceReady = true
                                println("OpenCode service started successfully on port $sharedPort")
                                break
                            }
                        } catch (e: Exception) {
                            // 服务还未就绪，继续等待
                        }
                    }
                    
                    if (serviceReady) {
                        sharedServiceStarted = true
                        return true
                    }
                    
                    // 进程已退出或服务未就绪，尝试下一个端口
                    println("端口 $port 启动失败，尝试下一个端口")
                    sharedProcess?.destroy()
                    sharedProcess = null
                } catch (e: Exception) {
                    println("在端口 $port 启动 OpenCode 失败: ${e.message}")
                    
                    // 检查是否是端口绑定错误，如果是，检查该端口是否被OpenCode占用
                    if (e.message?.contains("bind") == true || e.message?.contains("Address already in use") == true) {
                        println("端口 $port 绑定失败，检查是否已被OpenCode服务占用")
                        if (isOpenCodeServiceOnPort(port)) {
                            println("端口 $port 已被OpenCode服务占用，直接使用")
                            sharedPort = port
                            sharedServiceStarted = true
                            return true
                        }
                    }
                    
                    sharedProcess?.destroy()
                    sharedProcess = null
                }
            }
            
            println("尝试所有端口 ($MIN_PORT-$MAX_PORT) 后未能启动 OpenCode 服务")
            return false
        }
    }
    
    fun incrementProjectCount() {
        companionObject.incrementProjectCount()
    }
    
    fun decrementProjectCount(): Boolean {
        return companionObject.decrementProjectCount()
    }

    fun stopService() {
        // 减少项目计数，如果计数为零则停止共享服务
        val shouldStop = decrementProjectCount()
        
        synchronized(lock) {
            if (shouldStop && sharedServiceStarted) {
                sharedServiceStarted = false
                sharedProcess?.let { p ->
                    println("Stopping OpenCode service (PID: ${p.pid()})...")
                    
                    // 尝试使用 ProcessHandle API（Java 9+）终止整个进程树
                    try {
                        // 获取进程句柄
                        val handle = p.toHandle()
                        // 终止所有子进程
                        handle.descendants().forEach { child ->
                            try {
                                child.destroyForcibly()
                            } catch (e: Exception) {
                                println("Failed to destroy child process: ${e.message}")
                            }
                        }
                        // 终止父进程
                        handle.destroyForcibly()
                    } catch (e: Exception) {
                        // 如果 ProcessHandle API 不可用，使用传统方法
                        println("ProcessHandle API not available, using traditional method: ${e.message}")
                        p.destroy()
                        try {
                            // 等待进程终止，最多 5 秒
                            if (p.isAlive) {
                                Thread.sleep(1000)
                                if (p.isAlive) {
                                    println("Process still alive, forcing destruction...")
                                    p.destroyForcibly()
                                    p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
                                }
                            }
                        } catch (e: InterruptedException) {
                            println("Interrupted while waiting for process termination")
                            p.destroyForcibly()
                        }
                    }
                    
                    println("OpenCode service stopped")
                }
                sharedProcess = null
                sharedPort = MIN_PORT
                firstProjectPath = null
            } else {
                println("OpenCode service remains running (${getProjectCount()} projects still using it)")
            }
        }
    }

    fun forceRestart(): Boolean {
        synchronized(lock) {
            println("Force restarting OpenCode service...")
            
            val oldPort = sharedPort
            
            // Force kill the process regardless of reference count
            sharedProcess?.let { p ->
                println("Killing existing OpenCode process (PID: ${p.pid()})...")
                try {
                    val handle = p.toHandle()
                    handle.descendants().forEach { child ->
                        try { child.destroyForcibly() } catch (e: Exception) {}
                    }
                    handle.destroyForcibly()
                    
                    // Wait for the process to actually die
                    var waitCount = 0
                    while (p.isAlive && waitCount < 15) {
                        Thread.sleep(1000)
                        waitCount++
                    }
                    if (p.isAlive) {
                        println("Process did not die after 15s, forcing...")
                        handle.destroyForcibly()
                        p.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
                    }
                    println("Process killed after ${waitCount}s")
                } catch (e: Exception) {
                    println("Error killing process: ${e.message}")
                    p.destroyForcibly()
                    try { p.waitFor(5, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}
                }
            }
            
            // Reset state
            sharedProcess = null
            sharedServiceStarted = false
            sharedPort = MIN_PORT
            
            // Wait for the port to be released (up to 30 seconds)
            if (oldPort > 0) {
                var portWaitCount = 0
                while (!isPortAvailableExternal(oldPort) && portWaitCount < 30) {
                    println("Waiting for port $oldPort to be released...")
                    Thread.sleep(1000)
                    portWaitCount++
                }
                if (!isPortAvailableExternal(oldPort)) {
                    println("Warning: Port $oldPort still occupied after ${portWaitCount}s")
                }
            }
            
            // Start the service
            val result = startServiceInternal()
            if (result) {
                println("Force restart successful on port $sharedPort")
            } else {
                println("Force restart failed: could not start service")
            }
            return result
        }
    }
    
    private fun isPortAvailableExternal(port: Int): Boolean {
        return try {
            java.net.ServerSocket(port).use { true }
        } catch (e: Exception) {
            false
        }
    }
    
    private fun startServiceInternal(): Boolean {
        // This is the actual start logic without the "already running" check
        // since we've already killed the old process
        
        val opencodeCommand = getOpenCodeCommand()
        if (opencodeCommand == null) {
            println("OpenCode command not found, service cannot be started")
            return false
        }
        
        println("Starting OpenCode service on available port...")
        
        for (port in MIN_PORT..MAX_PORT) {
            if (!isPortAvailableExternal(port)) {
                continue
            }
            
            println("Trying port $port...")
            try {
                val processBuilder = ProcessBuilder(opencodeCommand, "serve", "--port", port.toString())
                
                val targetProjectPath = if (firstProjectPath != null) {
                    firstProjectPath
                } else {
                    projectPath
                }
                
                targetProjectPath?.let { path ->
                    val dir = File(path)
                    if (dir.exists() && dir.isDirectory) {
                        processBuilder.directory(dir)
                        println("Working directory: $path")
                    }
                }
                
                processBuilder.redirectErrorStream(true)
                sharedProcess = processBuilder.start()
                
                var serviceReady = false
                for (i in 1..15) {
                    Thread.sleep(1000)
                    
                    if (sharedProcess?.isAlive != true) {
                        println("OpenCode process died during startup")
                        break
                    }
                    
                    try {
                        val url = java.net.URL("http://localhost:$port/global/health")
                        val connection = url.openConnection() as java.net.HttpURLConnection
                        connection.connectTimeout = 2000
                        connection.requestMethod = "GET"
                        if (connection.responseCode == 200) {
                            sharedPort = port
                            serviceReady = true
                            println("OpenCode service started on port $sharedPort")
                            break
                        }
                    } catch (e: Exception) {
                        // not ready yet
                    }
                }
                
                if (serviceReady) {
                    sharedServiceStarted = true
                    return true
                }
                
                sharedProcess?.destroy()
                sharedProcess = null
            } catch (e: Exception) {
                println("Failed to start on port $port: ${e.message}")
                sharedProcess?.destroy()
                sharedProcess = null
            }
        }
        
        return false
    }

    fun getServiceUrl(): String {
        return "http://localhost:$opencodePort"
    }

    fun getServicePort(): Int {
        return opencodePort
    }

    private fun getOpenCodeCommand(): String? {
        // 尝试多个可能的命令变体，适用于不同平台
        val commands = listOf(
            "opencode",
            "opencode.cmd", 
            "opencode.ps1"
        )
        
        for (command in commands) {
            try {
                println("尝试检测命令: $command --version")
                val processBuilder = ProcessBuilder(command, "--version")
                processBuilder.redirectErrorStream(true)
                val p = processBuilder.start()
                val reader = BufferedReader(InputStreamReader(p.inputStream))
                val output = reader.readText()
                val exitCode = p.waitFor()
                
                if (exitCode == 0 && output.isNotEmpty()) {
                    println("OpenCode 命令检测成功: $output")
                    return command
                } else {
                    println("命令检测失败，退出码: $exitCode, 输出: $output")
                }
            } catch (e: Exception) {
                println("命令检测异常: ${e.message}")
            }
        }
        
        // 如果直接命令失败，尝试通过 shell 执行
        val shellCommands = listOf(
            listOf("cmd", "/c", "opencode", "--version"),
            listOf("powershell", "-Command", "opencode", "--version")
        )
        
        for (command in shellCommands) {
            try {
                println("尝试通过 shell 执行: ${command.joinToString(" ")}")
                val processBuilder = ProcessBuilder(command)
                processBuilder.redirectErrorStream(true)
                val p = processBuilder.start()
                val reader = BufferedReader(InputStreamReader(p.inputStream))
                val output = reader.readText()
                val exitCode = p.waitFor()
                
                if (exitCode == 0 && output.isNotEmpty()) {
                    println("OpenCode 通过 shell 检测成功: $output")
                    // 返回基本命令名
                    return "opencode"
                } else {
                    println("shell 命令检测失败，退出码: $exitCode, 输出: $output")
                }
            } catch (e: Exception) {
                println("shell 命令检测异常: ${e.message}")
            }
        }
        
        println("所有命令检测失败，OpenCode 服务未安装或无法访问")
        return null
    }

    fun isServiceInstalled(): Boolean {
        return getOpenCodeCommand() != null
    }

    @Serializable
    data class InstallationGuide(
        val command: String,
        val website: String,
        val message: String
    )

    fun getInstallationGuide(): InstallationGuide {
        return InstallationGuide(
            command = "npm install -g opencode-ai",
            website = "https://opencode.ai/docs",
            message = "OpenCode AI 服务未安装。请使用以下命令安装：npm install -g opencode-ai"
        )
    }
    
    fun getVersion(): String? {
        val command = getOpenCodeCommand()
        if (command == null) {
            return null
        }
        
        // 尝试获取版本
        try {
            val processBuilder = ProcessBuilder(command, "--version")
            processBuilder.redirectErrorStream(true)
            val p = processBuilder.start()
            val reader = BufferedReader(InputStreamReader(p.inputStream))
            val output = reader.readText().trim()
            val exitCode = p.waitFor()
            
            if (exitCode == 0 && output.isNotEmpty()) {
                return output
            }
        } catch (e: Exception) {
            println("获取版本信息失败: ${e.message}")
        }
        return null
    }

    override fun dispose() {
        println("OpenCodeServiceManager disposing...")
        // 不停止 OpenCode 服务，项目关闭后服务继续运行
    }
}