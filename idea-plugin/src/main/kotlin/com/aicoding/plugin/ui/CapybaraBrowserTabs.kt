package com.aicoding.plugin.ui

import com.aicoding.plugin.services.BrowserControlService
import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * Tab container for the built-in browser.
 *
 * Each tab is a full [CapybaraBrowserPanel] — its own `JBCefBrowser`, its own JS bridge and its
 * own picker state. Only the visible tab is attached to [BrowserControlService], so
 * `POST /browser/control` and the `idea_browser` tool always act on what the user is looking at
 * and no `tabId` has to be threaded through the protocol.
 */
class CapybaraBrowserTabs(private val project: Project) : JPanel(BorderLayout()), Disposable {
    private val service = project.getService(BrowserControlService::class.java)
    private val tabs = JBTabbedPane()

    init {
        preferredSize = Dimension(1100, 780)
        minimumSize = Dimension(480, 360)
        add(tabs, BorderLayout.CENTER)
        add(JPanel(BorderLayout()).apply {
            isOpaque = false
            add(buildNewTabButton(), BorderLayout.NORTH)
        }, BorderLayout.EAST)
        tabs.addChangeListener { attachActiveTab() }
        newTab()
    }

    /** The tab currently in front, or null before the first one exists. */
    val activePanel: CapybaraBrowserPanel?
        get() = tabs.selectedComponent as? CapybaraBrowserPanel

    fun newTab(url: String? = null): CapybaraBrowserPanel {
        val panel = CapybaraBrowserPanel(project)
        Disposer.register(this, panel)
        panel.onTitleChanged = { title -> updateTitle(panel, title) }
        tabs.addTab(DEFAULT_TITLE, panel)
        tabs.setTabComponentAt(tabs.indexOfComponent(panel), tabLabel(panel, DEFAULT_TITLE))
        tabs.selectedComponent = panel
        attachActiveTab()
        // Off-screen rendering only paints once the component has a real size.
        SwingUtilities.invokeLater {
            panel.revalidate()
            panel.repaint()
            url?.let(panel::loadUrl)
        }
        return panel
    }

    /** Tab strip cell: title plus its own close button, the way every browser does it. */
    private fun tabLabel(panel: CapybaraBrowserPanel, title: String): JPanel {
        val label = JBLabel(title)
        val close = JLabel(AllIcons.Actions.Close).apply {
            border = JBUI.Borders.emptyLeft(6)
            toolTipText = "关闭标签页"
            addMouseListener(object : MouseAdapter() {
                override fun mouseClicked(event: MouseEvent) = closeTab(panel)
            })
        }
        return JPanel(BorderLayout(4, 0)).apply {
            isOpaque = false
            add(label, BorderLayout.CENTER)
            add(close, BorderLayout.EAST)
            putClientProperty(TITLE_LABEL, label)
        }
    }

    private fun closeActiveTab() {
        val panel = activePanel ?: return
        // Never leave the window empty: the last tab resets instead of disappearing.
        if (tabs.tabCount <= 1) {
            panel.loadUrl(CapybaraBrowserPanel.HOME_PAGE)
            return
        }
        tabs.remove(panel)
        Disposer.dispose(panel)
        attachActiveTab()
    }

    private fun attachActiveTab() {
        activePanel?.let(service::attach)
    }

    private fun closeTab(panel: CapybaraBrowserPanel) {
        if (tabs.tabCount <= 1) {
            panel.loadUrl(CapybaraBrowserPanel.HOME_PAGE)
            return
        }
        tabs.remove(panel)
        Disposer.dispose(panel)
        attachActiveTab()
    }

    private fun updateTitle(panel: CapybaraBrowserPanel, title: String) {
        val index = tabs.indexOfComponent(panel)
        if (index < 0) return
        val trimmed = title.trim().ifBlank { DEFAULT_TITLE }
        val shortened = if (trimmed.length > 18) trimmed.take(18) + "…" else trimmed
        tabs.setToolTipTextAt(index, trimmed)
        val cell = tabs.getTabComponentAt(index) as? JPanel ?: return
        (cell.getClientProperty(TITLE_LABEL) as? JBLabel)?.text = shortened
    }

    private fun buildNewTabButton(): JPanel {
        val actions = DefaultActionGroup()
        actions.add(action("新建标签页", "打开一个新的标签页", AllIcons.General.Add) { newTab() })
        val toolbar = ActionManager.getInstance()
            .createActionToolbar("CapybaraBrowser.Tabs", actions, true)
            .apply {
                targetComponent = this@CapybaraBrowserTabs
                setMiniMode(true)
                setReservePlaceAutoPopupIcon(false)
            }
        return JPanel(BorderLayout()).apply {
            isOpaque = false
            border = JBUI.Borders.emptyLeft(4)
            add(toolbar.component, BorderLayout.CENTER)
        }
    }

    private fun action(text: String, description: String, icon: javax.swing.Icon, perform: () -> Unit) =
        object : AnAction(text, description, icon) {
            override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
            override fun actionPerformed(event: AnActionEvent) = perform()
        }

    override fun dispose() {
        // The window is closing, so the annotations for every tab go with it.
        service.forgetAllPicks()
    }

    private companion object {
        const val DEFAULT_TITLE = "新标签页"
        const val TITLE_LABEL = "capybara.tab.title"
    }
}
