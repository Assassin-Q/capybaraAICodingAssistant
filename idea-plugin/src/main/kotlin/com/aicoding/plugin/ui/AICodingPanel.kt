package com.aicoding.plugin.ui

import com.aicoding.plugin.server.HttpServerManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandler.ErrorCode
import org.cef.handler.CefLoadHandlerAdapter
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import javax.swing.BorderFactory
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.SwingUtilities

class AICodingPanel(
    private val project: Project,
    @Suppress("UNUSED_PARAMETER") private val toolWindow: ToolWindow,
) : JPanel(BorderLayout()), Disposable {
    private val browser = JBCefBrowser.createBuilder()
        .setOffScreenRendering(false)
        .build()
    private val httpServer = HttpServerManager(project)
    private val cards = JPanel(CardLayout())
    private val statusLabel = JLabel("正在加载 Capybara AI...", SwingConstants.CENTER)
    private var frontendUrl = ""

    init {
        val minimumPanelSize = Dimension(560, 480)
        minimumSize = minimumPanelSize
        preferredSize = Dimension(640, 720)
        browser.component.minimumSize = minimumPanelSize
        browser.component.preferredSize = preferredSize
        cards.minimumSize = minimumPanelSize
        cards.preferredSize = preferredSize
        toolWindow.component.minimumSize = minimumPanelSize
        statusLabel.font = statusLabel.font.deriveFont(Font.PLAIN, 12f)
        statusLabel.foreground = Color.GRAY
        statusLabel.border = BorderFactory.createEmptyBorder(16, 16, 16, 16)
        cards.add(browser.component, "browser")
        cards.add(statusLabel, "status")
        add(cards, BorderLayout.CENTER)
        installLoadHandler()
        startFrontend()
        Disposer.register(project, this)
    }

    private fun startFrontend() {
        if (!JBCefApp.isSupported()) {
            showStatus("当前 IDEA 运行时不支持 JCEF，无法显示前端界面。")
            return
        }

        try {
            project.basePath?.let(httpServer::setProjectPath)
            httpServer.start()
            frontendUrl = "http://127.0.0.1:${httpServer.getPort()}/"
            println("Capybara JCEF loading $frontendUrl")
            browser.loadURL(frontendUrl)
        } catch (error: Exception) {
            showStatus("Capybara 前端服务启动失败: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    private fun installLoadHandler() {
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
        browser.dispose()
        httpServer.stop()
    }
}
