package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnActionEvent

class OptimizeCodeAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) = enqueueContext(e, "optimize_code")

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}
