package com.aicoding.plugin.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.FrameWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import java.awt.Dimension
import javax.swing.SwingUtilities

/**
 * Hosts [CapybaraBrowserTabs] in a standalone window instead of a tool window, so opening the
 * browser never rearranges or interferes with the assistant panel. One window per project;
 * re-invoking the action brings the existing one to the front.
 */
object CapybaraBrowserWindow {
    private data class OpenWindow(val frame: FrameWrapper, val tabs: CapybaraBrowserTabs)

    private val openWindows = mutableMapOf<Project, OpenWindow>()

    @Synchronized
    fun open(project: Project, url: String? = null) {
        if (!CapybaraBrowserPanel.isAvailable()) {
            Messages.showWarningDialog(project, "当前 IDEA 运行时不支持 JCEF，无法打开内置浏览器。", "水豚浏览器")
            return
        }

        openWindows[project]?.let { existing ->
            existing.frame.getFrame().toFront()
            // A second request opens another tab rather than replacing what is on screen.
            url?.let { existing.tabs.newTab(it) }
            return
        }

        val tabs = CapybaraBrowserTabs(project)
        val frame = FrameWrapper(project, "capybara.browser", false, "水豚浏览器", tabs)
        frame.setSize(Dimension(1100, 780))
        frame.closeOnEsc()
        Disposer.register(frame, tabs)
        Disposer.register(frame, Disposable { synchronized(this) { openWindows.remove(project) } })
        openWindows[project] = OpenWindow(frame, tabs)
        frame.show()
        // The off-screen renderer only paints once the component has a real size, which it
        // gets after the frame is realised.
        SwingUtilities.invokeLater {
            tabs.revalidate()
            tabs.repaint()
            url?.let { tabs.activePanel?.loadUrl(it) }
        }
    }
}
