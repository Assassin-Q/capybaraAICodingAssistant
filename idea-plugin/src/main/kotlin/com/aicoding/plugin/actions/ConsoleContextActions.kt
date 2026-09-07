package com.aicoding.plugin.actions

import com.aicoding.plugin.services.MessageService
import com.aicoding.plugin.services.IdeaConsoleText
import com.intellij.execution.ui.RunContentManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.wm.ToolWindowManager

private const val MAX_CONSOLE_CHARS = 1_000_000

abstract class BaseConsoleContextAction(private val messageType: String) : AnAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = event.getData(CommonDataKeys.EDITOR)
        val descriptor = RunContentManager.getInstanceIfCreated(project)?.selectedContent
        val selectedText = editor?.selectionModel?.selectedText?.takeIf(String::isNotBlank)
        val consoleText = selectedText
            ?: editor?.document?.text?.takeIf(String::isNotBlank)
            ?: IdeaConsoleText.read(descriptor?.executionConsole)?.takeIf(String::isNotBlank)
            ?: return
        val consoleName = descriptor?.displayName?.takeIf(String::isNotBlank) ?: "IDEA Console"
        val source = descriptor?.contentToolWindowId?.takeIf(String::isNotBlank) ?: "Run"
        val selectionSuffix = if (selectedText != null) " · selected output" else ""
        project.getService(MessageService::class.java).addMessage(
            type = messageType,
            content = consoleText.takeLast(MAX_CONSOLE_CHARS),
            kind = "log",
            displayName = "$source · $consoleName$selectionSuffix.log",
        )
        ToolWindowManager.getInstance(project).getToolWindow("水豚 AI 助手")?.show()
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible = event.project != null
    }
}

class AddConsoleToConversationAction : BaseConsoleContextAction("add_to_chat")

class AnalyzeConsoleLogAction : BaseConsoleContextAction("analyze_log")

class AnalyzeConsoleProblemAction : BaseConsoleContextAction("analyze_issue")
