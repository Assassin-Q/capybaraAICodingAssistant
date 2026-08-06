package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

class TogglePanelAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("水豚 AI 助手")
        toolWindow?.let {
            if (it.isVisible) {
                it.hide(null)
            } else {
                it.show(null)
            }
        }
    }
}
