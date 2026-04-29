package com.aicoding.plugin.actions

import com.aicoding.plugin.ui.EditorManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

class ShowAIPopupAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = getProject(e) ?: return
        project.service<EditorManager>().showPopupForCurrentEditor()
    }
    
    override fun update(e: AnActionEvent) {
        val project = getProject(e)
        val hasProject = project != null
        e.presentation.isEnabled = hasProject
        e.presentation.isVisible = true
    }
}