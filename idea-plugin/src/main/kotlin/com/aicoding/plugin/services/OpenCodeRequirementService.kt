package com.aicoding.plugin.services

import com.intellij.openapi.project.Project
import kotlinx.serialization.Serializable
import java.util.concurrent.TimeUnit

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

    fun check(): OpenCodeRequirement = runCatching {
        val executable = OpenCodeServerManager(project.basePath).resolveExecutable()
        val version = readVersion(executable)
        if (version.isBlank()) {
            return OpenCodeRequirement(
                installed = false,
                supported = false,
                executable = executable,
                methods = INSTALL_METHODS,
                message = "未检测到 OpenCode，请先安装后重启 IDEA。",
            )
        }
        val supported = compareVersions(version, MINIMUM_OPENCODE_VERSION) >= 0
        OpenCodeRequirement(
            installed = true,
            supported = supported,
            version = version,
            executable = executable,
            methods = if (supported) emptyList() else INSTALL_METHODS,
            message = if (supported) {
                ""
            } else {
                "当前 OpenCode 版本为 $version，低于本插件要求的 $MINIMUM_OPENCODE_VERSION，请升级后重启 IDEA。"
            },
        )
    }.getOrElse {
        OpenCodeRequirement(
            installed = false,
            supported = false,
            methods = INSTALL_METHODS,
            message = it.message ?: "无法检测 OpenCode 安装状态",
        )
    }

    /**
     * `opencode --version` prints the bare version, but older builds also print a banner, so the
     * first version-shaped token wins rather than the whole first line.
     */
    private fun readVersion(executable: String): String = runCatching {
        val process = ProcessBuilder(executable, "--version").redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        if (!process.waitFor(VERSION_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            return ""
        }
        Regex("""\d+\.\d+\.\d+""").find(output)?.value.orEmpty()
    }.getOrDefault("")

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
        const val VERSION_TIMEOUT_SECONDS = 10L

        /** Straight from the official install page, so the panel never drifts from the docs. */
        val INSTALL_METHODS = listOf(
            OpenCodeInstallMethod(
                id = "script",
                label = "安装脚本",
                command = "curl -fsSL https://opencode.ai/install | bash",
                note = "macOS 与 Linux",
            ),
            OpenCodeInstallMethod(
                id = "powershell",
                label = "PowerShell",
                command = "irm https://opencode.ai/install.ps1 | iex",
                note = "Windows",
            ),
            OpenCodeInstallMethod(id = "npm", label = "npm", command = "npm i -g opencode-ai@latest"),
            OpenCodeInstallMethod(id = "bun", label = "Bun", command = "bun i -g opencode-ai@latest"),
            OpenCodeInstallMethod(id = "brew", label = "Homebrew", command = "brew install opencode", note = "macOS"),
            OpenCodeInstallMethod(id = "scoop", label = "Scoop", command = "scoop install opencode", note = "Windows"),
            OpenCodeInstallMethod(id = "paru", label = "paru", command = "paru -S opencode-bin", note = "Arch Linux"),
        )
    }
}
