package com.aicoding.plugin.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import kotlinx.serialization.Serializable
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

@Serializable
data class ManagedPluginFile(
    val name: String,
    val location: String,
    val scope: String,
    val enabled: Boolean,
    val language: String,
    val content: String,
)

@Serializable
data class PluginFileRequest(
    val name: String,
    val content: String,
    val scope: String,
    val location: String? = null,
    val overwrite: Boolean = false,
)

@Serializable
data class PluginLocationRequest(val location: String, val enabled: Boolean? = null)

@Serializable
data class PluginImportRequest(val scope: String, val overwrite: Boolean = false)

@Serializable
data class PluginActionResponse(
    val success: Boolean,
    val message: String? = null,
    val plugin: ManagedPluginFile? = null,
)

private data class PluginRoot(val path: Path, val scope: String)

class PluginManagementService(private val project: Project) {
    private val home = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize()
    private val projectRoot = project.basePath?.let(Path::of)?.toAbsolutePath()?.normalize()

    fun list(): List<ManagedPluginFile> = roots().flatMap { root ->
        if (!Files.isDirectory(root.path)) return@flatMap emptyList()
        Files.list(root.path).use { paths ->
            paths.filter(Files::isRegularFile)
                .filter(::isPluginFile)
                .filter { !isBuiltInBridge(it) }
                .map { toPlugin(it, root) }
                .toList()
        }
    }
        // Two roots can resolve to the same directory on a case-insensitive filesystem.
        .distinctBy { it.location.lowercase() }
        .sortedWith(compareBy<ManagedPluginFile> { it.scope }.thenBy { it.name.lowercase() })

    fun save(request: PluginFileRequest): PluginActionResponse = runCatching {
        require(request.content.isNotBlank()) { "插件代码不能为空" }
        val root = targetRoot(request.scope)
        val existing = request.location?.takeIf(String::isNotBlank)?.let(::validatedPluginFile)
        val fileName = normalizeFileName(request.name)
        val target = existing ?: root.resolve(fileName).toAbsolutePath().normalize()
        require(!isBuiltInBridge(target)) { "IDEA 原生桥接是内置插件，不能编辑" }
        require(target.startsWith(root)) { "插件路径不在所选范围中" }
        if (Files.exists(target) && existing == null && !request.overwrite) error("已存在同名插件文件")
        Files.createDirectories(target.parent)
        Files.writeString(target, request.content)
        refreshFiles()
        PluginActionResponse(true, "插件文件已保存，OpenCode 重新加载后生效", toPlugin(target, rootFor(target)))
    }.getOrElse { PluginActionResponse(false, it.message ?: "无法保存插件") }

    fun import(request: PluginImportRequest): PluginActionResponse = runCatching {
        val source = choosePlugin() ?: return PluginActionResponse(false, "已取消导入")
        require(isPluginFile(source) && !source.fileName.toString().endsWith(".disabled")) {
            "请选择 .ts 或 .js 插件文件"
        }
        val root = targetRoot(request.scope)
        val target = root.resolve(source.fileName.toString()).normalize()
        require(!isBuiltInBridge(target)) { "不能覆盖内置的 IDEA 原生桥接" }
        if (Files.exists(target) && !request.overwrite) error("已存在同名插件文件")
        Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING)
        refreshFiles()
        PluginActionResponse(true, "插件已导入", toPlugin(target, rootFor(target)))
    }.getOrElse { PluginActionResponse(false, it.message ?: "无法导入插件") }

    fun setEnabled(request: PluginLocationRequest): PluginActionResponse = runCatching {
        val path = validatedPluginFile(request.location)
        require(!isBuiltInBridge(path)) { "请使用内置桥接开关调整状态" }
        val enabled = request.enabled ?: true
        val current = path.fileName.toString()
        val targetName = when {
            enabled && current.endsWith(".disabled") -> current.removeSuffix(".disabled")
            !enabled && !current.endsWith(".disabled") -> "$current.disabled"
            else -> current
        }
        val target = path.resolveSibling(targetName)
        if (path != target) Files.move(path, target, StandardCopyOption.REPLACE_EXISTING)
        refreshFiles()
        PluginActionResponse(true, if (enabled) "插件已启用" else "插件已停用", toPlugin(target, rootFor(target)))
    }.getOrElse { PluginActionResponse(false, it.message ?: "无法更新插件状态") }

    fun delete(request: PluginLocationRequest): PluginActionResponse = runCatching {
        val path = validatedPluginFile(request.location)
        require(!isBuiltInBridge(path)) { "IDEA 原生桥接是内置插件，不能删除" }
        Files.delete(path)
        refreshFiles()
        PluginActionResponse(true, "插件已删除")
    }.getOrElse { PluginActionResponse(false, it.message ?: "无法删除插件") }

    private fun roots(): List<PluginRoot> = buildList {
        projectRoot?.let { root ->
            add(PluginRoot(root.resolve(".opencode/plugins"), "project"))
            add(PluginRoot(root.resolve(".opencode/plugin"), "project"))
        }
        add(PluginRoot(home.resolve(".config/opencode/plugins"), "global"))
        add(PluginRoot(home.resolve(".config/opencode/plugin"), "global"))
    }.map { it.copy(path = it.path.toAbsolutePath().normalize()) }

    private fun targetRoot(scope: String): Path {
        val path = if (scope == "global") {
            home.resolve(".config/opencode/plugins")
        } else {
            (projectRoot ?: error("当前项目没有工作目录")).resolve(".opencode/plugins")
        }.toAbsolutePath().normalize()
        Files.createDirectories(path)
        return path
    }

    private fun rootFor(path: Path): PluginRoot = roots().first { path.toAbsolutePath().normalize().startsWith(it.path) }

    private fun validatedPluginFile(location: String): Path {
        val path = Path.of(location).toAbsolutePath().normalize()
        require(roots().any { path.startsWith(it.path) }) { "插件不在受支持的目录中" }
        require(Files.isRegularFile(path) && isPluginFile(path)) { "插件文件不存在或格式无效" }
        return path
    }

    private fun isPluginFile(path: Path): Boolean {
        val name = path.fileName.toString().lowercase().removeSuffix(".disabled")
        return name.endsWith(".ts") || name.endsWith(".js")
    }

    private fun isBuiltInBridge(path: Path): Boolean {
        val normalized = path.fileName.toString().lowercase().removeSuffix(".disabled")
        return normalized.substringBeforeLast('.') == "capybara-idea"
    }

    private fun normalizeFileName(value: String): String {
        val trimmed = value.trim().replace(Regex("[^A-Za-z0-9._-]+"), "-")
        val withExtension = if (trimmed.endsWith(".ts") || trimmed.endsWith(".js")) trimmed else "$trimmed.ts"
        require(withExtension.isNotBlank() && withExtension !in setOf(".ts", ".js")) { "插件名称无效" }
        return withExtension
    }

    private fun toPlugin(path: Path, root: PluginRoot): ManagedPluginFile {
        val fileName = path.fileName.toString()
        val enabled = !fileName.endsWith(".disabled")
        val normalized = fileName.removeSuffix(".disabled")
        return ManagedPluginFile(
            name = normalized.substringBeforeLast('.'),
            location = path.toAbsolutePath().normalize().toString(),
            scope = root.scope,
            enabled = enabled,
            language = normalized.substringAfterLast('.', "ts"),
            content = Files.readString(path),
        )
    }

    private fun choosePlugin(): Path? {
        var selected: Path? = null
        val choose = Runnable {
            val descriptor = FileChooserDescriptor(true, false, false, false, false, false)
                .withTitle("导入 OpenCode 插件")
                .withDescription("选择 TypeScript 或 JavaScript 插件文件")
                .withFileFilter { file -> file.extension.equals("ts", true) || file.extension.equals("js", true) }
            selected = FileChooser.chooseFile(descriptor, project, null)?.toNioPath()
        }
        val app = ApplicationManager.getApplication()
        if (app.isDispatchThread) choose.run() else app.invokeAndWait(choose)
        return selected
    }

    private fun refreshFiles() = VirtualFileManager.getInstance().asyncRefresh(null)
}
