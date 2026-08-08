package com.aicoding.plugin.services

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.WebSocket
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

data class CdpTarget(
    val id: String,
    val type: String,
    val url: String,
    val title: String,
    val debuggerUrl: String,
)

/**
 * Minimal Chrome DevTools Protocol client built on the JDK's own HTTP/WebSocket stack,
 * so the plugin needs no extra runtime dependency. One session is opened per control
 * request and closed straight after, which keeps JCEF's single debugger slot free.
 */
class CdpClient(private val port: Int) {
    private val json = Json { ignoreUnknownKeys = true }
    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .build()

    fun isReachable(): Boolean = runCatching { targets() }.isSuccess

    fun targets(): List<CdpTarget> {
        val request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/json/list"))
            .timeout(Duration.ofSeconds(4))
            .GET()
            .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        require(response.statusCode() == 200) { "CDP 调试端口返回 HTTP ${response.statusCode()}" }
        return json.parseToJsonElement(response.body()).let { element ->
            element.takeIf { it is kotlinx.serialization.json.JsonArray }
                ?.let { it as kotlinx.serialization.json.JsonArray }
                ?.mapNotNull { item ->
                    val record = item as? JsonObject ?: return@mapNotNull null
                    val debuggerUrl = record["webSocketDebuggerUrl"]?.jsonPrimitive?.contentOrNull
                        ?: return@mapNotNull null
                    CdpTarget(
                        id = record["id"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        type = record["type"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        url = record["url"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        title = record["title"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        debuggerUrl = debuggerUrl,
                    )
                }
                .orEmpty()
        }
    }

    fun <T> withSession(target: CdpTarget, timeoutMs: Long, block: (CdpSession) -> T): T =
        CdpSession(http, URI.create(target.debuggerUrl), timeoutMs).use(block)
}

class CdpSession(
    http: HttpClient,
    endpoint: URI,
    private val defaultTimeoutMs: Long,
) : AutoCloseable {
    private val json = Json { ignoreUnknownKeys = true }
    private val pending = ConcurrentHashMap<Int, CompletableFuture<JsonObject>>()
    private val nextId = AtomicInteger(1)
    private val incoming = StringBuilder()

    private val socket: WebSocket = http.newWebSocketBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .buildAsync(endpoint, object : WebSocket.Listener {
            override fun onOpen(webSocket: WebSocket) {
                webSocket.request(1)
            }

            override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? {
                // CDP payloads can arrive fragmented; only parse once the frame is complete.
                synchronized(incoming) {
                    incoming.append(data)
                    if (last) {
                        val text = incoming.toString()
                        incoming.setLength(0)
                        runCatching { dispatch(text) }
                    }
                }
                webSocket.request(1)
                return null
            }

            override fun onError(webSocket: WebSocket, error: Throwable) {
                pending.values.forEach { it.completeExceptionally(error) }
                pending.clear()
            }

            override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? {
                pending.values.forEach { it.completeExceptionally(IllegalStateException("CDP 连接已关闭：$reason")) }
                pending.clear()
                return null
            }
        })
        .get(8, TimeUnit.SECONDS)

    private fun dispatch(text: String) {
        val message = json.parseToJsonElement(text) as? JsonObject ?: return
        val id = (message["id"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: return
        pending.remove(id)?.complete(message)
    }

    fun call(method: String, params: JsonObject = JsonObject(emptyMap()), timeoutMs: Long = defaultTimeoutMs): JsonObject {
        val id = nextId.getAndIncrement()
        val future = CompletableFuture<JsonObject>()
        pending[id] = future
        val payload = buildJsonObject {
            put("id", id)
            put("method", method)
            put("params", params)
        }
        socket.sendText(payload.toString(), true)
        val message = try {
            future.get(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (error: Exception) {
            pending.remove(id)
            throw IllegalStateException("CDP 命令超时或失败：$method", error)
        }
        (message["error"] as? JsonObject)?.let { failure ->
            val text = failure["message"]?.jsonPrimitive?.contentOrNull ?: failure.toString()
            throw IllegalStateException("CDP 命令返回错误：$method - $text")
        }
        return message["result"] as? JsonObject ?: JsonObject(emptyMap())
    }

    /** Runs an expression in the page and returns its value, unwrapping CDP exceptions. */
    fun evaluate(expression: String, awaitPromise: Boolean = true, timeoutMs: Long = defaultTimeoutMs): JsonElement {
        val result = call(
            "Runtime.evaluate",
            buildJsonObject {
                put("expression", expression)
                put("returnByValue", true)
                put("awaitPromise", awaitPromise)
                put("userGesture", true)
            },
            timeoutMs,
        )
        (result["exceptionDetails"] as? JsonObject)?.let { details ->
            val description = (details["exception"] as? JsonObject)?.get("description")?.jsonPrimitive?.contentOrNull
                ?: details["text"]?.jsonPrimitive?.contentOrNull
                ?: details.toString()
            throw IllegalStateException("页面脚本执行失败：$description")
        }
        return (result["result"] as? JsonObject)?.get("value") ?: JsonNull
    }

    fun dispatchMouseClick(x: Double, y: Double) {
        listOf("mouseMoved", "mousePressed", "mouseReleased").forEach { type ->
            call(
                "Input.dispatchMouseEvent",
                buildJsonObject {
                    put("type", type)
                    put("x", x)
                    put("y", y)
                    put("button", "left")
                    put("clickCount", 1)
                },
            )
        }
    }

    override fun close() {
        runCatching { socket.sendClose(WebSocket.NORMAL_CLOSURE, "done") }
        runCatching { socket.abort() }
    }
}

/** Encodes a Kotlin string as a JavaScript string literal so selectors cannot break out. */
fun jsLiteral(value: String): String = JsonPrimitive(value).toString()

fun JsonObject.doubleField(name: String): Double? = this[name]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
