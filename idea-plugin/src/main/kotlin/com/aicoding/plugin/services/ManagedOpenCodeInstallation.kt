package com.aicoding.plugin.services

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

data class OpenCodeProbe(
    val version: String,
    val exitCode: Int,
    val output: String,
    val timedOut: Boolean,
) {
    val launchable: Boolean get() = version.isNotBlank() && exitCode == 0 && !timedOut
}

data class ManagedOpenCodeInstallResult(
    val executable: String,
    val version: String,
    val output: String,
)

/**
 * Keeps the plugin-managed CLI separate from the user's global npm installation.
 *
 * Updating the global package in place is unsafe on Windows while an OpenCode server is running:
 * npm replaces the launcher before postinstall can replace the locked executable. A failed update
 * then leaves a tiny error script where the working binary used to be. We instead install into a
 * temporary prefix, verify the binary, and publish it to an immutable version directory.
 */
object ManagedOpenCodeInstallation {
    private val root: File
        get() = File(System.getProperty("user.home"), ".capybara-ai/opencode")

    private val pointer: File
        get() = File(root, "current.txt")

    fun currentExecutable(): String? = runCatching {
        val path = pointer.takeIf(File::isFile)?.readText()?.trim().orEmpty()
        path.takeIf(String::isNotBlank)?.let(::File)?.takeIf(File::isFile)?.absolutePath
    }.getOrNull()

    fun probe(executable: String): OpenCodeProbe = runCatching {
        val result = BoundedProcessRunner.run(
            ExecutableLookup.buildCommand(executable, listOf("--version")),
            timeoutMillis = VERSION_TIMEOUT_MILLIS,
            maxOutputBytes = 64 * 1024,
        )
        val output = result.output.toString(Charsets.UTF_8).trim()
        OpenCodeProbe(
            version = if (result.exitCode == 0 && !result.timedOut) VERSION_PATTERN.find(output)?.value.orEmpty() else "",
            exitCode = result.exitCode,
            output = output,
            timedOut = result.timedOut,
        )
    }.getOrElse { error ->
        OpenCodeProbe(version = "", exitCode = -1, output = error.message.orEmpty(), timedOut = false)
    }

    fun installLatest(npm: String): ManagedOpenCodeInstallResult {
        val staging = Files.createTempDirectory("capybara-opencode-install-").toFile()
        try {
            val packagePlan = packagePlan()
            val command = ExecutableLookup.buildCommand(
                npm,
                listOf(
                    "install",
                    "--prefix",
                    staging.absolutePath,
                    "--no-save",
                ) + packagePlan.npmArguments + "${packagePlan.name}@latest",
            )
            val result = BoundedProcessRunner.run(
                command = command,
                timeoutMillis = INSTALL_TIMEOUT_MILLIS,
                maxOutputBytes = 2 * 1024 * 1024,
            )
            val output = result.output.toString(Charsets.UTF_8).trim()
            if (result.timedOut) error("OpenCode 安装超时，旧版本未被修改。")
            if (result.exitCode != 0) error(output.ifBlank { "OpenCode 安装失败，旧版本未被修改。" })

            val staged = File(staging, "node_modules/${packagePlan.name}/bin/opencode.exe")
            require(staged.isFile) { "安装包未生成 OpenCode 可执行文件，旧版本未被修改。" }
            val stagedProbe = probe(staged.absolutePath)
            require(stagedProbe.launchable) {
                val detail = stagedProbe.output.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty()
                "新版 OpenCode 无法在当前系统启动，旧版本未被修改。${detail.takeIf(String::isNotBlank)?.let { " $it" }.orEmpty()}"
            }

            val versionDirectory = File(root, "versions/${stagedProbe.version}-${System.currentTimeMillis()}")
            Files.createDirectories(versionDirectory.toPath())
            val executableName = if (ExecutableLookup.isWindows) "opencode.exe" else "opencode"
            val installed = File(versionDirectory, executableName)
            Files.copy(staged.toPath(), installed.toPath(), StandardCopyOption.REPLACE_EXISTING)
            installed.setExecutable(true, false)
            val installedProbe = probe(installed.absolutePath)
            require(installedProbe.launchable && installedProbe.version == stagedProbe.version) {
                "OpenCode 安装验证失败，旧版本未被修改。"
            }

            AtomicFileIO.writeString(pointer.toPath(), installed.absolutePath)
            pruneOldVersions(versionDirectory)
            return ManagedOpenCodeInstallResult(installed.absolutePath, installedProbe.version, output)
        } finally {
            runCatching { staging.deleteRecursively() }
        }
    }

    private fun pruneOldVersions(current: File) {
        val versions = File(root, "versions").listFiles { file -> file.isDirectory }
            ?.sortedByDescending(File::lastModified)
            .orEmpty()
        versions.filter { it != current }.drop(1).forEach { old ->
            // A different IDEA project may still be using this immutable binary on Windows.
            runCatching { old.deleteRecursively() }
        }
    }

    private fun packagePlan(): PackagePlan {
        if (!ExecutableLookup.isWindows) {
            return PackagePlan("opencode-ai", listOf("--foreground-scripts"))
        }
        val architecture = System.getProperty("os.arch").orEmpty().lowercase()
        return if (architecture.contains("aarch64") || architecture.contains("arm64")) {
            PackagePlan("opencode-windows-arm64", listOf("--ignore-scripts"))
        } else {
            // The baseline build avoids AVX/Bun crashes and works on every supported x64 CPU.
            PackagePlan("opencode-windows-x64-baseline", listOf("--ignore-scripts"))
        }
    }

    private const val VERSION_TIMEOUT_MILLIS = 12_000L
    private const val INSTALL_TIMEOUT_MILLIS = 15 * 60_000L
    private val VERSION_PATTERN = Regex("""\d+\.\d+\.\d+""")

    private data class PackagePlan(val name: String, val npmArguments: List<String>)
}
