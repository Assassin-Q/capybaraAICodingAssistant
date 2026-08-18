package com.aicoding.plugin.ui

import com.aicoding.plugin.server.HttpServerManager
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ex.ToolWindowEx
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandler.ErrorCode
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefRequestHandler
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.lang.reflect.Proxy
import java.net.URI
import javax.swing.BorderFactory
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.SwingUtilities
import javax.swing.Timer

// 640 keeps the composer toolbar (approval mode + model + variant + usage) on one line.
private const val MIN_PANEL_WIDTH = 640

/** Long enough that a drag finishes before the splitter is pushed back, short enough to feel instant. */
private const val RESIZE_SETTLE_MS = 180
private const val MIN_PANEL_HEIGHT = 480

class AICodingPanel(
    private val project: Project,
    private val toolWindow: ToolWindow,
    private val sessionTabs: NativeSessionTabsController,
) : JPanel(BorderLayout()), Disposable {
    /**
     * Null when this IDE cannot give us JCEF, which the panel has to survive rather than crash on.
     *
     * 2026.2 moved JCEF out of the platform core into the bundled `com.intellij.modules.jcef`
     * plugin, so `com.intellij.ui.jcef.JBCefApp` is only on our classpath when that plugin is
     * present and enabled. Building the browser in a field initializer made an absent or disabled
     * JCEF a NoClassDefFoundError at construction — thrown before the isSupported() check below
     * could ever run, which is why the tool window failed to open at all instead of explaining
     * itself. The catch is on Throwable because a linkage failure is an Error, not an Exception.
     */
    private val browser: JBCefBrowser? = runCatching {
        if (JBCefApp.isSupported()) JBCefBrowser.createBuilder().setOffScreenRendering(false).build() else null
    }.getOrNull()
    private val httpServer = HttpServerManager(
        project = project,
        onPanelSessionTabsChange = sessionTabs::update,
    )
    private val cards = JPanel(CardLayout())
    private val statusLabel = JLabel("正在加载 Capybara AI...", SwingConstants.CENTER)
    private var frontendUrl = ""

    init {
        val minimumPanelSize = Dimension(MIN_PANEL_WIDTH, MIN_PANEL_HEIGHT)
        minimumSize = minimumPanelSize
        preferredSize = Dimension(640, 720)
        browser?.component?.minimumSize = minimumPanelSize
        browser?.component?.preferredSize = preferredSize
        cards.minimumSize = minimumPanelSize
        cards.preferredSize = preferredSize
        toolWindow.component.minimumSize = minimumPanelSize
        statusLabel.font = statusLabel.font.deriveFont(Font.PLAIN, 12f)
        statusLabel.foreground = Color.GRAY
        statusLabel.border = BorderFactory.createEmptyBorder(16, 16, 16, 16)
        browser?.let { cards.add(it.component, "browser") }
        cards.add(statusLabel, "status")
        add(cards, BorderLayout.CENTER)
        installLoadHandler()
        installExternalNavigationHandler()
        enforceMinimumWidth()
        startFrontend()
        Disposer.register(project, this)
    }

    private fun startFrontend() {
        val browser = browser ?: run {
            showStatus(
                "当前 IDEA 无法提供 JCEF 浏览器组件，前端界面无法显示。\n" +
                    "请在 设置 → 插件 → 已安装 中确认「Web Browser (JCEF)」已启用后重启 IDEA。",
            )
            return
        }

        try {
            project.basePath?.let(httpServer::setProjectPath)
            httpServer.start()
            // Cache-busted per IDE run: a JCEF profile that already cached the old index.html
            // would otherwise keep serving it even after the plugin is reinstalled.
            frontendUrl = "http://127.0.0.1:${httpServer.getPort()}/" +
                "?build=${System.currentTimeMillis()}&nativeTitleActions=1"
            println("Capybara JCEF loading $frontendUrl")
            browser.loadURL(frontendUrl)
        } catch (error: Exception) {
            showStatus("Capybara 前端服务启动失败: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    /**
     * Swing's `minimumSize` is only advisory for tool windows — the user can still drag the
     * splitter past it. `ToolWindowEx.stretchWidth` is the only API that actually moves the
     * splitter, so the width is pushed back whenever it drops below the minimum.
     */
    private fun enforceMinimumWidth() {
        val stretchable = toolWindow as? ToolWindowEx ?: return
        // Correcting on every resize event made the splitter oscillate: each stretchWidth fired
        // another resize, which stretched again, while the user was still dragging. So the
        // correction is deferred and coalesced — it runs once, after the drag has settled.
        val settle = Timer(RESIZE_SETTLE_MS) {
            val current = toolWindow.component.width
            if (current in 1 until MIN_PANEL_WIDTH && toolWindow.isVisible) {
                stretchable.stretchWidth(MIN_PANEL_WIDTH - current)
            }
        }.apply { isRepeats = false }

        toolWindow.component.addComponentListener(object : ComponentAdapter() {
            override fun componentResized(event: ComponentEvent) {
                val current = toolWindow.component.width
                if (current <= 0 || current >= MIN_PANEL_WIDTH || !toolWindow.isVisible) {
                    settle.stop()
                    return
                }
                settle.restart()
            }
        })
    }

    private fun installLoadHandler() {
        val browser = browser ?: return
        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadingStateChange(
                cefBrowser: CefBrowser,
                isLoading: Boolean,
                canGoBack: Boolean,
                canGoForward: Boolean,
            ) {
                if (isLoading) {
                    showStatus("正在加载 Capybara AI...")
                }
            }

            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                if (!frame.isMain) return
                if (httpStatusCode !in 200..299) {
                    showStatus("前端页面返回 HTTP $httpStatusCode\n$frontendUrl")
                } else {
                    SwingUtilities.invokeLater { cards.showCard("browser") }
                }
            }

            override fun onLoadError(
                cefBrowser: CefBrowser,
                frame: CefFrame,
                errorCode: ErrorCode,
                errorText: String,
                failedUrl: String,
            ) {
                if (frame.isMain) {
                    showStatus("前端页面加载失败: $errorText ($errorCode)\n$failedUrl")
                }
            }
        }, browser.cefBrowser)
    }

    /** Keep the assistant local, but let the user's system browser handle every external URL. */
    private fun installExternalNavigationHandler() {
        val browser = browser ?: return
        val handler = Proxy.newProxyInstance(
            CefRequestHandler::class.java.classLoader,
            arrayOf(CefRequestHandler::class.java),
        ) { _, method, args ->
            when (method.name) {
                "onBeforeBrowse", "onOpenURLFromTab" -> {
                    val url = navigationUrl(args)
                    if (url != null && shouldOpenExternally(url)) {
                        ApplicationManager.getApplication().invokeLater { BrowserUtil.browse(url) }
                        true
                    } else {
                        false
                    }
                }
                "hashCode" -> System.identityHashCode(this)
                "equals" -> args?.getOrNull(0) === this
                "toString" -> "CapybaraExternalNavigationHandler"
                else -> defaultNavigationReturn(method.returnType)
            }
        } as CefRequestHandler
        runCatching { browser.jbCefClient.addRequestHandler(handler, browser.cefBrowser) }
    }

    private fun navigationUrl(args: Array<out Any?>?): String? = args?.firstNotNullOfOrNull { arg ->
        when (arg) {
            is String -> arg.takeIf { it.isNotBlank() }
            null -> null
            else -> runCatching {
                arg.javaClass.getMethod("getURL").invoke(arg) as? String
            }.getOrNull()
        }
    }

    private fun shouldOpenExternally(url: String): Boolean {
        val scheme = runCatching { URI(url).scheme?.lowercase() }.getOrNull() ?: return false
        if (scheme !in setOf("http", "https", "mailto", "file")) return false
        if (url.startsWith("http://127.0.0.1:" + httpServer.getPort() + "/browser-download")) return true
        val uri = runCatching { URI(url) }.getOrNull() ?: return true
        val localHost = uri.host == "127.0.0.1" || uri.host == "localhost"
        return !(localHost && uri.port == httpServer.getPort())
    }

    private fun defaultNavigationReturn(type: Class<*>): Any? = when (type) {
        java.lang.Boolean.TYPE -> false
        Integer.TYPE -> 0
        java.lang.Long.TYPE -> 0L
        else -> null
    }

    private fun showStatus(message: String) {
        SwingUtilities.invokeLater {
            statusLabel.text = "<html><div style='text-align:center;'>${escapeHtml(message)}</div></html>"
            cards.showCard("status")
        }
    }

    private fun escapeHtml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>")

    private fun JPanel.showCard(name: String) {
        (layout as CardLayout).show(this, name)
    }

    override fun dispose() {
        browser?.dispose()
        httpServer.stop()
    }
}
