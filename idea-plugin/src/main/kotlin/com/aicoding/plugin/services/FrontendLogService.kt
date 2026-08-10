package com.aicoding.plugin.services

import com.intellij.openapi.application.PathManager
import kotlinx.serialization.Serializable
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Serializable
data class FrontendLogEntry(
    /** `error`, `warn`, `log`, `unhandled` or `rejection`. */
    val level: String,
    val message: String,
    /** Browser timestamp in epoch millis; kept so ordering survives batching. */
    val at: Long = 0,
    val stack: String? = null,
    val url: String? = null,
)

@Serializable
data class FrontendLogRequest(val entries: List<FrontendLogEntry> = emptyList())

@Serializable
data class FrontendLogResponse(
    val success: Boolean,
    val path: String? = null,
    val lines: List<String> = emptyList(),
    val message: String? = null,
)

/**
 * Mirrors the JCEF panel's console into a file on disk.
 *
 * Everything the panel does happens inside an embedded browser with no devtools in reach, so a
 * frontend exception was previously invisible from outside — the plugin only ever saw the HTTP
 * calls that did happen, never the render that threw before making one. Writing the console next
 * to `idea.log` makes those failures readable the same way a Kotlin stack trace already is.
 *
 * The file is deliberately plain text and append-only: it is read by humans and by tooling that
 * greps, not by the UI.
 */
class FrontendLogService {

    private val logFile: Path = Path.of(PathManager.getLogPath()).resolve(LOG_NAME)
    private val lock = Any()

    fun append(request: FrontendLogRequest): FrontendLogResponse = runCatching {
        if (request.entries.isEmpty()) return FrontendLogResponse(true, logFile.toString())
        val rendered = request.entries.take(MAX_ENTRIES_PER_CALL).map { entry ->
            buildString {
                append(stamp(entry.at))
                append(" [").append(entry.level.uppercase()).append("] ")
                append(entry.message.replace('\n', '⏎').take(MAX_MESSAGE_CHARS))
                entry.url?.takeIf { it.isNotBlank() }?.let { append("  @").append(it) }
                entry.stack?.takeIf { it.isNotBlank() }?.let {
                    append('\n').append(it.trim().lineSequence().take(MAX_STACK_LINES).joinToString("\n") { line -> "    $line" })
                }
            }
        }
        synchronized(lock) {
            rotateIfLarge()
            Files.createDirectories(logFile.parent)
            Files.write(
                logFile,
                rendered.map { "$it\n" }.joinToString("").toByteArray(),
                StandardOpenOption.CREATE,
                StandardOpenOption.APPEND,
            )
        }
        FrontendLogResponse(success = true, path = logFile.toString())
    }.getOrElse { FrontendLogResponse(false, message = it.message ?: "无法写入前端日志") }

    /** @param limit newest lines to return; the file is read from the end. */
    fun tail(limit: Int): FrontendLogResponse = runCatching {
        if (!Files.isRegularFile(logFile)) {
            return FrontendLogResponse(true, logFile.toString(), message = "尚未产生前端日志")
        }
        val all = synchronized(lock) { Files.readAllLines(logFile) }
        FrontendLogResponse(
            success = true,
            path = logFile.toString(),
            lines = all.takeLast(limit.coerceIn(1, 2000)),
        )
    }.getOrElse { FrontendLogResponse(false, message = it.message ?: "无法读取前端日志") }

    fun clear(): FrontendLogResponse = runCatching {
        synchronized(lock) { Files.deleteIfExists(logFile) }
        FrontendLogResponse(success = true, path = logFile.toString())
    }.getOrElse { FrontendLogResponse(false, message = it.message ?: "无法清空前端日志") }

    /**
     * One generation of history is kept. A console that is looping produces megabytes in minutes,
     * and an unbounded file would eventually be the bug rather than the record of it.
     */
    private fun rotateIfLarge() {
        val size = runCatching { Files.size(logFile) }.getOrDefault(0L)
        if (size < MAX_FILE_BYTES) return
        runCatching { Files.move(logFile, logFile.resolveSibling("$LOG_NAME.1"), java.nio.file.StandardCopyOption.REPLACE_EXISTING) }
    }

    private fun stamp(at: Long): String {
        val time = if (at > 0) {
            java.time.Instant.ofEpochMilli(at).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime()
        } else {
            LocalDateTime.now()
        }
        return time.format(STAMP)
    }

    private companion object {
        const val LOG_NAME = "capybara-frontend.log"
        const val MAX_ENTRIES_PER_CALL = 200
        const val MAX_MESSAGE_CHARS = 4000
        const val MAX_STACK_LINES = 24
        const val MAX_FILE_BYTES = 8L * 1024 * 1024
        val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
    }
}
