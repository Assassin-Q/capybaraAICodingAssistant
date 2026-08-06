package com.aicoding.plugin.actions

import com.aicoding.plugin.services.MessageService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.vfs.VirtualFile
import java.nio.charset.StandardCharsets

abstract class BaseAICodingAction : AnAction() {
    companion object {
        private const val MAX_FILES = 8
        private const val MAX_FILE_BYTES = 512 * 1024L
    }

    protected fun enqueueContext(e: AnActionEvent, type: String) {
        val project = e.project ?: return
        publishContext(e, project, type)
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("水豚 AI 助手")
        if (toolWindow != null && !toolWindow.isVisible) {
            toolWindow.show()
        }
    }

    private fun publishContext(e: AnActionEvent, project: Project, type: String) {
        val editor = getEditor(e)
        val selectedText = editor?.selectionModel?.selectedText?.takeIf { it.isNotBlank() }
        val files = getSelectedFiles(e)
        val file = getCurrentFile(e) ?: files.firstOrNull()
        val content = selectedText ?: buildFileContext(files.ifEmpty { listOfNotNull(file) })
        if (content.isBlank()) {
            return
        }
        project.getService(MessageService::class.java).addMessage(
            type = type,
            content = content,
            fileName = file?.path,
            lineRange = getLineRange(e),
        )
    }

    private fun buildFileContext(files: List<VirtualFile>): String = files
        .take(MAX_FILES)
        .joinToString("\n\n") { file ->
            when {
                file.isDirectory -> "目录：${file.path}"
                file.fileType.isBinary -> "二进制文件：${file.path}"
                file.length > MAX_FILE_BYTES -> "文件：${file.path}\n[文件大于 512 KB，未读取内容]"
                else -> {
                    val text = runCatching {
                        ApplicationManager.getApplication().runReadAction<String> {
                            val bytes = file.contentsToByteArray()
                            val charset = runCatching { file.charset }.getOrDefault(StandardCharsets.UTF_8)
                            String(bytes, charset)
                        }
                    }.getOrElse { "[无法读取文件：${it.message.orEmpty()}]" }
                    "文件：${file.path}\n\n$text"
                }
            }
        }

    protected fun getCurrentFile(e: AnActionEvent): VirtualFile? =
        e.getData(CommonDataKeys.VIRTUAL_FILE)

    protected fun getSelectedFiles(e: AnActionEvent): List<VirtualFile> =
        e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)?.toList()
            ?: getCurrentFile(e)?.let { listOf(it) }
            ?: emptyList()

    protected fun getEditor(e: AnActionEvent): Editor? =
        e.getData(CommonDataKeys.EDITOR)

    protected fun getLineRange(e: AnActionEvent): Pair<Int, Int>? {
        val selection = getEditor(e)?.selectionModel ?: return null
        if (!selection.hasSelection()) {
            return null
        }
        val start = selection.selectionStartPosition ?: return null
        val end = selection.selectionEndPosition ?: return null
        return Pair(
            start.line + 1,
            end.line + 1,
        )
    }

    protected fun getProject(e: AnActionEvent): Project? = e.project
}
