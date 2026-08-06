package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnActionEvent

class AddToConversationAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) = enqueueContext(e, "add_to_chat")

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}
