package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.util.io.FileUtil
import java.awt.datatransfer.StringSelection

abstract class CopyPathAction : BaseAICodingAction() {
    protected abstract fun pathFor(e: AnActionEvent, absolutePath: String): String

    override fun actionPerformed(e: AnActionEvent) {
        val files = getSelectedFiles(e)
        if (files.isEmpty()) return
        val selectedFile = files.singleOrNull()
        val editorFile = getEditor(e)?.document?.let { FileDocumentManager.getInstance().getFile(it) }
        val lineRange = if (selectedFile == editorFile) getLineRange(e) else null
        val suffix = lineRange?.let { range ->
            if (range.first == range.second) ":${range.first}" else ":${range.first}-${range.second}"
        }.orEmpty()
        val paths = files.map { file ->
            pathFor(e, file.path) + if (file == selectedFile) suffix else ""
        }
        CopyPasteManager.getInstance().setContents(StringSelection(paths.joinToString(System.lineSeparator())))
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null && getSelectedFiles(e).isNotEmpty()
    }
}

class CopyAbsolutePathAction : CopyPathAction() {
    override fun pathFor(e: AnActionEvent, absolutePath: String): String = absolutePath
}

class CopyRelativePathAction : CopyPathAction() {
    override fun pathFor(e: AnActionEvent, absolutePath: String): String {
        val projectRoot = getProject(e)?.basePath
        return projectRoot?.let { FileUtil.getRelativePath(it, absolutePath, '/') } ?: absolutePath
    }
}
