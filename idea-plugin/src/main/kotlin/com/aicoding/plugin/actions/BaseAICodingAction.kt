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
        val selectedFiles = getSelectedFiles(e).take(MAX_FILES)
        val editor = getEditor(e)
        val selectedText = editor?.selectionModel?.selectedText?.takeIf { it.isNotBlank() }
        val messageService = project.getService(MessageService::class.java)
        // Project view multi-selection can coexist with a stale editor selection.
        // In that case the explicitly selected files are the user's intended context.
        if (selectedText != null && selectedFiles.size <= 1) {
            val file = getCurrentFile(e)
            messageService.addMessage(
                type = type,
                content = selectedText,
                kind = "selection",
                fileName = file?.path,
                lineRange = getLineRange(e),
            )
            return
        }

        selectedFiles.forEach { file ->
                val content = buildFileContext(file)
                if (content.isNotBlank()) {
                    messageService.addMessage(
                        type = type,
                        content = content,
                        kind = when {
                            file.isDirectory -> "directory"
                            file.fileType.isBinary -> "binary"
                            else -> "file"
                        },
                        fileName = file.path,
                    )
                }
            }
    }

    private fun buildFileContext(file: VirtualFile): String = when {
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
            text
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
