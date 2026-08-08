package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefApp
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.atomic.AtomicReference

@Serializable
data class BrowserControlRequest(
    val action: String,
    val url: String? = null,
    val selector: String? = null,
    val script: String? = null,
    val text: String? = null,
    val timeoutMs: Long? = null,
    val maxEvents: Int? = null,
)

@Serializable
data class BrowserStatus(
    val browserOpen: Boolean,
    val currentUrl: String? = null,
    val jcefSupported: Boolean,
    /** Always available once the window is open; needs no debug port. */
    val scriptBridgeReady: Boolean,
    val debugPort: Int,
    /** Only true when CEF accepted the remote-debugging port this session. */
    val cdpReady: Boolean,
    /** Screenshots are the one action that needs CDP. */
    val screenshotAvailable: Boolean,
)

@Serializable
data class BrowserControlResponse(
    val success: Boolean,
    val action: String? = null,
    val result: JsonElement? = null,
    val message: String? = null,
    val status: BrowserStatus? = null,
)

/** Implemented by the browser window so the service can drive the visible page. */
interface CapybaraBrowserHost {
    val currentUrl: String
    val isReady: Boolean
    fun evaluate(expression: String, timeoutMs: Long): JsonElement
    fun loadUrl(url: String)
    fun openDevTools()
}

/**
 * Turns `/browser/control` requests into page operations.
 *
 * The default transport is a [com.intellij.ui.jcef.JBCefJSQuery] bridge owned by the browser
 * window, which works without any debug port and therefore without restarting the IDE. CDP is
 * used only for screenshots, and only when CEF happened to accept the debug port this session.
 */
@Service(Service.Level.PROJECT)
class BrowserControlService {
    private val logger = Logger.getInstance(BrowserControlService::class.java)
    private val host = AtomicReference<CapybaraBrowserHost?>(null)
    private val cdp = CdpClient(DEBUG_PORT)

    fun attach(browserHost: CapybaraBrowserHost) = host.set(browserHost)

    fun detach(browserHost: CapybaraBrowserHost) {
        host.compareAndSet(browserHost, null)
    }

    fun status(): BrowserStatus {
        val browserHost = host.get()
        val cdpReady = runCatching { cdp.isReachable() }.getOrDefault(false)
        return BrowserStatus(
            browserOpen = browserHost != null,
            cdpReady = cdpReady,
            currentUrl = browserHost?.currentUrl,
            debugPort = DEBUG_PORT,
            jcefSupported = runCatching { JBCefApp.isSupported() }.getOrDefault(false),
            screenshotAvailable = cdpReady,
            scriptBridgeReady = browserHost?.isReady == true,
        )
    }

    fun control(request: BrowserControlRequest): BrowserControlResponse = runCatching {
        val action = request.action.trim().lowercase()
        if (action == "status") {
            return BrowserControlResponse(true, action = action, status = status())
        }

        val browserHost = host.get() ?: error(BROWSER_CLOSED)
        val timeout = (request.timeoutMs ?: DEFAULT_TIMEOUT_MS).coerceIn(1_000, 120_000)

        val result: JsonElement = when (action) {
            "opendevtools" -> {
                browserHost.openDevTools()
                JsonPrimitive("已打开独立 DevTools 窗口")
            }
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
            "screenshot" -> screenshot(browserHost, timeout)
            else -> error("不支持的浏览器指令：${request.action}")
        }
        BrowserControlResponse(true, action = action, result = result)
    }.getOrElse { error ->
        logger.info("Browser control failed: ${error.message}")
        BrowserControlResponse(
            success = false,
            action = request.action,
            message = error.message ?: "浏览器指令执行失败",
            status = status(),
        )
    }

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

    private fun screenshot(browserHost: CapybaraBrowserHost, timeoutMs: Long): JsonElement {
        require(runCatching { cdp.isReachable() }.getOrDefault(false)) {
            "截图需要 CEF 调试端口 $DEBUG_PORT。请先关闭所有 JCEF 面板并重启 IDEA，然后先打开水豚浏览器再打开助手。"
        }
        val pages = cdp.targets().filter { it.type == "page" }
        val hostUrl = browserHost.currentUrl.trimEnd('/')
        val target = pages.firstOrNull { it.url.trimEnd('/') == hostUrl }
            ?: pages.firstOrNull()
            ?: error("没有可截图的页面")
        return cdp.withSession(target, timeoutMs) { session ->
            val result = session.call("Page.captureScreenshot", buildJsonObject { put("format", "png") })
            val data = result["data"]?.jsonPrimitive?.contentOrNull ?: error("截图失败")
            JsonPrimitive("data:image/png;base64,$data")
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
        /** Fixed so external tooling can find the debugger when CEF accepts it. */
        const val DEBUG_PORT = 9222
        private const val DEFAULT_TIMEOUT_MS = 20_000L
        private const val BROWSER_CLOSED =
            "内置浏览器未打开。请在 IDEA 菜单「工具 → 打开水豚浏览器」中打开后再试。"

        @Volatile
        private var configured = false

        /**
         * Best-effort attempt to enable CEF remote debugging, used only for screenshots.
         * Must run before the first JBCefBrowser exists; if JCEF already started, this is a
         * no-op and [BrowserStatus.cdpReady] stays false. Deliberately never called from the
         * assistant panel so this feature cannot affect it.
         */
        @Synchronized
        fun tryEnableDebugPort() {
            if (configured) return
            configured = true
            runCatching {
                if (JBCefApp.isStarted()) return
                System.setProperty("ide.browser.jcef.debug.port", DEBUG_PORT.toString())
                val configClass = Class.forName("com.jetbrains.cef.JCefAppConfig")
                val config = configClass.getMethod("getInstance").invoke(null)
                val settings = configClass.getMethod("getCefSettings").invoke(config)
                settings.javaClass.getField("remote_debugging_port").setInt(settings, DEBUG_PORT)
            }.onFailure {
                Logger.getInstance(BrowserControlService::class.java)
                    .info("CEF debug port not enabled (screenshots unavailable): ${it.message}")
            }
        }
    }
}
