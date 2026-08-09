package com.aicoding.plugin.services

import com.aicoding.plugin.ui.CapybaraBrowserWindow
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.LinkedHashMap
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

@Serializable
data class BrowserControlRequest(
    val action: String,
    val url: String? = null,
    val selector: String? = null,
    val pickId: String? = null,
    val script: String? = null,
    val text: String? = null,
    val timeoutMs: Long? = null,
    val maxEvents: Int? = null,
)

@Serializable
data class BrowserElementRect(
    val left: Double = 0.0,
    val top: Double = 0.0,
    val right: Double = 0.0,
    val bottom: Double = 0.0,
    val width: Double = 0.0,
    val height: Double = 0.0,
)

@Serializable
data class BrowserElementPick(
    val id: String = "",
    val selector: String,
    val tagName: String = "",
    val text: String = "",
    val outerHtml: String = "",
    val rect: BrowserElementRect = BrowserElementRect(),
    val url: String,
    val frameUrl: String = "",
    val comment: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Serializable
data class BrowserStatus(
    val browserOpen: Boolean,
    val currentUrl: String? = null,
    val jcefSupported: Boolean,
    /** Always available once the window is open; needs no debug port. */
    val scriptBridgeReady: Boolean,
    /** Available whenever the window is open; the capture is painted off the component. */
    val screenshotAvailable: Boolean,
    val picks: List<BrowserElementPick> = emptyList(),
)

@Serializable
data class BrowserControlResponse(
    val success: Boolean,
    val action: String? = null,
    val result: JsonElement? = null,
    val message: String? = null,
    val status: BrowserStatus? = null,
    val picks: List<BrowserElementPick> = emptyList(),
)

@Serializable
data class BrowserPicksEvent(val url: String, val picks: List<BrowserElementPick>)

/** Quotes a string for safe interpolation into injected JavaScript. */
private fun jsLiteral(value: String): String = JsonPrimitive(value).toString()

/** Implemented by the browser window so the service can drive the visible page. */
interface CapybaraBrowserHost {
    val currentUrl: String
    val isReady: Boolean
    fun evaluate(expression: String, timeoutMs: Long): JsonElement
    fun loadUrl(url: String)
    fun openDevTools()
    fun setPickerEnabled(enabled: Boolean)
    fun syncPicks(picks: List<BrowserElementPick>)

    /**
     * Base64 PNG of the visible page, painted straight off the JCEF component.
     *
     * The CDP path needs the remote debugging port, which CEF refuses unless it was set before the
     * first browser was created — in practice the status bar just read "截图（CDP 9222）：不可用".
     * Off-screen rendering means the component itself holds the rasterised page, so painting it
     * into a BufferedImage works with no port at all. Viewport only, not the full scrollable page.
     */
    fun capturePng(): String?
}

/**
 * Turns `/browser/control` requests into page operations.
 *
 * The default transport is a [com.intellij.ui.jcef.JBCefJSQuery] bridge owned by the browser
 * window, which works without any debug port and therefore without restarting the IDE.
 */
@Service(Service.Level.PROJECT)
class BrowserControlService(private val project: Project) {
    private val logger = Logger.getInstance(BrowserControlService::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val host = AtomicReference<CapybaraBrowserHost?>(null)
    private val picksByUrl = ConcurrentHashMap<String, LinkedHashMap<String, BrowserElementPick>>()
    private val picksLock = Any()

    fun attach(browserHost: CapybaraBrowserHost) {
        host.set(browserHost)
        browserHost.syncPicks(picksFor(browserHost.currentUrl))
    }

    /**
     * Detaches one tab. Annotations are keyed by page URL and other tabs may still be showing
     * those pages, so closing a tab must not wipe them — [forgetAllPicks] does that when the
     * whole browser window goes away.
     */
    fun detach(browserHost: CapybaraBrowserHost) {
        host.compareAndSet(browserHost, null)
    }

    fun forgetAllPicks() {
        host.set(null)
        synchronized(picksLock) { picksByUrl.clear() }
    }

    fun recordPick(pick: BrowserElementPick): BrowserElementPick {
        val normalized = normalizePick(pick)
        val stored = synchronized(picksLock) {
            val pagePicks = picksByUrl.getOrPut(pageKey(normalized.url)) { LinkedHashMap() }
            val existing = pagePicks[normalized.id]
                ?: pagePicks.values.firstOrNull {
                    it.selector == normalized.selector && it.frameUrl == normalized.frameUrl
                }
            val merged = normalized.copy(
                id = existing?.id ?: normalized.id,
                comment = normalized.comment ?: existing?.comment,
                createdAt = existing?.createdAt ?: normalized.createdAt,
            )
            if (existing != null && existing.id != merged.id) pagePicks.remove(existing.id)
            pagePicks[merged.id] = merged
            merged
        }
        syncCurrentHost()
        return stored
    }

    fun addComment(pickId: String?, selector: String?, comment: String): BrowserElementPick {
        val browserHost = host.get() ?: error(BROWSER_CLOSED)
        val value = comment.trim()
        require(value.isNotBlank()) { "评论内容不能为空" }
        val pageUrl = browserHost.currentUrl
        val updated = synchronized(picksLock) {
            val pagePicks = picksByUrl.getOrPut(pageKey(pageUrl)) { LinkedHashMap() }
            val existing = pickId?.let(pagePicks::get)
                ?: selector?.let { target -> pagePicks.values.firstOrNull { it.selector == target } }
            val pick = existing?.copy(comment = value) ?: BrowserElementPick(
                id = pickId?.takeIf(String::isNotBlank) ?: newPickId(),
                selector = selector?.takeIf(String::isNotBlank)
                    ?: error("addComment 需要 pickId 或 selector 参数"),
                url = pageUrl,
                frameUrl = pageUrl,
                comment = value,
            )
            pagePicks[pick.id] = pick
            pick
        }
        syncCurrentHost()
        return updated
    }

    fun clearPicks(): Int {
        val currentUrl = host.get()?.currentUrl
        val removed = synchronized(picksLock) {
            if (currentUrl == null) {
                val total = picksByUrl.values.sumOf { it.size }
                picksByUrl.clear()
                total
            } else {
                picksByUrl.remove(pageKey(currentUrl))?.size ?: 0
            }
        }
        syncCurrentHost()
        return removed
    }

    /** Drops a single annotation. Clearing them all was previously the only option. */
    fun removePick(pickId: String?): Boolean {
        val id = pickId?.takeIf { it.isNotBlank() } ?: return false
        val removed = synchronized(picksLock) {
            picksByUrl.entries.toList().any { (key, picks) ->
                if (picks.remove(id) == null) return@any false
                if (picks.isEmpty()) picksByUrl.remove(key)
                true
            }
        }
        if (removed) syncCurrentHost()
        return removed
    }

    fun currentPicks(): List<BrowserElementPick> = activePicks()

    fun status(): BrowserStatus {
        val browserHost = host.get()
        return BrowserStatus(
            browserOpen = browserHost != null,
            currentUrl = browserHost?.currentUrl,
            jcefSupported = runCatching { JBCefApp.isSupported() }.getOrDefault(false),
            screenshotAvailable = browserHost != null,
            scriptBridgeReady = browserHost?.isReady == true,
            picks = browserHost?.let { picksFor(it.currentUrl) }.orEmpty(),
        )
    }

    fun control(request: BrowserControlRequest): BrowserControlResponse = runCatching {
        val action = request.action.trim().lowercase()
        val timeout = (request.timeoutMs ?: DEFAULT_TIMEOUT_MS).coerceIn(1_000, 120_000)
        if (action == "status") {
            val currentStatus = status()
            return BrowserControlResponse(
                true,
                action = action,
                status = currentStatus,
                picks = currentStatus.picks,
            )
        }
        if (action == "open") return openBrowser(request.url, timeout)

        val browserHost = host.get() ?: error(BROWSER_CLOSED)

        val result: JsonElement = when (action) {
            "opendevtools" -> {
                browserHost.openDevTools()
                JsonPrimitive("已打开独立 DevTools 窗口")
            }
            "pickelement" -> {
                browserHost.setPickerEnabled(true)
                JsonPrimitive("已进入元素拾取模式；按 Esc 可退出")
            }
            "stoppick" -> {
                browserHost.setPickerEnabled(false)
                JsonPrimitive("已退出元素拾取模式")
            }
            "listpicks" -> json.encodeToJsonElement(picksFor(browserHost.currentUrl))
            "clearpicks" -> JsonPrimitive("已清除 ${clearPicks()} 个页面标注")
            "addcomment" -> json.encodeToJsonElement(
                addComment(request.pickId, request.selector, request.text.orEmpty()),
            )
            "navigate" -> navigate(browserHost, validUrl(request.url), timeout)
            "click" -> browserHost.evaluate(clickScript(requireSelector(request.selector)), timeout)
            "gettext" -> browserHost.evaluate(
                "(() => { const el = ${selectorExpression(request.selector)}; return el ? (el.innerText || el.textContent || '') : null; })()",
                timeout,
            )
            "gethtml" -> browserHost.evaluate(
                "(() => { const el = ${selectorExpression(request.selector)}; return el ? el.outerHTML : null; })()",
                timeout,
            )
            "type" -> browserHost.evaluate(
                typeScript(requireSelector(request.selector), request.text.orEmpty()),
                timeout,
            )
            "waitfor" -> browserHost.evaluate(
                waitForScript(requireSelector(request.selector), timeout),
                timeout + 5_000,
            )
            "executescript" -> browserHost.evaluate(
                request.script?.takeIf(String::isNotBlank) ?: error("executeScript 需要 script 参数"),
                timeout,
            )
            "listensse" -> browserHost.evaluate(
                listenSseScript(validUrl(request.url), request.maxEvents ?: 5, timeout),
                timeout + 5_000,
            )
            "screenshot" -> screenshot(browserHost)
            else -> error("不支持的浏览器指令：${request.action}")
        }
        BrowserControlResponse(
            true,
            action = action,
            result = result,
            picks = picksFor(browserHost.currentUrl),
        )
    }.getOrElse { error ->
        logger.info("Browser control failed: ${error.message}")
        BrowserControlResponse(
            success = false,
            action = request.action,
            message = error.message ?: "浏览器指令执行失败",
            status = status(),
            picks = activePicks(),
        )
    }

    private fun openBrowser(url: String?, timeoutMs: Long): BrowserControlResponse {
        require(runCatching { JBCefApp.isSupported() }.getOrDefault(false)) {
            "当前 IDEA 运行时不支持 JCEF，无法打开水豚浏览器"
        }
        val targetUrl = url?.takeIf(String::isNotBlank)?.let(::validUrl)
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) {
            CapybaraBrowserWindow.open(project, targetUrl)
        } else {
            application.invokeLater { CapybaraBrowserWindow.open(project, targetUrl) }
            val deadline = System.currentTimeMillis() + timeoutMs
            while (host.get() == null && System.currentTimeMillis() < deadline) Thread.sleep(100)
        }
        require(host.get() != null) { "水豚浏览器窗口在超时前没有完成打开" }
        val currentStatus = status()
        return BrowserControlResponse(
            success = true,
            action = "open",
            result = JsonPrimitive(if (targetUrl == null) "已打开水豚浏览器" else "已打开水豚浏览器：$targetUrl"),
            status = currentStatus,
            picks = currentStatus.picks,
        )
    }

    private fun normalizePick(pick: BrowserElementPick): BrowserElementPick {
        require(pick.selector.isNotBlank()) { "拾取结果缺少 selector" }
        val currentUrl = host.get()?.currentUrl.orEmpty()
        val pageUrl = pick.url.ifBlank { currentUrl }
        return pick.copy(
            id = pick.id.takeIf(String::isNotBlank) ?: newPickId(),
            selector = pick.selector.trim(),
            tagName = pick.tagName.lowercase(),
            text = pick.text.take(MAX_PICK_TEXT),
            outerHtml = pick.outerHtml.take(MAX_PICK_HTML),
            url = pageUrl,
            frameUrl = pick.frameUrl.ifBlank { pageUrl },
        )
    }

    private fun picksFor(url: String): List<BrowserElementPick> = synchronized(picksLock) {
        picksByUrl[pageKey(url)]?.values?.toList().orEmpty()
    }

    private fun activePicks(): List<BrowserElementPick> =
        host.get()?.let { picksFor(it.currentUrl) }.orEmpty()

    private fun syncCurrentHost() {
        val browserHost = host.get() ?: return
        val picks = picksFor(browserHost.currentUrl)
        browserHost.syncPicks(picks)
        // Tell the assistant panel, so the composer can show a chip the way attachments do.
        runCatching {
            com.aicoding.plugin.server.HttpServerManager.forProject(project)
                ?.broadcastSse("browser.picks-changed", json.encodeToString(BrowserPicksEvent.serializer(), BrowserPicksEvent(
                    url = browserHost.currentUrl,
                    picks = picks,
                )))
        }
    }

    private fun pageKey(url: String): String = url.substringBefore('#').trimEnd('/')

    private fun newPickId(): String = "pick_${UUID.randomUUID().toString().replace("-", "").take(16)}"

    private fun navigate(browserHost: CapybaraBrowserHost, url: String, timeoutMs: Long): JsonElement {
        browserHost.loadUrl(url)
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastError: String? = null
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(250)
            val settled = runCatching {
                browserHost.evaluate(
                    "JSON.stringify({ ready: document.readyState, url: location.href, title: document.title })",
                    3_000,
                )
            }.getOrElse { failure ->
                // The bridge is re-injected on navigation, so early polls can legitimately fail.
                lastError = failure.message
                null
            }
            val encoded = (settled as? JsonPrimitive)?.contentOrNull ?: continue
            if (encoded.contains("\"ready\":\"complete\"")) return JsonPrimitive(encoded)
        }
        error(lastError ?: "页面在超时前没有加载完成：$url")
    }

    /**
     * Base64 PNG of the visible page.
     *
     * This used to go through the CEF remote-debugging port, which only accepts its command-line
     * flag before the first JCEF browser in the IDE is created — so whether it worked depended on
     * which plugin happened to start JCEF first. Painting the off-screen component needs no port
     * and always works while the window is open, so the CDP client was removed entirely.
     */
    private fun screenshot(browserHost: CapybaraBrowserHost): JsonElement {
        val encoded = browserHost.capturePng() ?: error("截图失败：浏览器窗口没有可绘制的内容")
        return buildJsonObject {
            put("format", "png")
            put("source", "cef")
            put("data", encoded)
        }
    }

    /**
     * Synthetic pointer + mouse sequence. React and Radix listen for pointerdown/mousedown, so a
     * bare `el.click()` is not enough for menus and comboboxes.
     */
    private fun clickScript(selector: String): String = """
        (() => {
          const el = document.querySelector(${jsLiteral(selector)});
          if (!el) throw new Error('没有找到元素：' + ${jsLiteral(selector)});
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = el.getBoundingClientRect();
          const base = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2, view: window };
          if (typeof el.focus === 'function') el.focus();
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
            const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
            el.dispatchEvent(new Ctor(type, base));
          });
          return 'clicked ' + ${jsLiteral(selector)};
        })()
    """.trimIndent()

    private fun typeScript(selector: String, text: String): String = """
        (() => {
          const el = document.querySelector(${jsLiteral(selector)});
          if (!el) throw new Error('没有找到元素：' + ${jsLiteral(selector)});
          el.focus();
          const value = ${jsLiteral(text)};
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
          const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
          if (setter && setter.set) setter.set.call(el, value);
          else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'typed ' + value.length + ' chars';
        })()
    """.trimIndent()

    private fun waitForScript(selector: String, timeoutMs: Long): String = """
        new Promise((resolve, reject) => {
          const selector = ${jsLiteral(selector)};
          const found = () => document.querySelector(selector);
          if (found()) { resolve('found ' + selector); return; }
          const observer = new MutationObserver(() => {
            if (found()) { observer.disconnect(); clearTimeout(timer); resolve('found ' + selector); }
          });
          const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error('等待元素超时：' + selector));
          }, ${timeoutMs});
          observer.observe(document.documentElement, { childList: true, subtree: true });
        })
    """.trimIndent()

    private fun listenSseScript(url: String, maxEvents: Int, timeoutMs: Long): String {
        val budget = (timeoutMs - 1_000).coerceAtLeast(1_000)
        return """
            new Promise((resolve) => {
              const events = [];
              let source;
              const finish = (reason) => {
                try { if (source) source.close(); } catch (e) { /* already closed */ }
                resolve(JSON.stringify({ reason, count: events.length, events }));
              };
              const timer = setTimeout(() => finish('timeout'), ${budget});
              try {
                source = new EventSource(${jsLiteral(url)});
              } catch (error) {
                clearTimeout(timer);
                finish('error: ' + error);
                return;
              }
              const push = (type, event) => {
                events.push({ type, data: typeof event.data === 'string' ? event.data.slice(0, 4000) : null });
                if (events.length >= ${maxEvents.coerceIn(1, 200)}) { clearTimeout(timer); finish('complete'); }
              };
              source.onmessage = (event) => push('message', event);
              source.onerror = () => { if (source.readyState === 2) { clearTimeout(timer); finish('closed'); } };
            })
        """.trimIndent()
    }

    private fun selectorExpression(selector: String?): String =
        if (selector.isNullOrBlank()) "document.body" else "document.querySelector(${jsLiteral(selector)})"

    private fun requireSelector(selector: String?): String =
        selector?.takeIf(String::isNotBlank) ?: error("该指令需要 selector 参数")

    private fun validUrl(url: String?): String {
        val value = url?.trim().orEmpty()
        require(value.isNotBlank()) { "该指令需要 url 参数" }
        require(
            value.startsWith("http://") || value.startsWith("https://") || value == "about:blank"
        ) { "只支持 http、https 或 about:blank 地址" }
        return value
    }

    companion object {
        private const val DEFAULT_TIMEOUT_MS = 20_000L
        private const val MAX_PICK_TEXT = 2_000
        private const val MAX_PICK_HTML = 8_000
        private const val BROWSER_CLOSED =
            "内置浏览器未打开。请先调用 idea_browser 的 open 动作，或在 IDEA 菜单「工具 → 打开水豚浏览器」中打开。"
    }
}
