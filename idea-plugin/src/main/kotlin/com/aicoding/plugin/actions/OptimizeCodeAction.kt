package com.aicoding.plugin.actions

import com.aicoding.plugin.services.MessageService
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project

class OptimizeCodeAction : BaseAICodingAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = getProject(e) ?: return
        val selectedText = getSelectedText(e)
        val editor = getEditor(e)
        val lineRange = getLineRange(e)
        
        val messageService = project.getService(MessageService::class.java)
        
        if (editor != null) {
            val filePath = getFilePath(e)
            val content = if (selectedText != null) {
                buildString {
                    if (filePath != null) {
                        append("$filePath")
                        if (lineRange != null) {
                            append(" ${lineRange.first}~${lineRange.second}行")
                        }
                        append(":\n")
                    }
                    append(selectedText)
                }
            } else {
                filePath ?: "unknown file"
            }
            messageService.addMessage("optimize_code", content, filePath, lineRange)
        } else {
            val files = getSelectedFiles(e)
            val content = files.joinToString("\n") { it.path }
            val filePath = files.firstOrNull()?.path
            messageService.addMessage("optimize_code", content, filePath, null)
        }
    }
    
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
        e.presentation.isVisible = true
    }
}