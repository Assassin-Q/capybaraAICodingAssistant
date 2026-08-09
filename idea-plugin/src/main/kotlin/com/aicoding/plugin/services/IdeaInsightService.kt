package com.aicoding.plugin.services

import com.intellij.codeInsight.daemon.impl.DaemonCodeAnalyzerEx
import com.intellij.ide.projectView.ProjectView
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiNamedElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.search.searches.DefinitionsScopedSearch
import com.intellij.psi.search.searches.ReferencesSearch
import kotlinx.serialization.Serializable
import java.nio.file.Path

@Serializable
data class IdeaModuleInfo(
    val name: String,
    val sdk: String? = null,
    val contentRoots: List<String> = emptyList(),
    val sourceRoots: List<String> = emptyList(),
    val dependencies: List<String> = emptyList(),
)

@Serializable
data class IdeaProjectContextResponse(
    val success: Boolean,
    val message: String? = null,
    val projectName: String? = null,
    val basePath: String? = null,
    val sdk: String? = null,
    val sdkVersion: String? = null,
    val modules: List<IdeaModuleInfo> = emptyList(),
    val openFiles: List<String> = emptyList(),
    val currentFile: String? = null,
)

@Serializable
data class IdeaEditorContextRequest(
    val path: String? = null,
    /** One-based line. Omit to use the current caret. */
    val line: Int? = null,
    val contextLines: Int = 40,
)

@Serializable
data class IdeaEditorContextResponse(
    val success: Boolean,
    val message: String? = null,
    val path: String? = null,
    val language: String? = null,
    val line: Int? = null,
    val column: Int? = null,
    val lineCount: Int? = null,
    val selectionStartLine: Int? = null,
    val selectionEndLine: Int? = null,
    val selectedText: String? = null,
    val contextStartLine: Int? = null,
    val contextEndLine: Int? = null,
    val context: String? = null,
)

@Serializable
data class IdeaDiagnosticRequest(
    val path: String? = null,
    val minSeverity: String = "warning",
    val limit: Int = 200,
)

@Serializable
data class IdeaDiagnosticInfo(
    val severity: String,
    val description: String,
    val line: Int,
    val column: Int,
    val endLine: Int,
    val endColumn: Int,
    val inspectionId: String? = null,
)

@Serializable
data class IdeaDiagnosticResponse(
    val success: Boolean,
    val message: String? = null,
    val path: String? = null,
    val analysisComplete: Boolean = false,
    val diagnostics: List<IdeaDiagnosticInfo> = emptyList(),
)

@Serializable
data class IdeaSymbolRequest(
    val path: String? = null,
    val line: Int,
    val column: Int = 1,
    val action: String = "references",
    val limit: Int = 100,
)

@Serializable
data class IdeaSymbolLocation(
    val path: String,
    val line: Int,
    val column: Int,
    val name: String? = null,
    val kind: String? = null,
    val preview: String? = null,
)

@Serializable
data class IdeaSymbolResponse(
    val success: Boolean,
    val message: String? = null,
    val symbol: String? = null,
    val definition: IdeaSymbolLocation? = null,
    val results: List<IdeaSymbolLocation> = emptyList(),
)

@Serializable
data class IdeaNavigateRequest(val path: String, val line: Int = 1, val column: Int = 1)

@Serializable
data class IdeaNativeActionResponse(val success: Boolean, val message: String? = null)

/** Read-only project intelligence backed by IDEA's live PSI, indexes and editor state. */
class IdeaInsightService(private val project: Project) {
    fun projectContext(): IdeaProjectContextResponse = runCatching {
        read {
            val projectSdk = ProjectRootManager.getInstance(project).projectSdk
            val fileManager = FileEditorManager.getInstance(project)
            IdeaProjectContextResponse(
                success = true,
                projectName = project.name,
                basePath = project.basePath,
                sdk = projectSdk?.name,
                sdkVersion = projectSdk?.versionString,
                modules = ModuleManager.getInstance(project).modules.map { module ->
                    val roots = ModuleRootManager.getInstance(module)
                    IdeaModuleInfo(
                        name = module.name,
                        sdk = roots.sdk?.presentableName(),
                        contentRoots = roots.contentRoots.map(::relativePath),
                        sourceRoots = roots.sourceRoots.map(::relativePath),
                        dependencies = roots.moduleDependencies.map { it.name }.sorted(),
                    )
                }.sortedBy { it.name.lowercase() },
                openFiles = fileManager.openFiles.map(::relativePath).sorted(),
                currentFile = fileManager.selectedFiles.firstOrNull()?.let(::relativePath),
            )
        }
    }.getOrElse { IdeaProjectContextResponse(false, it.message ?: "无法读取 IDEA 项目结构") }

    fun editorContext(request: IdeaEditorContextRequest): IdeaEditorContextResponse = runCatching {
        val file = resolveFile(request.path) ?: error("没有找到目标文件或当前编辑器")
        read {
            val document = FileDocumentManager.getInstance().getDocument(file) ?: error("IDEA 无法读取该文件")
            val editor = FileEditorManager.getInstance(project).selectedTextEditor
                ?.takeIf { FileDocumentManager.getInstance().getFile(it.document) == file }
            val targetLine = ((request.line?.minus(1)) ?: editor?.caretModel?.logicalPosition?.line ?: 0)
                .coerceIn(0, (document.lineCount - 1).coerceAtLeast(0))
            val contextCount = request.contextLines.coerceIn(4, 200)
            val before = contextCount / 2
            val startLine = (targetLine - before).coerceAtLeast(0)
            val endLine = (startLine + contextCount - 1).coerceAtMost((document.lineCount - 1).coerceAtLeast(0))
            val selectedText = editor?.selectionModel?.selectedText?.take(MAX_SELECTION_CHARS)
            IdeaEditorContextResponse(
                success = true,
                path = relativePath(file),
                language = PsiManager.getInstance(project).findFile(file)?.language?.displayName,
                line = targetLine + 1,
                column = editor?.caretModel?.logicalPosition?.column?.plus(1),
                lineCount = document.lineCount,
                selectionStartLine = editor?.selectionModel?.takeIf { it.hasSelection() }
                    ?.let { document.getLineNumber(it.selectionStart) + 1 },
                selectionEndLine = editor?.selectionModel?.takeIf { it.hasSelection() }
                    ?.let { document.getLineNumber(it.selectionEnd.coerceAtMost(document.textLength)) + 1 },
                selectedText = selectedText,
                contextStartLine = startLine + 1,
                contextEndLine = endLine + 1,
                context = numberedLines(document, startLine, endLine),
            )
        }
    }.getOrElse { IdeaEditorContextResponse(false, it.message ?: "无法读取 IDEA 编辑器上下文") }

    fun diagnostics(request: IdeaDiagnosticRequest): IdeaDiagnosticResponse = runCatching {
        val file = resolveFile(request.path) ?: error("没有找到目标文件或当前编辑器")
        read {
            val document = FileDocumentManager.getInstance().getDocument(file) ?: error("IDEA 无法读取该文件")
            val psiFile = PsiManager.getInstance(project).findFile(file) ?: error("该文件没有可用的 PSI")
            val severity = when (request.minSeverity.lowercase()) {
                "error" -> HighlightSeverity.ERROR
                "weak_warning", "weak-warning", "weak" -> HighlightSeverity.WEAK_WARNING
                else -> HighlightSeverity.WARNING
            }
            val values = mutableListOf<IdeaDiagnosticInfo>()
            val limit = request.limit.coerceIn(1, 500)
            DaemonCodeAnalyzerEx.processHighlights(document, project, severity, 0, document.textLength) { info ->
                if (values.size >= limit) return@processHighlights false
                val start = info.startOffset.coerceIn(0, document.textLength)
                val end = info.endOffset.coerceIn(start, document.textLength)
                val startPosition = documentPosition(document, start)
                val endPosition = documentPosition(document, end)
                values += IdeaDiagnosticInfo(
                    severity = info.severity.name,
                    description = stripHtml(info.description ?: info.toolTip ?: "IDEA 检查项"),
                    line = startPosition.first + 1,
                    column = startPosition.second + 1,
                    endLine = endPosition.first + 1,
                    endColumn = endPosition.second + 1,
                    inspectionId = info.inspectionToolId,
                )
                true
            }
            val complete = DaemonCodeAnalyzerEx.getInstanceEx(project).isErrorAnalyzingFinished(psiFile)
            IdeaDiagnosticResponse(
                success = true,
                message = if (!complete) "IDEA 仍在分析该文件，结果可能暂时不完整" else null,
                path = relativePath(file),
                analysisComplete = complete,
                diagnostics = values,
            )
        }
    }.getOrElse { IdeaDiagnosticResponse(false, it.message ?: "无法读取 IDEA 诊断") }

    fun symbol(request: IdeaSymbolRequest): IdeaSymbolResponse = runCatching {
        val file = resolveFile(request.path) ?: error("没有找到目标文件或当前编辑器")
        read {
            val document = FileDocumentManager.getInstance().getDocument(file) ?: error("IDEA 无法读取该文件")
            val psiFile = PsiManager.getInstance(project).findFile(file) ?: error("该文件没有可用的 PSI")
            val line = request.line.coerceAtLeast(1) - 1
            require(line < document.lineCount) { "行号超出文件范围" }
            val lineStart = document.getLineStartOffset(line)
            val lineEnd = document.getLineEndOffset(line)
            val offset = (lineStart + request.column.coerceAtLeast(1) - 1).coerceAtMost(lineEnd)
            val leaf = psiFile.findElementAt(offset) ?: error("指定位置没有 PSI 元素")
            val target = psiFile.findReferenceAt(offset)?.resolve() ?: namedParent(leaf)
                ?: error("指定位置没有可解析的符号")
            val scope = GlobalSearchScope.projectScope(project)
            val elements = when (request.action.lowercase()) {
                "implementations", "definitions" -> DefinitionsScopedSearch.search(target, scope).findAll().toList()
                "references" -> ReferencesSearch.search(target, scope).findAll().map { it.element }
                else -> error("action 仅支持 references 或 implementations")
            }
            val limit = request.limit.coerceIn(1, 500)
            val results = elements.mapNotNull(::locationOf)
                .distinctBy { "${it.path}:${it.line}:${it.column}" }
                .take(limit)
            IdeaSymbolResponse(
                success = true,
                symbol = (target as? PsiNamedElement)?.name ?: target.text.take(120),
                definition = locationOf(target),
                results = results,
            )
        }
    }.getOrElse { IdeaSymbolResponse(false, it.message ?: "无法查询 IDEA 符号") }

    fun navigate(request: IdeaNavigateRequest): IdeaNativeActionResponse = runCatching {
        val file = resolveFile(request.path) ?: error("没有找到目标文件")
        ApplicationManager.getApplication().invokeLater {
            OpenFileDescriptor(
                project,
                file,
                request.line.coerceAtLeast(1) - 1,
                request.column.coerceAtLeast(1) - 1,
            ).navigate(true)
        }
        IdeaNativeActionResponse(true, "已在 IDEA 中定位到 ${relativePath(file)}:${request.line}")
    }.getOrElse { IdeaNativeActionResponse(false, it.message ?: "无法在 IDEA 中打开文件") }

    fun refresh(): IdeaNativeActionResponse = runCatching {
        FileDocumentManager.getInstance().saveAllDocuments()
        VirtualFileManager.getInstance().asyncRefresh(null)
        ApplicationManager.getApplication().invokeLater { ProjectView.getInstance(project).refresh() }
        IdeaNativeActionResponse(true, "已保存编辑器内容并刷新 IDEA 文件索引和项目树")
    }.getOrElse { IdeaNativeActionResponse(false, it.message ?: "刷新 IDEA 项目失败") }

    private fun resolveFile(path: String?): VirtualFile? {
        if (path.isNullOrBlank()) return FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
        val base = project.basePath?.let(Path::of)?.toAbsolutePath()?.normalize() ?: return null
        val requested = Path.of(path)
        val absolute = (if (requested.isAbsolute) requested else base.resolve(requested)).toAbsolutePath().normalize()
        require(absolute.startsWith(base)) { "只能访问当前 IDEA 项目中的文件" }
        return LocalFileSystem.getInstance().refreshAndFindFileByPath(absolute.toString().replace('\\', '/'))
    }

    private fun namedParent(element: PsiElement): PsiNamedElement? = generateSequence(element) { it.parent }
        .filterIsInstance<PsiNamedElement>()
        .firstOrNull()

    private fun locationOf(element: PsiElement): IdeaSymbolLocation? {
        val source = element.navigationElement.takeIf { it.isValid } ?: element
        val file = source.containingFile?.virtualFile ?: return null
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return null
        val offset = source.textOffset.coerceIn(0, document.textLength)
        val position = documentPosition(document, offset)
        return IdeaSymbolLocation(
            path = relativePath(file),
            line = position.first + 1,
            column = position.second + 1,
            name = (source as? PsiNamedElement)?.name,
            kind = source.javaClass.simpleName.removePrefix("Psi"),
            preview = lineText(document, position.first).trim().take(300),
        )
    }

    private fun documentPosition(document: Document, offset: Int): Pair<Int, Int> {
        val normalized = offset.coerceIn(0, document.textLength)
        val line = document.getLineNumber(normalized)
        return line to (normalized - document.getLineStartOffset(line))
    }

    private fun numberedLines(document: Document, startLine: Int, endLine: Int): String =
        (startLine..endLine).joinToString("\n") { line -> "${line + 1}: ${lineText(document, line)}" }

    private fun lineText(document: Document, line: Int): String {
        if (line !in 0 until document.lineCount) return ""
        return document.getText(com.intellij.openapi.util.TextRange(
            document.getLineStartOffset(line),
            document.getLineEndOffset(line),
        ))
    }

    private fun relativePath(file: VirtualFile): String {
        val base = project.basePath?.let(Path::of)?.toAbsolutePath()?.normalize()
        val path = Path.of(file.path).toAbsolutePath().normalize()
        return if (base != null && path.startsWith(base)) base.relativize(path).toString().replace('\\', '/') else file.path
    }

    private fun stripHtml(value: String): String = value
        .replace(Regex("<[^>]+>"), " ")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun <T> read(action: () -> T): T = ReadAction.compute<T, RuntimeException>(action)

    private fun Sdk.presentableName(): String = versionString?.let { "$name ($it)" } ?: name

    companion object {
        private const val MAX_SELECTION_CHARS = 50_000
    }
}
