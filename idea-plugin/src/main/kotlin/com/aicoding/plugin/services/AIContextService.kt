package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope
import kotlinx.serialization.Serializable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

@Serializable
data class CodeContext(
    val selectedText: String,
    val beforeContext: String, // 选中文本前的代码
    val afterContext: String,  // 选中文本后的代码
    val fileType: String,
    val fileName: String,
    val imports: List<String> = emptyList(),
    val classStructure: String? = null,
    val projectLanguage: String = "unknown"
)

@Service(Service.Level.PROJECT)
class AIContextService {
    private val contextCache = ConcurrentHashMap<String, CodeContext>()
    private val patternUsageCount = ConcurrentHashMap<String, AtomicInteger>()
    
    fun extractContext(project: Project, editor: Editor, selectedText: String): CodeContext {
        val document = editor.document
        val selectionModel = editor.selectionModel
        
        val cacheKey = "${project.name}:${document.hashCode()}:${selectionModel.selectionStart}:${selectionModel.selectionEnd}"
        contextCache[cacheKey]?.let { return it }
        
        val psiFile = getPsiFile(project, editor) ?: run {
            return CodeContext(
                selectedText = selectedText,
                beforeContext = "",
                afterContext = "",
                fileType = "unknown",
                fileName = "unknown"
            )
        }
        
        // 提取前后上下文（各20行）
        val startOffset = selectionModel.selectionStart
        val endOffset = selectionModel.selectionEnd
        val startLine = document.getLineNumber(startOffset)
        val endLine = document.getLineNumber(endOffset)
        
        val beforeLineStart = maxOf(0, startLine - 20)
        val afterLineEnd = minOf(document.lineCount - 1, endLine + 20)
        
        val beforeStart = document.getLineStartOffset(beforeLineStart)
        val beforeEnd = document.getLineStartOffset(startLine)
        val beforeTextRange = com.intellij.openapi.util.TextRange.create(beforeStart, beforeEnd)
        val beforeContext = document.getText(beforeTextRange)
        
        val afterStart = document.getLineEndOffset(endLine)
        val afterEnd = document.getLineEndOffset(afterLineEnd)
        val afterTextRange = com.intellij.openapi.util.TextRange.create(afterStart, afterEnd)
        val afterContext = document.getText(afterTextRange)
        
        // 提取导入声明
        val imports = extractImports(psiFile)
        
        // 提取类结构
        val classStructure = extractClassStructure(psiFile)
        
        // 检测项目主要语言
        val projectLanguage = detectProjectLanguage(project)
        
        val context = CodeContext(
            selectedText = selectedText,
            beforeContext = beforeContext,
            afterContext = afterContext,
            fileType = psiFile.fileType.name,
            fileName = psiFile.virtualFile?.name ?: "unknown",
            imports = imports,
            classStructure = classStructure,
            projectLanguage = projectLanguage
        )
        
        contextCache[cacheKey] = context
        return context
    }
    
    fun extractCompletionContext(project: Project, editor: Editor, offset: Int): String {
        val document = editor.document
        val lineNumber = document.getLineNumber(offset)
        val lineStartOffset = document.getLineStartOffset(lineNumber)
        val prefixTextRange = com.intellij.openapi.util.TextRange.create(lineStartOffset, offset)
        val prefixText = document.getText(prefixTextRange)
        
        val contextStartLine = maxOf(0, lineNumber - 5)
        val contextStartOffset = document.getLineStartOffset(contextStartLine)
        val contextTextRange = com.intellij.openapi.util.TextRange.create(contextStartOffset, offset)
        val contextText = document.getText(contextTextRange)
        
        val psiFile = getPsiFile(project, editor)
        val imports = psiFile?.let { extractImports(it) } ?: emptyList()
        
        return buildString {
            append("// 当前行前缀: $prefixText\n")
            append("// 上下文代码:\n$contextText\n")
            if (imports.isNotEmpty()) {
                append("// 导入声明:\n")
                imports.forEach { append("$it\n") }
            }
        }
    }
    
    fun recordPattern(pattern: String) {
        patternUsageCount.computeIfAbsent(pattern) { AtomicInteger(0) }.incrementAndGet()
    }
    
    fun getTopPatterns(limit: Int = 10): List<Pair<String, Int>> {
        return patternUsageCount.entries
            .sortedByDescending { it.value.get() }
            .take(limit)
            .map { it.key to it.value.get() }
    }
    
    fun clearCache() {
        contextCache.clear()
    }
    
    private fun getPsiFile(project: Project, editor: Editor): PsiFile? {
        val virtualFile = editor.virtualFile ?: return null
        return PsiManager.getInstance(project).findFile(virtualFile)
    }
    
    private fun extractImports(psiFile: PsiFile): List<String> {
        // 简化实现：在实际中需要根据具体语言解析导入语句
        // 这里返回空列表作为占位符
        return emptyList()
    }
    
    private fun extractClassStructure(psiFile: PsiFile): String? {
        // 简化实现：在实际中需要解析类、方法、字段结构
        // 这里返回null作为占位符
        return null
    }
    
    private fun detectProjectLanguage(project: Project): String {
        // 简化实现：检查项目中常见文件类型
        val javaFiles = FilenameIndex.getAllFilesByExt(project, "java", GlobalSearchScope.projectScope(project))
        val kotlinFiles = FilenameIndex.getAllFilesByExt(project, "kt", GlobalSearchScope.projectScope(project))
        val jsFiles = FilenameIndex.getAllFilesByExt(project, "js", GlobalSearchScope.projectScope(project))
        val tsFiles = FilenameIndex.getAllFilesByExt(project, "ts", GlobalSearchScope.projectScope(project))
        val pyFiles = FilenameIndex.getAllFilesByExt(project, "py", GlobalSearchScope.projectScope(project))
        
        return when {
            kotlinFiles.isNotEmpty() -> "kotlin"
            javaFiles.isNotEmpty() -> "java"
            tsFiles.isNotEmpty() -> "typescript"
            jsFiles.isNotEmpty() -> "javascript"
            pyFiles.isNotEmpty() -> "python"
            else -> "unknown"
        }
    }
}