package com.aicoding.plugin.ui

import com.aicoding.plugin.server.HttpServerManager
import com.aicoding.plugin.services.IdeThemeService
import com.aicoding.plugin.services.PluginUpdateService
import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import java.awt.Component
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import com.intellij.openapi.actionSystem.ex.DefaultCustomComponentAction
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.Icon

private const val IDEA_PLUGIN_CENTER_URL =
    "jetbrains://plugins.jetbrains.com/pluginManager?action=install&pluginId=com.aicoding.ai-coding-plugin"

/**
 * The panel's controls, as native tool-window title actions.
 *
 * They do not act directly: each one broadcasts `capybara.action` over the existing SSE channel and
 * the panel performs it. Duplicating the behaviour in Kotlin would mean two implementations of
 * "new session" drifting apart, and the panel is where the session state already lives.
 */
private class PanelAction(
    private val project: Project,
    private val actionID: String,
    title: String,
    icon: Icon,
) : AnAction(title, title, icon) {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = HttpServerManager.forProject(project)?.isRunning() == true
    }

    override fun actionPerformed(event: AnActionEvent) {
        HttpServerManager.forProject(project)?.broadcastPanelAction(actionID)
    }
}

/** Shows the theme the action will switch to, instead of a fixed generic eye icon. */
private class ThemeAction(private val project: Project) : AnAction("切换明暗") {
    private val switchToLight = IconLoader.getIcon("/expui/meetNewUi/lightTheme.svg", AllIcons::class.java)
    private val switchToDark = IconLoader.getIcon("/expui/meetNewUi/darkTheme.svg", AllIcons::class.java)

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        val dark = IdeThemeService.currentTheme() == "dark"
        event.presentation.icon = if (dark) switchToLight else switchToDark
        event.presentation.text = if (dark) "切换为浅色" else "切换为深色"
        event.presentation.isEnabled = HttpServerManager.forProject(project)?.isRunning() == true
    }

    override fun actionPerformed(event: AnActionEvent) {
        HttpServerManager.forProject(project)?.broadcastPanelAction("theme")
    }
}

/**
 * A filled circle in the given colour.
 *
 * Drawn rather than loaded: the platform's own `ColorIcon` is not present in the 2023.2 SDK this
 * plugin compiles against, and shipping three SVGs for what is one `fillOval` would be worse. The
 * size follows the IDE's scale factor so it stays a dot on a HiDPI display instead of a speck.
 */
private class DotIcon(private val color: JBColor) : Icon {
    private val size = JBUIScale.scale(9)

    override fun paintIcon(component: Component?, graphics: Graphics, x: Int, y: Int) {
        val g = graphics.create() as Graphics2D
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g.color = color
            val inset = JBUIScale.scale(1)
            g.fillOval(x + inset, y + inset, size - inset * 2, size - inset * 2)
        } finally {
            g.dispose()
        }
    }

    override fun getIconWidth(): Int = size
    override fun getIconHeight(): Int = size
}

/**
 * The connection indicator; its icon reflects the cached service/update state.
 *
 * `update` is called on every toolbar refresh, so it may only read a cached value — the check
 * itself is delayed and scheduled by the panel, then cached by [PluginUpdateService]. `JBColor` gives each state a light
 * and a dark variant, so the dot follows the IDE theme without a second set of icons.
 */
private class StatusAction(private val project: Project) : AnAction() {
    private val connected = DotIcon(JBColor(0x59A869, 0x499C54))
    private val updateAvailable = DotIcon(JBColor(0xE8A33D, 0xD9822B))
    private val offline = DotIcon(JBColor(0x9AA0A6, 0x6E7275))

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        val running = HttpServerManager.forProject(project)?.isRunning() == true
        val status = PluginUpdateService.instance.cachedStatus()
        event.presentation.icon = when {
            !running -> offline
            status.hasUpdate -> updateAvailable
            else -> connected
        }
        event.presentation.text = when {
            !running -> "未连接"
            status.hasUpdate -> "有新版本 ${status.latestVersion}，点击打开 IDEA 插件中心"
            else -> "已连接 · 版本 ${status.currentVersion}"
        }
    }

    override fun actionPerformed(event: AnActionEvent) {
        val status = PluginUpdateService.instance.cachedStatus()
        if (status.hasUpdate && status.downloadUrl.isNotBlank()) {
            BrowserUtil.browse(IDEA_PLUGIN_CENTER_URL)
        }
    }
}

/**
 * Built in the order they should appear. IntelliJ drops whatever does not fit into the overflow
 * menu, so the ones used most often come first.
 */
fun capybaraTitleActions(project: Project): List<AnAction> = listOf(
    StatusAction(project),
    PanelAction(project, "new-session", "新建会话", AllIcons.General.Add),
    PanelAction(project, "history", "会话历史", AllIcons.Vcs.History),
    PanelAction(project, "settings", "设置", AllIcons.General.GearPlain),
    PanelAction(project, "git", "Git 改动", AllIcons.Vcs.Branch),
    ThemeAction(project),
    PanelAction(project, "refresh", "刷新", AllIcons.Actions.Refresh),
)
