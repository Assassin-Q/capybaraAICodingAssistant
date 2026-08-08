package com.aicoding.plugin.ui

import com.aicoding.plugin.services.BrowserControlService
import com.aicoding.plugin.services.CapybaraBrowserHost
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefDisplayHandler
import org.cef.handler.CefRequestHandler
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import java.lang.reflect.Proxy
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTextField
import javax.swing.SwingUtilities

/**
 * The controllable browser. It lives in its own window (see [CapybaraBrowserWindow]) rather than
 * a tool window, so it never competes with the assistant panel for space or for JCEF startup.
 *
 * Page control goes through a [JBCefJSQuery] bridge instead of the CEF debug port: the bridge is
 * available as soon as the window opens and needs no IDE restart.
 */
class CapybaraBrowserPanel(private val project: Project) : JPanel(BorderLayout()), Disposable, CapybaraBrowserHost {
    private val logger = Logger.getInstance(CapybaraBrowserPanel::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    private val browser = JBCefBrowser.createBuilder()
        // Windowed rendering fixes right-click menus and IME input on 2023.2+.
        .setOffScreenRendering(false)
        .setUrl(HOME_PAGE)
        .build()

    private val bridge: JBCefJSQuery = JBCefJSQuery.create(browser as com.intellij.ui.jcef.JBCefBrowserBase)
    private val pending = ConcurrentHashMap<String, CompletableFuture<JsonElement>>()
    private val nextRequestId = AtomicLong(1)

    private val addressField = JTextField(HOME_PAGE)
    private val statusLabel = JLabel(" ")
    private val service = project.getService(BrowserControlService::class.java)

    @Volatile
    private var address: String = HOME_PAGE

    @Volatile
    private var loaded = false

    override val currentUrl: String get() = address
    override val isReady: Boolean get() = loaded

    init {
        preferredSize = Dimension(1100, 780)
        minimumSize = Dimension(480, 360)
        add(buildToolbar(), BorderLayout.NORTH)
        add(browser.component, BorderLayout.CENTER)
        add(statusLabel, BorderLayout.SOUTH)
        installBridge()
        installHandlers()
        service.attach(this)
        updateStatus()
    }

    private fun buildToolbar(): JPanel {
        val bar = JPanel(BorderLayout(6, 0))
        val left = JPanel(FlowLayout(FlowLayout.LEFT, 4, 4))
        left.add(JButton("←").apply { addActionListener { browser.cefBrowser.goBack() } })
        left.add(JButton("→").apply { addActionListener { browser.cefBrowser.goForward() } })
        left.add(JButton("刷新").apply { addActionListener { browser.cefBrowser.reload() } })

        val right = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 4))
        right.add(JButton("打开").apply { addActionListener { loadUrl(addressField.text) } })
        // Embedded DevTools are unstable across IDEA builds; always use the standalone window.
        right.add(JButton("DevTools").apply { addActionListener { openDevTools() } })

        addressField.addActionListener { loadUrl(addressField.text) }
        bar.add(left, BorderLayout.WEST)
        bar.add(addressField, BorderLayout.CENTER)
        bar.add(right, BorderLayout.EAST)
        return bar
    }

    private fun installBridge() {
        bridge.addHandler { payload ->
            runCatching {
                val message = json.parseToJsonElement(payload) as JsonObject
                val id = message["id"]?.jsonPrimitive?.contentOrNull ?: return@runCatching
                val future = pending.remove(id) ?: return@runCatching
                val ok = message["ok"]?.jsonPrimitive?.contentOrNull == "true"
                if (ok) {
                    future.complete(message["value"] ?: JsonNull)
                } else {
                    val reason = message["value"]?.jsonPrimitive?.contentOrNull ?: "页面脚本执行失败"
                    future.completeExceptionally(IllegalStateException(reason))
                }
            }.onFailure { logger.info("Browser bridge payload rejected: ${it.message}") }
            null
        }
    }

    override fun evaluate(expression: String, timeoutMs: Long): JsonElement {
        check(loaded) { "页面尚未加载完成，请稍后重试。" }
        val id = "capybara_${nextRequestId.getAndIncrement()}"
        val future = CompletableFuture<JsonElement>()
        pending[id] = future
        // ok/value are stringified so the payload is always a flat JSON object.
        val callback = bridge.inject(
            "JSON.stringify({ id: __capybaraId, ok: String(__capybaraOk), value: __capybaraValue })"
        )
        val script = """
            (function () {
              var __capybaraId = ${jsString(id)};
              function __capybaraSend(__capybaraOk, __capybaraValue) {
                if (__capybaraValue === undefined) __capybaraValue = null;
                if (typeof __capybaraValue === 'object' && __capybaraValue !== null) {
                  try { __capybaraValue = JSON.stringify(__capybaraValue); } catch (e) { __capybaraValue = String(__capybaraValue); }
                }
                $callback
              }
              try {
                Promise.resolve((function () { return ($expression); })())
                  .then(function (value) { __capybaraSend(true, value); })
                  .catch(function (error) { __capybaraSend(false, String((error && error.message) || error)); });
              } catch (error) {
                __capybaraSend(false, String((error && error.message) || error));
              }
            })();
        """.trimIndent()
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url ?: "", 0)
        return try {
            future.get(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (error: Exception) {
            pending.remove(id)
            throw IllegalStateException(error.cause?.message ?: error.message ?: "页面指令执行超时", error)
        }
    }

    private fun installHandlers() {
        browser.jbCefClient.addDisplayHandler(object : CefDisplayHandler {
            override fun onAddressChange(cefBrowser: CefBrowser, frame: CefFrame, url: String) {
                if (!frame.isMain) return
                address = url
                loaded = true
                SwingUtilities.invokeLater {
                    addressField.text = url
                    updateStatus()
                }
            }

            override fun onTitleChange(cefBrowser: CefBrowser, title: String) = Unit
            override fun onTooltip(cefBrowser: CefBrowser, text: String): Boolean = false
            override fun onStatusMessage(cefBrowser: CefBrowser, value: String) = Unit
            override fun onConsoleMessage(
                cefBrowser: CefBrowser,
                level: org.cef.CefSettings.LogSeverity,
                message: String,
                source: String,
                line: Int,
            ): Boolean = false

            override fun onCursorChange(cefBrowser: CefBrowser, cursorType: Int): Boolean = false
        }, browser.cefBrowser)

        installRequestHandler()
    }

    /**
     * `CefRequestHandler.onRenderProcessTerminated` changed signature between the JCEF builds in
     * IDEA 2023.x and 2025.x. A dynamic proxy dispatches by method name, so the plugin compiles
     * and runs against every revision without a version-specific annotation.
     */
    private fun installRequestHandler() {
        val handler = Proxy.newProxyInstance(
            CefRequestHandler::class.java.classLoader,
            arrayOf(CefRequestHandler::class.java),
        ) { _, method, args ->
            when (method.name) {
                "onRenderProcessTerminated" -> {
                    val status = args?.getOrNull(1)?.toString() ?: "unknown"
                    logger.warn("Capybara browser renderer terminated: $status")
                    loaded = false
                    pending.values.forEach { it.completeExceptionally(IllegalStateException("渲染进程已退出")) }
                    pending.clear()
                    SwingUtilities.invokeLater {
                        statusLabel.text = "浏览器渲染进程已退出（$status），正在重新加载…"
                        browser.cefBrowser.reload()
                    }
                    null
                }
                "onBeforeBrowse", "onOpenURLFromTab", "onCertificateError", "onQuotaRequest",
                "getAuthCredentials" -> false
                "hashCode" -> System.identityHashCode(this)
                "equals" -> args?.getOrNull(0) === this
                "toString" -> "CapybaraCefRequestHandler"
                else -> defaultReturnValue(method.returnType)
            }
        } as CefRequestHandler
        runCatching { browser.jbCefClient.addRequestHandler(handler, browser.cefBrowser) }
            .onFailure { logger.info("Unable to register the CEF request handler: ${it.message}") }
    }

    private fun defaultReturnValue(type: Class<*>): Any? = when (type) {
        java.lang.Boolean.TYPE -> false
        Integer.TYPE -> 0
        java.lang.Long.TYPE -> 0L
        else -> null
    }

    private fun updateStatus() {
        val status = service.status()
        statusLabel.text = buildString {
            append("脚本桥接：").append(if (status.scriptBridgeReady) "已就绪" else "等待页面加载")
            append("  ·  截图（CDP ").append(status.debugPort).append("）：")
            append(if (status.cdpReady) "可用" else "不可用")
            append("  ·  控制入口 POST /browser/control")
        }
    }

    override fun loadUrl(url: String) {
        val target = normalize(url)
        address = target
        loaded = false
        val load = Runnable {
            addressField.text = target
            browser.loadURL(target)
        }
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) load.run() else application.invokeLater(load)
    }

    override fun openDevTools() {
        val open = Runnable { runCatching { browser.openDevtools() } }
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) open.run() else application.invokeLater(open)
    }

    private fun normalize(url: String): String {
        val value = url.trim()
        if (value.isEmpty()) return HOME_PAGE
        if (value == "about:blank") return value
        return if (value.startsWith("http://") || value.startsWith("https://")) value else "https://$value"
    }

    private fun jsString(value: String): String = JsonPrimitive(value).toString()

    override fun dispose() {
        service.detach(this)
        pending.values.forEach { it.completeExceptionally(IllegalStateException("浏览器已关闭")) }
        pending.clear()
        runCatching { bridge.dispose() }
        browser.dispose()
    }

    companion object {
        const val HOME_PAGE = "about:blank"

        fun isAvailable(): Boolean = runCatching { JBCefApp.isSupported() }.getOrDefault(false)
    }
}
