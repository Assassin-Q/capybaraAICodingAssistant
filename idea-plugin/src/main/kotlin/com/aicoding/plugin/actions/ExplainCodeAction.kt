package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnActionEvent

class ExplainCodeAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) = enqueueContext(e, "explain_code")

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}
