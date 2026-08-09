package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

@Serializable
data class RemoveProviderRequest(val providerID: String)

@Serializable
data class ConfigEditResponse(
    val success: Boolean,
    val message: String? = null,
    /** Which file was edited, so the user can see what changed. */
    val file: String? = null,
)

/**
 * Edits `opencode.jsonc` / `opencode.json` directly.
 *
 * OpenCode's `PATCH /config` can only merge — it has no way to remove a key, verified against a
 * live server. Deleting a provider therefore has to happen in the file. The edit is textual and
 * brace-matched rather than parse-and-rewrite, so comments and formatting in a hand-maintained
 * JSONC file survive; a `.capybara.bak` copy is written first and restored if verification fails.
 */
@Service(Service.Level.PROJECT)
class OpenCodeConfigService(private val project: Project) {
    private val logger = Logger.getInstance(OpenCodeConfigService::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    fun removeProvider(request: RemoveProviderRequest): ConfigEditResponse = runCatching {
        val providerID = request.providerID.trim()
        require(providerID.isNotBlank()) { "缺少供应商 ID" }
        require(providerID.matches(Regex("^[A-Za-z0-9_.-]+$"))) { "供应商 ID 含有非法字符" }

        val file = candidates().firstOrNull { path ->
            Files.isRegularFile(path) && containsProvider(Files.readString(path), providerID)
        } ?: return ConfigEditResponse(
            success = false,
            message = "在 opencode.json / opencode.jsonc 中没有找到供应商 $providerID",
        )

        val original = Files.readString(file)
        val edited = removeProviderBlock(original, providerID)
            ?: return ConfigEditResponse(false, "无法定位 $providerID 的配置块，请手动编辑 $file", file.toString())
        val cleaned = removeFromDisabledProviders(edited, providerID)

        val backup = file.resolveSibling("${file.fileName}.capybara.bak")
        Files.copy(file, backup, StandardCopyOption.REPLACE_EXISTING)
        Files.writeString(file, cleaned)

        // Verify the result still parses and no longer mentions the provider; restore if not.
        val verified = runCatching {
            val parsed = json.parseToJsonElement(stripComments(Files.readString(file))) as JsonObject
            val providers = parsed["provider"] as? JsonObject
            providers?.containsKey(providerID) != true
        }.getOrDefault(false)
        if (!verified) {
            Files.copy(backup, file, StandardCopyOption.REPLACE_EXISTING)
            return ConfigEditResponse(false, "删除后配置无法解析，已自动还原。请手动编辑 $file", file.toString())
        }

        VirtualFileManager.getInstance().asyncRefresh(null)
        ConfigEditResponse(
            success = true,
            message = "已从 ${file.fileName} 删除 $providerID，备份保存在 ${backup.fileName}。重启服务后生效。",
            file = file.toString(),
        )
    }.getOrElse {
        logger.info("Provider removal failed: ${it.message}")
        ConfigEditResponse(false, it.message ?: "删除供应商失败")
    }

    /**
     * Forces the project's OpenCode config into "ask everything the modes gate" while IDEA owns it.
     *
     * The `permission.ask` hook only runs when OpenCode itself decides to ask; with no permission
     * block every action defaults to allow and the hook never fires (verified on 1.18.12 — `GET
     * /config` returned `permission: undefined`). So the panel is only trustworthy if this file
     * says `ask`.
     *
     * Unlike a one-off scaffold this **overrides whatever is there**, including a hand-written
     * block, because a user rule of `"bash": "allow"` would silently punch a hole in every approval
     * mode. [restorePermissions] puts the original back when the project closes.
     *
     * Only the `permission` value is backed up, not the whole file: a full-file snapshot would
     * discard any provider or model the user edited while IDEA was open. A sidecar left behind by
     * a crash still holds the original, so it is honoured instead of being overwritten.
     */
    fun applyPermissionOverride(): ConfigEditResponse = runCatching {
        val file = projectCandidates().firstOrNull { Files.isRegularFile(it) }
            ?: return ConfigEditResponse(false, "项目里没有 opencode.json / opencode.jsonc，未改动任何配置")

        val original = Files.readString(file)
        runCatching { json.parseToJsonElement(stripComments(original)) as? JsonObject }.getOrNull()
            ?: return ConfigEditResponse(false, "无法解析 $file，请检查语法", file.toString())

        val updated = withPermissionBlock(original)
        if (updated == original) {
            return ConfigEditResponse(true, "配置已经是插件需要的审批设置。", file.toString())
        }

        // Never clobber a sidecar from a crashed session — that one holds the user's real value.
        val sidecar = sidecarOf(file)
        if (!Files.isRegularFile(sidecar)) {
            Files.writeString(sidecar, permissionSpan(original)?.let(original::substring) ?: ABSENT_MARKER)
        }
        Files.writeString(file, updated)

        val verified = runCatching {
            (json.parseToJsonElement(stripComments(Files.readString(file))) as JsonObject).containsKey("permission")
        }.getOrDefault(false)
        if (!verified) {
            Files.writeString(file, original)
            Files.deleteIfExists(sidecar)
            return ConfigEditResponse(false, "写入后配置无法解析，已自动还原。请手动编辑 $file", file.toString())
        }

        VirtualFileManager.getInstance().asyncRefresh(null)
        ConfigEditResponse(
            success = true,
            message = "已接管 ${file.fileName} 的 permission 配置，关闭 IDEA 时自动还原原设置。",
            file = file.toString(),
        )
    }.getOrElse {
        logger.info("Permission override failed: ${it.message}")
        ConfigEditResponse(false, it.message ?: "写入审批配置失败")
    }

    /**
     * Puts the user's own `permission` value back, leaving every other edit made while IDEA was
     * open untouched. Called when the project closes.
     */
    fun restorePermissions(): ConfigEditResponse = runCatching {
        val file = projectCandidates().firstOrNull { Files.isRegularFile(it) }
            ?: return ConfigEditResponse(true, "没有需要还原的配置")
        val sidecar = sidecarOf(file)
        if (!Files.isRegularFile(sidecar)) return ConfigEditResponse(true, "没有备份，无需还原", file.toString())

        val saved = Files.readString(sidecar)
        val current = Files.readString(file)
        val span = permissionSpan(current)
        val restored = when {
            span == null -> current
            saved == ABSENT_MARKER -> current.removeRange(withTrailingComma(current, span))
            else -> current.replaceRange(span, saved)
        }
        Files.writeString(file, restored)
        Files.deleteIfExists(sidecar)
        VirtualFileManager.getInstance().asyncRefresh(null)
        ConfigEditResponse(true, "已还原 ${file.fileName} 的 permission 设置", file.toString())
    }.getOrElse {
        logger.info("Permission restore failed: ${it.message}")
        ConfigEditResponse(false, it.message ?: "还原审批配置失败")
    }

    private fun sidecarOf(file: Path): Path = file.resolveSibling("${file.fileName}.capybara-permission.bak")

    /** Replaces an existing `permission` value, or inserts one when the key is absent. */
    private fun withPermissionBlock(text: String): String {
        val block = GATED_ACTIONS.joinToString(",\n") { "    \"$it\": \"ask\"" }
        val rendered = "\"permission\": {\n$block\n  }"
        val keyIndex = indexOfTopLevelKey(text, "permission")
        if (keyIndex < 0) {
            val opening = text.indexOf('{')
            if (opening < 0) return text
            val note = "\n  // 由水豚助手接管：IDEA 打开本项目期间强制为 ask，关闭时自动还原原文件。\n  "
            return text.substring(0, opening + 1) + note + rendered + "," + text.substring(opening + 1)
        }
        val colon = text.indexOf(':', keyIndex)
        if (colon < 0) return text
        val valueStart = text.indexOfFirst(colon + 1) { !it.isWhitespace() }
        if (valueStart < 0) return text
        val valueEnd = when (text[valueStart]) {
            '{' -> matchBrace(text, valueStart)?.plus(1) ?: return text
            '"' -> text.indexOf('"', valueStart + 1).takeIf { it > 0 }?.plus(1) ?: return text
            else -> return text
        }
        return text.substring(0, keyIndex) + rendered + text.substring(valueEnd)
    }

    /** Character range of the whole `"permission": <value>` pair, or null when the key is absent. */
    private fun permissionSpan(text: String): IntRange? {
        val keyIndex = indexOfTopLevelKey(text, "permission")
        if (keyIndex < 0) return null
        val colon = text.indexOf(':', keyIndex).takeIf { it >= 0 } ?: return null
        val valueStart = text.indexOfFirst(colon + 1) { !it.isWhitespace() }.takeIf { it >= 0 } ?: return null
        val valueEnd = when (text[valueStart]) {
            '{' -> matchBrace(text, valueStart)?.plus(1) ?: return null
            '"' -> text.indexOf('"', valueStart + 1).takeIf { it > 0 }?.plus(1) ?: return null
            else -> return null
        }
        return keyIndex until valueEnd
    }

    /** Widens a span to swallow the separating comma so removing the pair leaves valid JSON. */
    private fun withTrailingComma(text: String, span: IntRange): IntRange {
        var end = span.last + 1
        while (end < text.length && text[end].isWhitespace()) end += 1
        if (end < text.length && text[end] == ',') return span.first until (end + 1)
        // Last entry in the object: take the comma that precedes it instead.
        var start = span.first - 1
        while (start >= 0 && text[start].isWhitespace()) start -= 1
        if (start >= 0 && text[start] == ',') return start until (span.last + 1)
        return span
    }

    /** Finds a key at the top level of the object, skipping nested objects and strings. */
    private fun indexOfTopLevelKey(text: String, key: String): Int {
        val target = "\"$key\""
        var depth = 0
        var index = 0
        var inString = false
        var escaped = false
        while (index < text.length) {
            val char = text[index]
            when {
                escaped -> escaped = false
                char == '\\' && inString -> escaped = true
                char == '"' -> {
                    if (!inString && depth == 1 && text.startsWith(target, index)) return index
                    inString = !inString
                }
                inString -> Unit
                char == '{' || char == '[' -> depth += 1
                char == '}' || char == ']' -> depth -= 1
            }
            index += 1
        }
        return -1
    }

    /** Only the two files inside the opened project. */
    private fun projectCandidates(): List<Path> {
        val projectRoot = project.basePath?.let(Path::of) ?: return emptyList()
        return listOf(projectRoot.resolve("opencode.jsonc"), projectRoot.resolve("opencode.json"))
    }

    private fun candidates(): List<Path> {
        val home = Path.of(System.getProperty("user.home"))
        val projectRoot = project.basePath?.let(Path::of)
        return listOfNotNull(
            projectRoot?.resolve("opencode.jsonc"),
            projectRoot?.resolve("opencode.json"),
            home.resolve(".config/opencode/opencode.jsonc"),
            home.resolve(".config/opencode/opencode.json"),
        )
    }

    private fun containsProvider(text: String, providerID: String): Boolean =
        runCatching {
            val parsed = json.parseToJsonElement(stripComments(text)) as? JsonObject
            (parsed?.get("provider") as? JsonObject)?.containsKey(providerID) == true
        }.getOrDefault(false)

    /**
     * Removes `"id": { ... }` from inside the `provider` object by matching braces, along with
     * whichever comma joins it to its neighbours. Returns null when the block cannot be located.
     */
    private fun removeProviderBlock(text: String, providerID: String): String? {
        val providerKey = Regex("\"provider\"\\s*:\\s*\\{").find(text) ?: return null
        val providerStart = providerKey.range.last
        val providerEnd = matchBrace(text, providerStart) ?: return null

        val entry = Regex("\"${Regex.escape(providerID)}\"\\s*:\\s*\\{")
            .find(text, providerStart) ?: return null
        if (entry.range.first > providerEnd) return null
        val valueEnd = matchBrace(text, entry.range.last) ?: return null

        var start = entry.range.first
        var end = valueEnd + 1
        // Absorb the separating comma: prefer the trailing one, fall back to the leading one.
        val after = text.indexOfFirst(end) { !it.isWhitespace() }
        if (after != -1 && text[after] == ',') {
            end = after + 1
        } else {
            val before = text.lastIndexOfBefore(start) { !it.isWhitespace() }
            if (before != -1 && text[before] == ',') start = before
        }
        return text.removeRange(start, end)
    }

    private fun removeFromDisabledProviders(text: String, providerID: String): String {
        val pattern = Regex("\\s*\"${Regex.escape(providerID)}\"\\s*,?")
        val disabled = Regex("\"disabled_providers\"\\s*:\\s*\\[[^\\]]*\\]").find(text) ?: return text
        val cleaned = disabled.value.replace(pattern, "").replace(Regex(",\\s*\\]"), "]")
        return text.replaceRange(disabled.range, cleaned)
    }

    /** Brace matcher that skips over strings and escapes. */
    private fun matchBrace(text: String, openIndex: Int): Int? {
        var depth = 0
        var index = openIndex
        var inString = false
        var escaped = false
        while (index < text.length) {
            val character = text[index]
            when {
                escaped -> escaped = false
                character == '\\' && inString -> escaped = true
                character == '"' -> inString = !inString
                inString -> Unit
                character == '{' -> depth += 1
                character == '}' -> {
                    depth -= 1
                    if (depth == 0) return index
                }
            }
            index += 1
        }
        return null
    }

    private fun stripComments(text: String): String = text
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
        .lineSequence()
        .joinToString("\n") { line ->
            val marker = line.indexOf("//")
            if (marker < 0) line else {
                // Only strip when the marker is outside a string literal.
                val quotes = line.take(marker).count { it == '"' }
                if (quotes % 2 == 0) line.take(marker) else line
            }
        }

    private inline fun String.indexOfFirst(from: Int, predicate: (Char) -> Boolean): Int {
        for (index in from until length) if (predicate(this[index])) return index
        return -1
    }

    private inline fun String.lastIndexOfBefore(from: Int, predicate: (Char) -> Boolean): Int {
        for (index in (from - 1) downTo 0) if (predicate(this[index])) return index
        return -1
    }

    private companion object {
        /**
         * The permission keys OpenCode 1.18.12 understands, minus the read-only ones
         * (`read`/`glob`/`grep`/`list`/`lsp`/`todowrite`/`question`) which must never prompt.
         * Taken from `Config.permission` in the server's own `/doc` schema.
         */
        /** Written into the sidecar when the file had no permission key to begin with. */
        const val ABSENT_MARKER = "__capybara_absent__"

        val GATED_ACTIONS = listOf(
            "edit",
            "bash",
            "task",
            "external_directory",
            "webfetch",
            "websearch",
            "skill",
        )
    }
}
