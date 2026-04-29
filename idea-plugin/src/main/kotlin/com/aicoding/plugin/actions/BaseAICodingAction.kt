package com.aicoding.plugin.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager

abstract class BaseAICodingAction : AnAction() {
    protected fun getSelectedText(e: AnActionEvent): String? {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val selectionModel = editor?.selectionModel
        return selectionModel?.selectedText?.takeIf { it.isNotBlank() }
    }
    
    protected fun getCurrentFile(e: AnActionEvent): VirtualFile? {
        return e.getData(CommonDataKeys.VIRTUAL_FILE)
    }
    
    protected fun getSelectedFiles(e: AnActionEvent): List<VirtualFile> {
        val files = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)
        return files?.toList() ?: getCurrentFile(e)?.let { listOf(it) } ?: emptyList()
    }
    
    protected fun getCurrentPsiFile(e: AnActionEvent): PsiFile? {
        val project = e.project ?: return null
        val file = getCurrentFile(e) ?: return null
        return PsiManager.getInstance(project).findFile(file)
    }
    
    protected fun getEditor(e: AnActionEvent): Editor? {
        return e.getData(CommonDataKeys.EDITOR)
    }
    
    protected fun getProject(e: AnActionEvent): Project? {
        return e.project
    }
    
    protected fun getLineRange(e: AnActionEvent): Pair<Int, Int>? {
        val editor = getEditor(e) ?: return null
        val selectionModel = editor.selectionModel
        val startLine = selectionModel.selectionStartPosition?.line ?: return null
        val endLine = selectionModel.selectionEndPosition?.line ?: return null
        return Pair(startLine + 1, endLine + 1) // Convert to 1-based line numbers
    }
    
    protected fun getFileName(e: AnActionEvent): String? {
        val file = getCurrentFile(e) ?: return null
        return file.name
    }
    
    protected fun getFilePath(e: AnActionEvent): String? {
        val file = getCurrentFile(e) ?: return null
        return file.path
    }
}