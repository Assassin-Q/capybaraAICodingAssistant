package com.aicoding.plugin

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import com.intellij.ui.content.ContentFactory
import com.aicoding.plugin.ui.AICodingPanel
import com.aicoding.plugin.ui.capybaraTitleActions
import com.aicoding.plugin.ui.NativeSessionTabsController

@Service(Service.Level.PROJECT)
class AICodingToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val sessionTabs = NativeSessionTabsController(project, toolWindow)
        val panel = AICodingPanel(project, toolWindow, sessionTabs)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)

        // The panel's own header row is hidden, so these are the only controls; they live in the
        // native title bar and drive the panel over the existing event channel.
        (toolWindow as? ToolWindowEx)?.apply {
            /*
             * The header's own name label, which is what `ContentLayout.updateIdLabel` paints
             * from `stripeTitle`. The tool window id stays as it is — actions look the window up
             * by that string — so only the displayed name is set here.
             */
            stripeTitle = "Capybara AI Coding"
            /*
             * IDEA renders tab actions in the west (left) side of the native header, while title
             * actions belong to the east-side toolbar. Keep the session strip separate so it starts
             * at the left edge instead of being grouped with the status and command buttons.
             *
             * Both arrows sit after the strip. Their holders keep a fixed width so showing and
             * hiding one costs no layout, which meant a left-hand arrow left a blank gap between
             * the window name and the first tab whenever there was nothing to scroll back to.
             */
            setTabActions(
                sessionTabs.stripAction(),
                sessionTabs.previousAction(),
                sessionTabs.nextAction(),
            )
            setTitleActions(capybaraTitleActions(project))
        }
    }
}
