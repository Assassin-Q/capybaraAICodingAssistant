package com.aicoding.plugin.services

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/**
 * Shared access to `~/.config/opencode/opencode-mem.jsonc`.
 *
 * The engine ships a JSONC file that users hand-edit, so comments and trailing commas have to
 * survive a round trip through the parser even though kotlinx.serialization only speaks strict
 * JSON. [sanitizeJsonc] strips both without touching string contents.
 *
 * Both [MemorySystemService] and [MemoryEmbeddingService] write to this one file, so the load and
 * write helpers live here rather than being duplicated with subtly different backup behaviour.
 */
object MemoryConfigFile {
    private val json = Json { prettyPrint = true; encodeDefaults = true; ignoreUnknownKeys = true }

    val configDirectory: File = File(System.getProperty("user.home"), ".config/opencode")

    val file: File get() = File(configDirectory, "opencode-mem.jsonc")

    fun load(): JsonObject {
        if (!file.isFile) return JsonObject(emptyMap())
        return runCatching { parseObject(sanitizeJsonc(file.readText(Charsets.UTF_8))) }
            .getOrDefault(JsonObject(emptyMap()))
    }

    fun write(value: JsonObject) {
        configDirectory.mkdirs()
        if (file.isFile) {
            val backup = File(configDirectory, "opencode-mem.jsonc.capybara.bak")
            if (!backup.exists()) file.copyTo(backup)
        }
        file.writeText(json.encodeToString(JsonObject.serializer(), value), Charsets.UTF_8)
    }

    fun parseObject(value: String): JsonObject = runCatching {
        json.parseToJsonElement(value).jsonObject
    }.getOrDefault(JsonObject(emptyMap()))

    fun expandPath(path: String): String = when {
        path == "~" -> System.getProperty("user.home")
        path.startsWith("~/") || path.startsWith("~\\") ->
            File(System.getProperty("user.home"), path.drop(2)).absolutePath
        else -> path
    }

    /** Strips `//` and block comments plus trailing commas, leaving string literals untouched. */
    fun sanitizeJsonc(source: String): String {
        val withoutComments = StringBuilder(source.length)
        var inString = false
        var escaped = false
        var lineComment = false
        var blockComment = false
        var index = 0
        while (index < source.length) {
            val char = source[index]
            val next = source.getOrNull(index + 1)
            when {
                lineComment && char == '\n' -> {
                    lineComment = false
                    withoutComments.append(char)
                }
                lineComment -> Unit
                blockComment && char == '*' && next == '/' -> {
                    blockComment = false
                    index++
                }
                blockComment -> if (char == '\n') withoutComments.append(char)
                inString -> {
                    withoutComments.append(char)
                    if (escaped) escaped = false
                    else if (char == '\\') escaped = true
                    else if (char == '"') inString = false
                }
                char == '"' -> {
                    inString = true
                    withoutComments.append(char)
                }
                char == '/' && next == '/' -> {
                    lineComment = true
                    index++
                }
                char == '/' && next == '*' -> {
                    blockComment = true
                    index++
                }
                else -> withoutComments.append(char)
            }
            index++
        }
        val result = StringBuilder(withoutComments.length)
        inString = false
        escaped = false
        index = 0
        while (index < withoutComments.length) {
            val char = withoutComments[index]
            if (inString) {
                result.append(char)
                if (escaped) escaped = false
                else if (char == '\\') escaped = true
                else if (char == '"') inString = false
                index++
                continue
            }
            if (char == '"') {
                inString = true
                result.append(char)
                index++
                continue
            }
            if (char == ',') {
                var cursor = index + 1
                while (cursor < withoutComments.length && withoutComments[cursor].isWhitespace()) cursor++
                if (withoutComments.getOrNull(cursor) == '}' || withoutComments.getOrNull(cursor) == ']') {
                    index++
                    continue
                }
            }
            result.append(char)
            index++
        }
        return result.toString()
    }

    fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
    fun JsonObject.boolean(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
    fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull
}
