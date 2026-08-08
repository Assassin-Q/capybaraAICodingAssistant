package com.aicoding.plugin.ui

import com.aicoding.plugin.services.BrowserControlService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.FrameWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import java.awt.Dimension

/**
 * Hosts [CapybaraBrowserPanel] in a standalone window instead of a tool window, so opening the
 * browser never rearranges or interferes with the assistant panel. One window per project;
 * re-invoking the action brings the existing one to the front.
 */
object CapybaraBrowserWindow {
    private data class OpenWindow(val frame: FrameWrapper, val panel: CapybaraBrowserPanel)

    private val openWindows = mutableMapOf<Project, OpenWindow>()

    @Synchronized
    fun open(project: Project, url: String? = null) {
        if (!CapybaraBrowserPanel.isAvailable()) {
            Messages.showWarningDialog(project, "当前 IDEA 运行时不支持 JCEF，无法打开内置浏览器。", "水豚浏览器")
            return
        }

        openWindows[project]?.let { existing ->
            existing.frame.getFrame().toFront()
            url?.let(existing.panel::loadUrl)
            return
        }

        // Only attempted here, never from the assistant panel; a no-op if JCEF already started.
        BrowserControlService.tryEnableDebugPort()

        val panel = CapybaraBrowserPanel(project)
        val frame = FrameWrapper(project, "capybara.browser", false, "水豚浏览器", panel)
        frame.setSize(Dimension(1100, 780))
        frame.closeOnEsc()
        Disposer.register(frame, panel)
        Disposer.register(frame, Disposable { synchronized(this) { openWindows.remove(project) } })
        openWindows[project] = OpenWindow(frame, panel)
        frame.show()
        url?.let(panel::loadUrl)
    }
}
