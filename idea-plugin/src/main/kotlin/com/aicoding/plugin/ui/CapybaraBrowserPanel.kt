package com.aicoding.plugin.ui

import com.aicoding.plugin.services.BrowserControlService
import com.aicoding.plugin.services.BrowserElementPick
import com.aicoding.plugin.services.BrowserElementRect
import com.aicoding.plugin.services.CapybaraBrowserHost
import com.intellij.icons.AllIcons
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefDisplayHandler
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefRequestHandler
import java.awt.BorderLayout
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO
import java.awt.Dimension
import java.lang.reflect.Proxy
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import javax.swing.Icon
import javax.swing.JPanel
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
        // Off-screen rendering, unlike the assistant tool window. Windowed rendering creates a
        // heavyweight native child window, which paints nothing inside a FrameWrapper — the page
        // loads (onAddressChange fires) but the area stays blank. OSR draws into a lightweight
        // Swing component and works in any container.
        .setOffScreenRendering(true)
        // Without this the browser is created lazily and the first loadURL can be dropped.
        .setCreateImmediately(true)
        .setUrl(HOME_PAGE)
        .build()

    private val bridge: JBCefJSQuery = JBCefJSQuery.create(browser as com.intellij.ui.jcef.JBCefBrowserBase)
    private val pending = ConcurrentHashMap<String, CompletableFuture<JsonElement>>()
    private val nextRequestId = AtomicLong(1)

    private val addressField = SearchTextField(false).apply { text = HOME_PAGE }
    private val loadingIcon = JBLabel(AnimatedIcon.Default()).apply {
        border = JBUI.Borders.empty(0, 6)
        isVisible = false
        toolTipText = "页面加载中"
    }
    private val statusLabel = JBLabel(" ").apply {
        foreground = UIUtil.getContextHelpForeground()
        font = JBUI.Fonts.smallFont()
        border = JBUI.Borders.empty(3, 8, 4, 8)
    }
    private val service = project.getService(BrowserControlService::class.java)
    private lateinit var actionToolbar: ActionToolbar

    @Volatile
    private var pickerEnabled = false

    @Volatile
    private var loading = false

    @Volatile
    private var currentPicks: List<BrowserElementPick> = emptyList()

    @Volatile
    private var address: String = HOME_PAGE

    @Volatile
    private var loaded = false

    /** Set by [CapybaraBrowserTabs] so the tab label can follow the page title. */
    var onTitleChanged: ((String) -> Unit)? = null

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
        updateStatus()
    }

    private fun buildToolbar(): JPanel {
        val actions = DefaultActionGroup()
        actions.add(browserAction(
            "后退",
            "返回上一页",
            AllIcons.Actions.Back,
            enabled = { browser.cefBrowser.canGoBack() },
        ) {
            browser.cefBrowser.goBack()
        })
        actions.add(browserAction(
            "前进",
            "前往下一页",
            AllIcons.Actions.Forward,
            enabled = { browser.cefBrowser.canGoForward() },
        ) {
            browser.cefBrowser.goForward()
        })
        actions.add(browserAction("刷新", "重新加载页面", AllIcons.Actions.Refresh, { !loading }) {
            browser.cefBrowser.reload()
        })
        actions.add(browserAction("停止", "停止加载页面", AllIcons.Actions.Suspend, { loading }) {
            browser.cefBrowser.stopLoad()
        })
        // AllIcons has no cursor-arrow glyph, so the picker ships its own (light + _dark variants).
        actions.add(object : ToggleAction("标注元素", "点击页面元素，锁定它并写一条给 AI 的说明", PICK_ICON) {
            override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

            override fun isSelected(event: AnActionEvent): Boolean = pickerEnabled

            override fun setSelected(event: AnActionEvent, state: Boolean) {
                setPickerEnabled(state)
            }
        })
        // Both used to hide behind the overflow menu with no icon, so nobody found them.
        actions.add(browserAction("清除全部标注", "删除当前页面的所有标注", AllIcons.Actions.GC) {
            val count = service.clearPicks()
            statusLabel.text = if (count > 0) "已清除 $count 个页面标注" else "当前页面没有标注"
        })
        actions.add(browserAction("打开 DevTools", "在独立窗口打开 Chromium DevTools", AllIcons.General.Settings) {
            openDevTools()
        })

        actionToolbar = ActionManager.getInstance().createActionToolbar(
            "CapybaraBrowser.Navigation",
            actions,
            true,
        ).apply {
            targetComponent = this@CapybaraBrowserPanel
            setMiniMode(true)
            setReservePlaceAutoPopupIcon(false)
            setSecondaryActionsIcon(AllIcons.Actions.More)
            setSecondaryActionsTooltip("更多浏览器操作")
        }

        addressField.apply {
            border = JBUI.Borders.empty(3, 6)
            toolTipText = "输入网址并按 Enter 打开"
            textEditor.addActionListener { loadUrl(text) }
        }
        val addressBar = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(3, 4, 3, 6)
            add(addressField, BorderLayout.CENTER)
            add(loadingIcon, BorderLayout.EAST)
        }
        return JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(1, 2)
            add(actionToolbar.component, BorderLayout.WEST)
            add(addressBar, BorderLayout.CENTER)
        }
    }

    private fun installBridge() {
        bridge.addHandler { payload ->
            runCatching {
                val message = json.parseToJsonElement(payload) as JsonObject
                if (message["type"]?.jsonPrimitive?.contentOrNull != null) {
                    handlePickerMessage(message)
                    return@runCatching
                }
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

    private fun handlePickerMessage(message: JsonObject) {
        when (message["type"]?.jsonPrimitive?.contentOrNull) {
            "pick" -> {
                val rect = message["rect"] as? JsonObject
                service.recordPick(
                    BrowserElementPick(
                        id = message.string("id"),
                        selector = message.string("selector"),
                        tagName = message.string("tagName"),
                        text = message.string("text"),
                        outerHtml = message.string("outerHtml"),
                        rect = BrowserElementRect(
                            left = rect.double("left"),
                            top = rect.double("top"),
                            right = rect.double("right"),
                            bottom = rect.double("bottom"),
                            width = rect.double("width"),
                            height = rect.double("height"),
                        ),
                        url = message.string("url").ifBlank { currentUrl },
                        frameUrl = message.string("frameUrl"),
                        comment = message["comment"]?.jsonPrimitive?.contentOrNull,
                        createdAt = message["createdAt"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
                            ?: System.currentTimeMillis(),
                    ),
                )
            }
            "comment" -> service.addComment(
                message["pickId"]?.jsonPrimitive?.contentOrNull,
                message["selector"]?.jsonPrimitive?.contentOrNull,
                message.string("comment"),
            )
            "removePick" -> {
                if (service.removePick(message["pickId"]?.jsonPrimitive?.contentOrNull)) {
                    statusLabel.text = "已删除该标注"
                }
            }
            "pickerStopped" -> {
                pickerEnabled = false
                refreshToolbar()
                updateStatus()
            }
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
                currentPicks = service.currentPicks()
                executeInAllFrames(
                    BrowserPickerScript.syncPicks(json.encodeToString(currentPicks), jsString(url)),
                )
                SwingUtilities.invokeLater {
                    addressField.setText(url)
                    refreshToolbar()
                    updateStatus()
                }
            }

            override fun onTitleChange(cefBrowser: CefBrowser, title: String) {
                SwingUtilities.invokeLater { onTitleChanged?.invoke(title) }
            }
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

        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadingStateChange(
                cefBrowser: CefBrowser,
                isLoading: Boolean,
                canGoBack: Boolean,
                canGoForward: Boolean,
            ) {
                loading = isLoading
                if (!isLoading) loaded = true
                SwingUtilities.invokeLater {
                    loadingIcon.isVisible = isLoading
                    refreshToolbar()
                    updateStatus()
                }
            }

            override fun onLoadStart(
                cefBrowser: CefBrowser,
                frame: CefFrame,
                transitionType: org.cef.network.CefRequest.TransitionType,
            ) {
                if (frame.isMain) {
                    loaded = false
                    loading = true
                    SwingUtilities.invokeLater {
                        loadingIcon.isVisible = true
                        refreshToolbar()
                    }
                }
            }

            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                if (frame.isMain) {
                    loaded = true
                    currentPicks = service.currentPicks()
                    installPickerInAllFrames()
                } else {
                    installPicker(frame)
                }
                SwingUtilities.invokeLater {
                    refreshToolbar()
                    updateStatus()
                }
            }

            override fun onLoadError(
                cefBrowser: CefBrowser,
                frame: CefFrame,
                errorCode: org.cef.handler.CefLoadHandler.ErrorCode,
                errorText: String,
                failedUrl: String,
            ) {
                if (!frame.isMain) return
                loaded = false
                loading = false
                SwingUtilities.invokeLater {
                    loadingIcon.isVisible = false
                    statusLabel.text = "页面加载失败：$errorText"
                    refreshToolbar()
                }
            }
        }, browser.cefBrowser)

        installRequestHandler()
    }

    private fun browserAction(
        text: String,
        description: String,
        icon: Icon?,
        visible: () -> Boolean = { true },
        enabled: () -> Boolean = { true },
        perform: () -> Unit,
    ): AnAction = object : AnAction(text, description, icon) {
        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

        override fun update(event: AnActionEvent) {
            event.presentation.isVisible = visible()
            event.presentation.isEnabled = enabled()
        }

        override fun actionPerformed(event: AnActionEvent) = perform()
    }

    private fun refreshToolbar() {
        if (::actionToolbar.isInitialized) actionToolbar.updateActionsImmediately()
    }

    override fun setPickerEnabled(enabled: Boolean) {
        pickerEnabled = enabled
        executeInAllFrames(BrowserPickerScript.setEnabled(enabled))
        SwingUtilities.invokeLater {
            refreshToolbar()
            updateStatus()
        }
    }

    /**
     * Paints the JCEF component into an image. Works because the browser runs off-screen: the
     * component holds the rasterised page, so no debug port and no CDP round trip is involved.
     * Captures the viewport, not the whole scrollable document.
     */
    override fun capturePng(): String? = runCatching {
        val target = browser.component
        val width = target.width
        val height = target.height
        if (width <= 0 || height <= 0) return null
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val paint = Runnable {
            val graphics = image.createGraphics()
            try {
                target.paint(graphics)
            } finally {
                graphics.dispose()
            }
        }
        if (SwingUtilities.isEventDispatchThread()) paint.run()
        else SwingUtilities.invokeAndWait(paint)
        val bytes = ByteArrayOutputStream().use { stream ->
            ImageIO.write(image, "png", stream)
            stream.toByteArray()
        }
        Base64.getEncoder().encodeToString(bytes)
    }.getOrElse {
        logger.info("Unable to capture the browser component: ${it.message}")
        null
    }

    override fun syncPicks(picks: List<BrowserElementPick>) {
        currentPicks = picks
        executeInAllFrames(
            BrowserPickerScript.syncPicks(json.encodeToString(picks), jsString(currentUrl)),
        )
        SwingUtilities.invokeLater { updateStatus() }
    }

    private fun installPickerInAllFrames() {
        val frames = linkedSetOf<CefFrame>()
        runCatching { frames.add(browser.cefBrowser.mainFrame) }
        runCatching {
            browser.cefBrowser.frameNames.forEach { name ->
                browser.cefBrowser.getFrame(name)?.let(frames::add)
            }
        }.onFailure { logger.info("Unable to enumerate browser frames: ${it.message}") }
        frames.forEach(::installPicker)
    }

    private fun installPicker(frame: CefFrame) {
        val callback = bridge.inject("JSON.stringify(__capybaraPickerMessage)")
        val script = BrowserPickerScript.install(
            callback = callback,
            enabled = pickerEnabled,
            picksJson = json.encodeToString(currentPicks),
            pageUrlJson = jsString(currentUrl),
        )
        runCatching { frame.executeJavaScript(script, frame.url ?: currentUrl, 0) }
            .onFailure { logger.info("Unable to install picker in frame: ${it.message}") }
    }

    private fun executeInAllFrames(script: String) {
        if (!loaded) return
        val frames = linkedSetOf<CefFrame>()
        runCatching { frames.add(browser.cefBrowser.mainFrame) }
        runCatching {
            browser.cefBrowser.frameNames.forEach { name ->
                browser.cefBrowser.getFrame(name)?.let(frames::add)
            }
        }
        frames.forEach { frame ->
            runCatching { frame.executeJavaScript(script, frame.url ?: currentUrl, 0) }
                .onFailure { logger.info("Unable to update picker frame: ${it.message}") }
        }
    }

    private fun JsonObject.string(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull.orEmpty()

    private fun JsonObject?.double(key: String): Double =
        this?.get(key)?.jsonPrimitive?.doubleOrNull ?: 0.0

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
        val size = browser.component.size
        statusLabel.text = buildString {
            append("脚本桥接：").append(if (status.scriptBridgeReady) "已就绪" else "等待页面加载")
            append("  ·  画布 ").append(size.width).append("×").append(size.height)
            if (pickerEnabled) append("  ·  正在拾取元素（Esc 退出）")
            if (currentPicks.isNotEmpty()) append("  ·  标注 ").append(currentPicks.size)
        }
    }

    override fun loadUrl(url: String) {
        val target = normalize(url)
        address = target
        loaded = false
        val load = Runnable {
            addressField.setText(target)
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
        executeInAllFrames(BrowserPickerScript.destroy())
        service.detach(this)
        pending.values.forEach { it.completeExceptionally(IllegalStateException("浏览器已关闭")) }
        pending.clear()
        runCatching { bridge.dispose() }
        browser.dispose()
    }

    companion object {
        const val HOME_PAGE = "about:blank"

        /** Cursor-arrow glyph for the picker; AllIcons has no equivalent. */
        private val PICK_ICON = IconLoader.getIcon("/icons/pickElement.svg", CapybaraBrowserPanel::class.java)

        fun isAvailable(): Boolean = runCatching { JBCefApp.isSupported() }.getOrDefault(false)
    }
}
