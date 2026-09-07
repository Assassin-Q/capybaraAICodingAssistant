package com.aicoding.plugin.services

import com.intellij.openapi.project.Project
import kotlinx.serialization.Serializable
import java.net.HttpURLConnection
import java.net.URI

@Serializable
data class OpenCodeInstallMethod(
    val id: String,
    val label: String,
    val command: String,
    val note: String = "",
)

@Serializable
data class OpenCodeRequirement(
    /** False when no opencode executable can be found on this machine. */
    val installed: Boolean,
    /** False when the installed build predates the v2 session API this panel depends on. */
    val supported: Boolean,
    val version: String = "",
    val minimumVersion: String = MINIMUM_OPENCODE_VERSION,
    val executable: String = "",
    val docsUrl: String = "https://opencode.ai/docs/zh-cn/#%E5%AE%89%E8%A3%85",
    val methods: List<OpenCodeInstallMethod> = emptyList(),
    val message: String = "",
    val latestVersion: String = "",
    val updateAvailable: Boolean = false,
    val updateCheckedAt: Long? = null,
    val updateError: String = "",
)

@Serializable
data class OpenCodeInstallRequest(val update: Boolean = false)

@Serializable
data class OpenCodeInstallResult(
    val success: Boolean,
    val message: String,
    val output: String = "",
    val requirement: OpenCodeRequirement? = null,
)

/** The first release carrying the `/session/{id}/message` v2 shape this panel is written against. */
const val MINIMUM_OPENCODE_VERSION = "1.18.0"

/**
 * Decides whether this machine can run the assistant at all.
 *
 * The panel is a front end for OpenCode; without it, or against a build too old for the v2 session
 * API, every screen fails in a different confusing way. Checking once at startup turns that into a
 * single clear instruction, with the official install commands rather than a link the user has to
 * go read.
 */
class OpenCodeRequirementService(private val project: Project) {

    fun check(forceLatest: Boolean = false): OpenCodeRequirement = runCatching {
        val executable = OpenCodeServerManager(project.basePath).resolveExecutable()
        val version = readVersion(executable)
        if (version.isBlank()) {
            return OpenCodeRequirement(
                installed = false,
                supported = false,
                executable = executable,
                methods = INSTALL_METHODS,
                message = "未检测到 OpenCode。可复制官方 npm 命令安装，或点击一键安装。",
            )
        }
        val supported = compareVersions(version, MINIMUM_OPENCODE_VERSION) >= 0
        val latest = latestVersion(forceLatest)
        val updateAvailable = latest.version.isNotBlank() && compareVersions(latest.version, version) > 0
        OpenCodeRequirement(
            installed = true,
            supported = supported,
            version = version,
            executable = executable,
            methods = if (supported && !updateAvailable) emptyList() else INSTALL_METHODS,
            message = if (supported) {
                if (updateAvailable) "OpenCode $latest.version 已发布，当前版本为 $version。" else ""
            } else {
                "当前 OpenCode 版本为 $version，低于本插件要求的 $MINIMUM_OPENCODE_VERSION，请升级后重启服务。"
            },
            latestVersion = latest.version,
            updateAvailable = updateAvailable,
            updateCheckedAt = latest.checkedAt,
            updateError = latest.error,
        )
    }.getOrElse {
        OpenCodeRequirement(
            installed = false,
            supported = false,
            methods = INSTALL_METHODS,
            message = it.message ?: "无法检测 OpenCode 安装状态",
        )
    }

    fun installOrUpdate(update: Boolean): OpenCodeInstallResult = runCatching {
        val command = if (update) {
            val executable = OpenCodeServerManager(project.basePath).resolveExecutable()
            require(readVersion(executable).isNotBlank()) { "未检测到可升级的 OpenCode，请先执行安装" }
            ExecutableLookup.buildCommand(executable, listOf("upgrade"))
        } else {
            val npm = ExecutableLookup.resolve("npm.cmd", "npm")
                ?: error("未检测到 npm。请先安装 Node.js，或复制页面中的 npm 命令在终端执行。")
            ExecutableLookup.buildCommand(npm, listOf("install", "--global", "opencode-ai@latest"))
        }
        val result = BoundedProcessRunner.run(
            command = command,
            timeoutMillis = INSTALL_TIMEOUT_MILLIS,
            maxOutputBytes = 2 * 1024 * 1024,
        )
        val output = result.output.toString(Charsets.UTF_8).trim()
        if (result.timedOut) error(if (update) "OpenCode 更新超时" else "OpenCode 安装超时")
        if (result.exitCode != 0) error(output.ifBlank { if (update) "OpenCode 更新失败" else "OpenCode 安装失败" })
        val requirement = check(forceLatest = true)
        require(requirement.installed) { "命令执行完成，但仍未检测到 OpenCode 可执行文件" }
        OpenCodeInstallResult(
            success = true,
            message = if (update) "OpenCode 已更新到 ${requirement.version}" else "OpenCode ${requirement.version} 安装完成",
            output = output,
            requirement = requirement,
        )
    }.getOrElse { error ->
        OpenCodeInstallResult(
            success = false,
            message = error.message ?: if (update) "OpenCode 更新失败" else "OpenCode 安装失败",
            requirement = check(),
        )
    }

    /**
     * `opencode --version` prints the bare version, but older builds also print a banner, so the
     * first version-shaped token wins rather than the whole first line.
     */
    private fun readVersion(executable: String): String = runCatching {
        val result = BoundedProcessRunner.run(
            ExecutableLookup.buildCommand(executable, listOf("--version")),
            timeoutMillis = VERSION_TIMEOUT_MILLIS,
            maxOutputBytes = 64 * 1024,
        )
        if (result.timedOut || result.exitCode != 0) return ""
        Regex("""\d+\.\d+\.\d+""").find(result.output.toString(Charsets.UTF_8))?.value.orEmpty()
    }.getOrDefault("")

    private fun latestVersion(force: Boolean): LatestVersion {
        val now = System.currentTimeMillis()
        synchronized(LATEST_LOCK) {
            if (!force && latestCheckedAt > 0L && now - latestCheckedAt < LATEST_CACHE_MILLIS) {
                return LatestVersion(latestCachedVersion, latestCheckedAt, latestCachedError)
            }
            val fetched = runCatching {
                val connection = URI.create("https://registry.npmjs.org/opencode-ai/latest")
                    .toURL().openConnection() as HttpURLConnection
                connection.connectTimeout = LATEST_TIMEOUT_MILLIS
                connection.readTimeout = LATEST_TIMEOUT_MILLIS
                connection.requestMethod = "GET"
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("User-Agent", "Capybara-AI-Coding-Assistant")
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                connection.disconnect()
                Regex(""""version"\s*:\s*"([^"]+)"""").find(body)?.groupValues?.get(1)
                    ?: error("npm registry 未返回版本号")
            }
            latestCheckedAt = now
            latestCachedVersion = fetched.getOrDefault("")
            latestCachedError = fetched.exceptionOrNull()?.message.orEmpty()
            return LatestVersion(latestCachedVersion, latestCheckedAt, latestCachedError)
        }
    }

    /** Numeric per segment so 1.18.0 is correctly above 1.9.0. */
    private fun compareVersions(left: String, right: String): Int {
        val a = left.trim().removePrefix("v").split('.').map { it.toIntOrNull() ?: 0 }
        val b = right.trim().removePrefix("v").split('.').map { it.toIntOrNull() ?: 0 }
        for (index in 0 until maxOf(a.size, b.size)) {
            val diff = (a.getOrNull(index) ?: 0) - (b.getOrNull(index) ?: 0)
            if (diff != 0) return diff
        }
        return 0
    }

    private companion object {
        const val VERSION_TIMEOUT_MILLIS = 10_000L
        const val INSTALL_TIMEOUT_MILLIS = 300_000L
        const val LATEST_TIMEOUT_MILLIS = 5_000
        const val LATEST_CACHE_MILLIS = 30 * 60 * 1_000L
        val LATEST_LOCK = Any()
        @Volatile var latestCachedVersion = ""
        @Volatile var latestCachedError = ""
        @Volatile var latestCheckedAt = 0L

        /** Straight from the official install page, so the panel never drifts from the docs. */
        val INSTALL_METHODS = listOf(
            OpenCodeInstallMethod(
                id = "npm",
                label = "npm",
                command = "npm install --global opencode-ai@latest",
                note = "官方 npm 包",
            ),
        )
    }

    private data class LatestVersion(val version: String, val checkedAt: Long, val error: String)
}
