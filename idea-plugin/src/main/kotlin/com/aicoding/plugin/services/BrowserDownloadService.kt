package com.aicoding.plugin.services

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Serializable
private data class BrowserDownloadRequest(val filename: String, val content: String)

@Serializable
private data class BrowserDownloadResponse(val url: String)

private data class PendingDownload(
    val filename: String,
    val content: ByteArray,
    val expiresAt: Long,
)

/** One-shot files opened by the system browser instead of downloaded inside JCEF. */
class BrowserDownloadService : HttpHandler {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val pending = ConcurrentHashMap<String, PendingDownload>()

    override fun handle(exchange: HttpExchange) {
        if (exchange.requestMethod == "OPTIONS") {
            respond(exchange, 204, ByteArray(0), "application/json")
            return
        }
        when (exchange.requestMethod) {
            "POST" -> prepare(exchange)
            "GET" -> download(exchange)
            else -> respond(exchange, 405, "Method not allowed".toByteArray(), "text/plain; charset=utf-8")
        }
    }

    private fun prepare(exchange: HttpExchange) {
        val request = runCatching {
            json.decodeFromString<BrowserDownloadRequest>(
                exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8),
            )
        }.getOrElse {
            respond(exchange, 400, "Invalid download request".toByteArray(), "text/plain; charset=utf-8")
            return
        }
        val token = UUID.randomUUID().toString()
        pending[token] = PendingDownload(
            filename = safeFilename(request.filename),
            content = request.content.toByteArray(StandardCharsets.UTF_8),
            expiresAt = System.currentTimeMillis() + TOKEN_TTL_MS,
        )
        cleanup()
        val url = "http://127.0.0.1:" + exchange.localAddress.port + "/browser-download?token=" +
            URLEncoder.encode(token, StandardCharsets.UTF_8)
        respond(
            exchange,
            200,
            json.encodeToString(BrowserDownloadResponse(url)).toByteArray(),
            "application/json; charset=utf-8",
        )
    }

    private fun download(exchange: HttpExchange) {
        val token = query(exchange, "token")
        val item = token?.let(pending::remove)
        if (item == null || item.expiresAt < System.currentTimeMillis()) {
            respond(exchange, 404, "Download expired".toByteArray(), "text/plain; charset=utf-8")
            return
        }
        val encodedName = URLEncoder.encode(item.filename, StandardCharsets.UTF_8).replace("+", "%20")
        exchange.responseHeaders.add("Content-Disposition", "attachment; filename*=UTF-8''$encodedName")
        respond(exchange, 200, item.content, "application/octet-stream")
    }

    private fun cleanup() {
        val now = System.currentTimeMillis()
        pending.entries.removeIf { it.value.expiresAt < now }
    }

    private fun query(exchange: HttpExchange, name: String): String? = exchange.requestURI.rawQuery
        ?.split('&')
        ?.firstOrNull { it.substringBefore('=') == name }
        ?.substringAfter('=', "")
        ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8) }

    private fun safeFilename(value: String): String = value
        .substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[\\\\/:*?\"<>|]"), "_")
        .trim()
        .ifBlank { "download.txt" }

    private fun respond(exchange: HttpExchange, status: Int, body: ByteArray, contentType: String) {
        exchange.responseHeaders.set("Content-Type", contentType)
        exchange.sendResponseHeaders(status, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    private companion object {
        const val TOKEN_TTL_MS = 5 * 60 * 1000L
    }
}
