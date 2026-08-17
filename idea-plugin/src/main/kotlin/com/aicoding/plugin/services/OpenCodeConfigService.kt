package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

@Serializable
data class RemoveProviderRequest(val providerID: String)

@Serializable
data class SaveProviderRequest(val providerID: String, /** Raw JSON object for this provider. */ val config: String)

@Serializable
data class SaveConfigValueRequest(
    val key: String,
    /** Raw JSON for the value — object, array or primitive. */
    val value: String,
)

@Serializable
data class ConfigEditResponse(
    val success: Boolean,
    val message: String? = null,
    /** Which file was edited, so the user can see what changed. */
    val file: String? = null,
)

@Serializable
data class ConfigSnapshotResponse(
    val success: Boolean,
    /** Merged in OpenCode load order, with credentials replaced by a sentinel. */
    val config: JsonObject = JsonObject(emptyMap()),
    val files: List<String> = emptyList(),
    val message: String? = null,
)

/**
 * Edits the user-level `~/.config/opencode/opencode.jsonc` / `opencode.json` directly.
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

    /**
     * Reads configuration files instead of OpenCode's cached `/config` snapshot. Model variants
     * written to disk can otherwise be absent until the service restarts. Credentials are always
     * redacted before this result is returned to JCEF.
     */
    fun readConfigSnapshot(): ConfigSnapshotResponse = runCatching {
        val existing = loadCandidates().filter { Files.isRegularFile(it) }
        var merged = JsonObject(emptyMap())
        val loaded = mutableListOf<String>()
        existing.forEach { file ->
            val parsed = runCatching {
                json.parseToJsonElement(stripComments(Files.readString(file))) as? JsonObject
            }.getOrNull() ?: return@forEach
            merged = mergeObjects(merged, parsed)
            loaded += file.toString()
        }
        ConfigSnapshotResponse(
            success = true,
            config = redactSecrets(merged) as JsonObject,
            files = loaded,
            message = if (loaded.isEmpty()) "没有找到 OpenCode 配置文件" else null,
        )
    }.getOrElse { error ->
        logger.info("OpenCode config read failed: ${error.message}")
        ConfigSnapshotResponse(false, message = error.message ?: "读取 OpenCode 配置失败")
    }

    fun removeProvider(request: RemoveProviderRequest): ConfigEditResponse = runCatching {
        val providerID = request.providerID.trim()
        require(providerID.isNotBlank()) { "缺少供应商 ID" }
        require(providerID.matches(Regex("^[A-Za-z0-9_.-]+$"))) { "供应商 ID 含有非法字符" }

        val file = providerCandidates().firstOrNull { path ->
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
    private fun permissionSpan(text: String): IntRange? = keySpan(text, "permission")

    /** Character range of a whole `"key": <value>` pair at the top level, or null when absent. */
    private fun keySpan(text: String, key: String): IntRange? {
        val keyIndex = indexOfTopLevelKey(text, key)
        if (keyIndex < 0) return null
        val colon = text.indexOf(':', keyIndex).takeIf { it >= 0 } ?: return null
        val valueStart = text.indexOfFirst(colon + 1) { !it.isWhitespace() }.takeIf { it >= 0 } ?: return null
        val valueEnd = when (text[valueStart]) {
            '{', '[' -> matchBrace(text, valueStart)?.plus(1) ?: return null
            '"' -> text.indexOf('"', valueStart + 1).takeIf { it > 0 }?.plus(1) ?: return null
            // Numbers, booleans and null run to the next comma or the closing brace.
            else -> text.indexOfFirst(valueStart) { it == ',' || it == '}' || it == '\n' }
                .takeIf { it > valueStart }
                ?.let { end -> text.substring(valueStart, end).trimEnd().length + valueStart }
                ?: return null
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

    /**
     * Merges one provider's configuration into `opencode.jsonc`.
     *
     * OpenCode 1.18.12's `PATCH /config` answers 200 with the payload echoed back and then drops
     * it — verified by patching a probe provider and finding it in neither `GET /config` nor the
     * file. So every provider edit, including a model blacklist, has to be written here.
     *
     * Only the `provider` value is re-serialised, so comments elsewhere in a hand-maintained
     * JSONC file survive; comments inside the provider block do not.
     */
    fun saveProvider(request: SaveProviderRequest): ConfigEditResponse = runCatching {
        val providerID = request.providerID.trim()
        require(providerID.isNotBlank()) { "缺少供应商 ID" }
        require(providerID.matches(Regex("^[A-Za-z0-9_.-]+$"))) { "供应商 ID 含有非法字符" }

        val file = providerCandidates().firstOrNull { path ->
            Files.isRegularFile(path) && containsProvider(Files.readString(path), providerID)
        } ?: providerCandidates().firstOrNull { Files.isRegularFile(it) }
            ?: createGlobalConfigFile()
        val original = Files.readString(file)
        val parsed = runCatching { json.parseToJsonElement(stripComments(original)) as? JsonObject }.getOrNull()
            ?: return ConfigEditResponse(false, "无法解析 $file，请检查语法", file.toString())

        val providers = (parsed["provider"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
        val entry = runCatching { json.parseToJsonElement(request.config) as? JsonObject }.getOrNull()
            ?: return ConfigEditResponse(false, "供应商配置不是合法的 JSON 对象", file.toString())
        // V2 provider/model endpoints can know a custom provider while GET /config is rebuilding
        // and returns an incomplete entry. Preserve fields omitted by that frontend snapshot (most
        // importantly `models`) while replacing fields it explicitly sent. An explicit model
        // deletion still works because that request includes the complete, reduced models object.
        val previous = providers[providerID] as? JsonObject
        providers[providerID] = mergeProviderConfig(previous, entry)

        writeTopLevelKey(
            file = file,
            original = original,
            key = "provider",
            rendered = json.encodeToString(JsonObject.serializer(), JsonObject(providers)),
        ) { written -> (written["provider"] as? JsonObject)?.containsKey(providerID) == true }
    }.getOrElse { error ->
        logger.info("Provider save failed: ${error.message}")
        ConfigEditResponse(false, error.message ?: "保存供应商失败")
    }

    /**
     * Writes one top-level key, for settings that are not providers — `disabled_providers` today.
     *
     * These used to go through OpenCode's `PATCH /config`, which only ever reaches the running
     * server: the value was accepted, then lost on the next restart because the file never agreed.
     * Two sources of truth for one setting drift apart, so there is now only the file.
     */
    fun saveConfigValue(request: SaveConfigValueRequest): ConfigEditResponse = runCatching {
        val key = request.key.trim()
        require(key.isNotBlank()) { "缺少配置项名称" }
        require(key.matches(Regex("^[A-Za-z0-9_.\$-]+$"))) { "配置项名称含有非法字符" }
        val value = runCatching { json.parseToJsonElement(request.value) }.getOrNull()
            ?: return ConfigEditResponse(false, "配置项 $key 的值不是合法的 JSON")

        val file = providerCandidates().firstOrNull { path ->
            Files.isRegularFile(path) && indexOfTopLevelKey(stripComments(Files.readString(path)), key) >= 0
        } ?: providerCandidates().firstOrNull { Files.isRegularFile(it) }
            ?: createGlobalConfigFile()
        val original = Files.readString(file)
        if (runCatching { json.parseToJsonElement(stripComments(original)) as? JsonObject }.getOrNull() == null) {
            return ConfigEditResponse(false, "无法解析 $file，请检查语法", file.toString())
        }

        writeTopLevelKey(
            file = file,
            original = original,
            key = key,
            rendered = json.encodeToString(JsonElement.serializer(), value),
        ) { written -> written[key] == value }
    }.getOrElse { error ->
        logger.info("Config value save failed: ${error.message}")
        ConfigEditResponse(false, error.message ?: "保存配置失败")
    }

    /**
     * Replaces (or inserts) one top-level key textually, so comments and formatting elsewhere in a
     * hand-maintained JSONC file survive. A `.capybara.bak` copy is taken first and restored when
     * [verify] cannot find the change, which turns a botched edit into a no-op rather than a
     * configuration file the user has to repair by hand.
     */
    private fun writeTopLevelKey(
        file: Path,
        original: String,
        key: String,
        rendered: String,
        verify: (JsonObject) -> Boolean,
    ): ConfigEditResponse {
        val pair = "\"$key\": $rendered"
        val span = keySpan(original, key)
        val updated = if (span != null) {
            original.replaceRange(span, pair)
        } else {
            val opening = original.indexOf('{')
            if (opening < 0) return ConfigEditResponse(false, "配置文件不是 JSON 对象", file.toString())
            original.substring(0, opening + 1) + "\n  " + pair + "," + original.substring(opening + 1)
        }

        val backup = file.resolveSibling("${file.fileName}.capybara.bak")
        Files.copy(file, backup, StandardCopyOption.REPLACE_EXISTING)
        Files.writeString(file, updated)
        val verified = runCatching {
            verify(json.parseToJsonElement(stripComments(Files.readString(file))) as JsonObject)
        }.getOrDefault(false)
        if (!verified) {
            Files.copy(backup, file, StandardCopyOption.REPLACE_EXISTING)
            return ConfigEditResponse(false, "写入后配置无法解析，已自动还原。请手动编辑 $file", file.toString())
        }

        VirtualFileManager.getInstance().asyncRefresh(null)
        return ConfigEditResponse(true, "已写入 ${file.fileName}", file.toString())
    }

    /** Only the two files inside the opened project. */
    private fun projectCandidates(): List<Path> {
        val projectRoot = project.basePath?.let(Path::of) ?: return emptyList()
        return listOf(projectRoot.resolve("opencode.jsonc"), projectRoot.resolve("opencode.json"))
    }

    /** Provider credentials and model configuration are user-owned, never workspace-owned. */
    private fun providerCandidates(): List<Path> {
        val home = Path.of(System.getProperty("user.home"))
        return listOf(
            home.resolve(".config/opencode/opencode.jsonc"),
            home.resolve(".config/opencode/opencode.json"),
        )
    }

    private fun createGlobalConfigFile(): Path {
        val file = providerCandidates().first()
        Files.createDirectories(file.parent)
        Files.writeString(file, "{\n  \"\$schema\": \"https://opencode.ai/config.json\"\n}\n")
        return file
    }

    /** OpenCode loads global files first, then project-local and explicit config locations. */
    private fun loadCandidates(): List<Path> {
        val home = Path.of(System.getProperty("user.home"))
        val global = home.resolve(".config/opencode")
        val projectRoot = project.basePath?.let(Path::of)
        val explicitFile = System.getenv("OPENCODE_CONFIG")?.takeIf(String::isNotBlank)?.let(Path::of)
        val explicitDir = System.getenv("OPENCODE_CONFIG_DIR")?.takeIf(String::isNotBlank)?.let(Path::of)
        return listOfNotNull(
            global.resolve("config.json"),
            global.resolve("opencode.json"),
            global.resolve("opencode.jsonc"),
            explicitFile,
            projectRoot?.resolve("opencode.json"),
            projectRoot?.resolve("opencode.jsonc"),
            projectRoot?.resolve(".opencode/opencode.json"),
            projectRoot?.resolve(".opencode/opencode.jsonc"),
            home.resolve(".opencode/opencode.json"),
            home.resolve(".opencode/opencode.jsonc"),
            explicitDir?.resolve("opencode.json"),
            explicitDir?.resolve("opencode.jsonc"),
        ).distinct()
    }

    private fun containsProvider(text: String, providerID: String): Boolean =
        runCatching {
            val parsed = json.parseToJsonElement(stripComments(text)) as? JsonObject
            (parsed?.get("provider") as? JsonObject)?.containsKey(providerID) == true
        }.getOrDefault(false)

    private fun mergeProviderConfig(previous: JsonObject?, next: JsonObject): JsonObject {
        val merged = previous?.toMutableMap() ?: mutableMapOf()
        next.forEach { (key, value) ->
            val oldValue = merged[key]
            when {
                // The sentinel means "unchanged", so with nothing to keep the key is dropped
                // rather than written. Persisting it would store the literal placeholder as the
                // credential — a provider that then fails to authenticate for no visible reason.
                isRedacted(value) -> oldValue?.let { merged[key] = it } ?: merged.remove(key)
                key == "models" -> merged[key] = value
                oldValue is JsonObject && value is JsonObject -> merged[key] = mergeObjects(oldValue, value)
                else -> merged[key] = value
            }
        }
        return JsonObject(merged)
    }

    private fun mergeObjects(previous: JsonObject, next: JsonObject): JsonObject {
        val merged = previous.toMutableMap()
        next.forEach { (key, value) ->
            val oldValue = merged[key]
            when {
                isRedacted(value) -> oldValue?.let { merged[key] = it } ?: merged.remove(key)
                oldValue is JsonObject && value is JsonObject -> merged[key] = mergeObjects(oldValue, value)
                else -> merged[key] = value
            }
        }
        return JsonObject(merged)
    }

    private fun redactSecrets(value: JsonElement): JsonElement = when (value) {
        is JsonObject -> JsonObject(value.mapValues { (key, child) ->
            if (isSensitiveKey(key)) JsonPrimitive(REDACTED_VALUE) else redactSecrets(child)
        })
        is JsonArray -> JsonArray(value.map(::redactSecrets))
        else -> value
    }

    private fun isSensitiveKey(key: String): Boolean {
        val normalized = key.lowercase().replace("-", "").replace("_", "")
        return normalized in SENSITIVE_KEYS || normalized.endsWith("apikey") || normalized.endsWith("token")
    }

    private fun isRedacted(value: JsonElement): Boolean =
        value is JsonPrimitive && value.isString && value.content == REDACTED_VALUE

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
    /** Works for both `{}` and `[]`; `disabled_providers` is an array, every other key an object. */
    private fun matchBrace(text: String, openIndex: Int): Int? {
        val open = text[openIndex]
        val close = if (open == '[') ']' else '}'
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
                character == open -> depth += 1
                character == close -> {
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
        const val REDACTED_VALUE = "__capybara_redacted__"

        val SENSITIVE_KEYS = setOf(
            "apikey",
            "authorization",
            "cookie",
            "credential",
            "password",
            "secret",
            "token",
        )

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
