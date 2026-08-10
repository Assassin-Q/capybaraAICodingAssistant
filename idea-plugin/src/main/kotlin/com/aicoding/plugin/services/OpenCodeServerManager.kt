package com.aicoding.plugin.services

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL
import java.util.concurrent.TimeUnit

@Serializable
data class OpenCodeEndpoint(
    val baseUrl: String? = null,
    val projectPath: String? = null,
    val port: Int? = null,
    val frontendPort: Int? = null,
    val managed: Boolean = false,
    val connected: Boolean = false,
    val ideaTheme: String? = null,
    val error: String? = null,
    /**
     * True when a "restart" only re-probed an externally started server without stopping it.
     * The process kept running, so plugin changes were **not** reloaded.
     */
    val reconnectedOnly: Boolean = false,
    /** PID owning the port when the server is not plugin-managed, for an informed force restart. */
    val externalPid: Long? = null,
)

data class OpenCodeCliResult(
    val exitCode: Int,
    val output: String,
    val timedOut: Boolean = false,
)

private enum class PortState {
    OPEN_CODE,
    FREE,
    OTHER,
}

@Serializable
private data class HealthResponse(val healthy: Boolean = false)

class OpenCodeServerManager(private val projectPath: String?) {
    companion object {
        private const val FIRST_PORT = 12001
        private const val LAST_PORT = 12100
        private const val CONNECT_TIMEOUT_MS = 180
        private const val READ_TIMEOUT_MS = 300
        private const val START_TIMEOUT_MS = 10_000L
    }

    private val json = Json { ignoreUnknownKeys = true }
    private var process: Process? = null
    private var endpoint = OpenCodeEndpoint(projectPath = projectPath)

    @Synchronized
    fun start(frontendPort: Int): OpenCodeEndpoint {
        if (endpoint.connected && endpoint.baseUrl != null) {
            return endpoint
        }

        for (port in FIRST_PORT..LAST_PORT) {
            when (probe(port)) {
                PortState.OPEN_CODE -> {
                    endpoint = OpenCodeEndpoint(
                        baseUrl = baseUrl(port),
                        projectPath = projectPath,
                        port = port,
                        managed = false,
                        connected = true,
                    )
                    return endpoint
                }

                PortState.FREE -> {
                    val started = runCatching { startManaged(port, frontendPort) }.getOrNull()
                    if (started?.connected == true) {
                        return started
                    }
                }

                PortState.OTHER -> Unit
            }
        }

        endpoint = OpenCodeEndpoint(
            projectPath = projectPath,
            error = "12001-12100 端口都已被占用，且未发现可用的 OpenCode 服务。",
        )
        return endpoint
    }

    @Synchronized
    fun stop() {
        // OpenCode is a shared local service. IDEA closing must not stop it.
        process = null
        endpoint = OpenCodeEndpoint(projectPath = projectPath)
    }

    /**
     * Drops the cached endpoint and rediscovers OpenCode.
     *
     * A server the plugin started is terminated and relaunched. A server the user started is
     * only re-probed — which means plugin changes are **not** picked up, because OpenCode loads
     * plugins once at startup. Pass [force] to terminate an externally started server as well;
     * that is destructive to whatever the user was running, so it must be an explicit choice.
     */
    @Synchronized
    fun restart(frontendPort: Int, force: Boolean = false): OpenCodeEndpoint {
        val wasManaged = endpoint.managed
        val externalPort = endpoint.port.takeIf { !wasManaged }
        if (wasManaged) terminateFailedProcess()
        else if (force && externalPort != null) terminateExternalServer(externalPort)
        process = null
        endpoint = OpenCodeEndpoint(projectPath = projectPath)
        val next = start(frontendPort)
        // Tell the caller whether anything actually restarted, so the UI cannot overstate it.
        return if (!next.managed && next.connected) {
            next.copy(
                externalPid = next.port?.let(::externalPid),
                reconnectedOnly = !wasManaged && !force,
            )
        } else {
            next
        }
    }

    /** Finds and kills whatever owns the port. Only reached through an explicit force restart. */
    private fun terminateExternalServer(port: Int) {
        val pid = externalPid(port) ?: return
        runCatching {
            ProcessHandle.of(pid).ifPresent { handle ->
                handle.destroy()
                if (!handle.onExit().orTimeout(4, TimeUnit.SECONDS).isDone) handle.destroyForcibly()
            }
        }
        // Give the OS a moment to release the port before re-probing.
        runCatching { Thread.sleep(800) }
    }

    private fun externalPid(port: Int): Long? = runCatching {
        val windows = System.getProperty("os.name").startsWith("Windows")
        val command = if (windows) {
            listOf("netstat", "-ano", "-p", "TCP")
        } else {
            listOf("lsof", "-nP", "-iTCP:$port", "-sTCP:LISTEN", "-t")
        }
        val process = ProcessBuilder(command).redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().readText()
        process.waitFor(5, TimeUnit.SECONDS)
        if (windows) {
            output.lineSequence()
                .filter { it.contains("LISTENING") && it.contains(":$port ") }
                .mapNotNull { it.trim().split(Regex("\\s+")).lastOrNull()?.toLongOrNull() }
                .firstOrNull()
        } else {
            output.lineSequence().mapNotNull(String::toLongOrNull).firstOrNull()
        }
    }.getOrNull()

    private fun terminateFailedProcess() {
        process?.let { child ->
            child.destroy()
            if (!child.waitFor(1500, TimeUnit.MILLISECONDS)) {
                child.destroyForcibly()
            }
        }
        process = null
    }

    fun endpoint(): OpenCodeEndpoint = endpoint

    fun runCli(args: List<String>, timeoutMillis: Long = 180_000L): OpenCodeCliResult {
        val executable = resolveExecutable()
        val child = ProcessBuilder(buildCommand(executable, args))
            .directory(projectPath?.let(::File))
            .redirectErrorStream(true)
            .start()
        val output = StringBuilder()
        val reader = Thread {
            child.inputStream.bufferedReader(Charsets.UTF_8).useLines { lines ->
                lines.forEach { line -> output.appendLine(line) }
            }
        }.apply {
            name = "capybara-opencode-cli"
            isDaemon = true
            start()
        }
        val completed = child.waitFor(timeoutMillis, TimeUnit.MILLISECONDS)
        if (!completed) child.destroyForcibly()
        reader.join(2_000L)
        return OpenCodeCliResult(
            exitCode = if (completed) child.exitValue() else -1,
            output = output.toString().trim(),
            timedOut = !completed,
        )
    }

    private fun startManaged(port: Int, frontendPort: Int): OpenCodeEndpoint? {
        val child = launch(port, frontendPort)
        process = child
        Thread {
            child.inputStream.bufferedReader().useLines { lines ->
                lines.forEach { line -> println("OpenCode: $line") }
            }
        }.apply {
            name = "capybara-opencode-log"
            isDaemon = true
            start()
        }

        val deadline = System.currentTimeMillis() + START_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            if (!child.isAlive) {
                break
            }
            if (probe(port) == PortState.OPEN_CODE) {
                endpoint = OpenCodeEndpoint(
                    baseUrl = baseUrl(port),
                    projectPath = projectPath,
                    port = port,
                    managed = true,
                    connected = true,
                )
                return endpoint
            }
            Thread.sleep(250)
        }

        terminateFailedProcess()
        endpoint = OpenCodeEndpoint(
            projectPath = projectPath,
            error = "OpenCode 未能在端口 $port 启动。",
        )
        return endpoint
    }

    private fun launch(port: Int, frontendPort: Int): Process {
        val executable = resolveExecutable()
        val args = listOf(
            "serve",
            "--hostname",
            "127.0.0.1",
            "--port",
            port.toString(),
            "--cors",
            "http://127.0.0.1:$frontendPort",
        )
        return ProcessBuilder(buildCommand(executable, args))
            .directory(projectPath?.let(::File))
            .redirectErrorStream(true)
            .start()
    }

    private fun buildCommand(executable: String, args: List<String>): List<String> = when {
        executable.endsWith(".cmd", true) || executable.endsWith(".bat", true) -> {
            val commandLine = (listOf(executable) + args).joinToString(" ") { quote(it) }
            listOf("cmd.exe", "/d", "/s", "/c", commandLine)
        }

        executable.endsWith(".ps1", true) ->
            listOf("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executable) + args

        else -> listOf(executable) + args
    }

    /** Internal so sibling services can drive the same CLI without duplicating the lookup. */
    internal fun resolveExecutable(): String {
        val configured = System.getenv("OPENCODE_BIN_PATH")
        if (!configured.isNullOrBlank() && File(configured).exists()) {
            return configured
        }

        val direct = where("opencode.exe")
            .firstOrNull { File(it).isFile }
        if (direct != null) {
            return direct
        }

        val command = where("opencode.cmd").firstOrNull { File(it).isFile }
        if (command != null) {
            val bundled = File(command).parentFile
                ?.resolve("node_modules/opencode-ai/bin/opencode.exe")
            if (bundled?.isFile == true) {
                return bundled.absolutePath
            }
            return command
        }

        return "opencode.cmd"
    }

    private fun where(command: String): List<String> = runCatching {
        val process = ProcessBuilder("where.exe", command).start()
        process.inputStream.bufferedReader().readLines().also { process.waitFor(2, TimeUnit.SECONDS) }
    }.getOrDefault(emptyList())

    private fun probe(port: Int): PortState {
        val health = request("${baseUrl(port)}/global/health") ?: return if (isFree(port)) {
            PortState.FREE
        } else {
            PortState.OTHER
        }
        if (health.first != 200) {
            return PortState.OTHER
        }

        val body = health.second
        val healthy = runCatching { json.decodeFromString<HealthResponse>(body).healthy }.getOrDefault(false)
        if (!healthy) {
            return PortState.OTHER
        }

        val doc = request("${baseUrl(port)}/doc") ?: return PortState.OTHER
        val isOpenCode = doc.first == 200 && (
            doc.second.contains("\"title\":\"opencode\"", ignoreCase = true) ||
                doc.second.contains("\"description\":\"opencode api\"", ignoreCase = true)
            )
        return if (isOpenCode) PortState.OPEN_CODE else PortState.OTHER
    }

    private fun request(target: String): Pair<Int, String>? = runCatching {
        val connection = URL(target).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.requestMethod = "GET"
        connection.connect()
        val status = connection.responseCode
        val stream = if (status in 200..399) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        status to body
    }.getOrNull()

    private fun isFree(port: Int): Boolean = runCatching {
        ServerSocket().use { socket ->
            socket.reuseAddress = false
            socket.bind(java.net.InetSocketAddress(InetAddress.getLoopbackAddress(), port))
        }
        true
    }.getOrDefault(false)

    private fun baseUrl(port: Int) = "http://127.0.0.1:$port"

    private fun quote(value: String) = "\"${value.replace("\"", "\\\"")}\""
}
