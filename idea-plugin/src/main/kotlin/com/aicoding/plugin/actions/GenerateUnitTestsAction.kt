package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnActionEvent

class GenerateUnitTestsAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) = enqueueContext(e, "generate_test")

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}
