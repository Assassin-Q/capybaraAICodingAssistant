package com.aicoding.plugin.services

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffDialogHints
import com.intellij.diff.DiffManagerEx
import com.intellij.diff.comparison.ComparisonManager
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.MarkupModel
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import kotlinx.serialization.Serializable
import java.awt.Color
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.atomic.AtomicReference

@Serializable
data class IdeaDiffFileRequest(
    val file: String,
    val patch: String,
    val title: String? = null,
)

@Serializable
data class IdeaInlineDiffRequest(val files: List<IdeaDiffFileRequest>)

@Serializable
data class IdeaDiffResponse(
    val success: Boolean,
    val message: String? = null,
)

private data class DiffHunk(
    val startLine: Int,
    val removedLines: List<String>,
    val addedLines: List<String>,
)

class IdeaDiffService(private val project: Project) {
    private data class ManagedHighlighter(
        val model: MarkupModel,
        val highlighter: RangeHighlighter,
    )

    private data class FileMarkup(
        val highlighters: MutableList<ManagedHighlighter> = mutableListOf(),
        val inlays: MutableList<Inlay<*>> = mutableListOf(),
    )

    private val connection = project.messageBus.connect()
    private val hunksByFile = mutableMapOf<String, List<DiffHunk>>()
    private val markupByFile = mutableMapOf<String, FileMarkup>()

    init {
        connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
            override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                if (!hunksByFile.containsKey(file.path)) return
                ApplicationManager.getApplication().invokeLater { refreshFile(file.path) }
            }
        })
    }

    fun open(request: IdeaDiffFileRequest): IdeaDiffResponse = runCatching {
        val path = resolveProjectFile(request.file)
        val parsed = UnifiedPatchParser.parse(request.patch)
        runOnEdtAndWait {
            val virtualFile = findVirtualFile(path)
            val factory = DiffContentFactory.getInstance()
            val fileType = FileTypeManager.getInstance().getFileTypeByFileName(path.fileName.toString())
            val before = factory.create(project, parsed.before, fileType)
            val current = virtualFile?.let { factory.create(project, it) }
                ?: factory.create(project, "", fileType)
            val after = factory.create(project, parsed.after, fileType)
            val title = request.title?.takeIf { it.isNotBlank() }
                ?: "AI 修改：${path.fileName}"
            val diffRequest = SimpleDiffRequest(
                title,
                before,
                current,
                after,
                "该轮 AI 修改前",
                "当前实际文件内容",
                "该轮 AI 修改后",
            )
            // MODAL, not FRAME. FRAME is only a request: DiffManagerImpl consults
            // DiffEditorTabFilesManager and still routes to an editor tab, which is what kept the
            // comparison docked inside the IDE. A dialog is never turned into a tab.
            DiffManagerEx.getInstance().showDiffBuiltin(project, diffRequest, DiffDialogHints.MODAL)
        }
    }.fold(
        onSuccess = { IdeaDiffResponse(success = true) },
        onFailure = { IdeaDiffResponse(success = false, message = it.message ?: "无法打开 IDEA 差异对比") },
    )

    fun applyInline(request: IdeaInlineDiffRequest): IdeaDiffResponse = runCatching {
        val next = request.files.associate { file ->
            val path = resolveProjectFile(file.file).toString().replace('\\', '/')
            val parsed = UnifiedPatchParser.parse(file.patch)
            path to computeHunks(parsed)
        }
        runOnEdtAndWait {
            clearMarkup()
            hunksByFile.clear()
            hunksByFile.putAll(next)
            next.keys.forEach(::refreshFile)
        }
    }.fold(
        onSuccess = { IdeaDiffResponse(success = true) },
        onFailure = { IdeaDiffResponse(success = false, message = it.message ?: "无法显示行内差异") },
    )

    fun clearInline(): IdeaDiffResponse = runCatching {
        runOnEdtAndWait {
            clearMarkup()
            hunksByFile.clear()
        }
    }.fold(
        onSuccess = { IdeaDiffResponse(success = true) },
        onFailure = { IdeaDiffResponse(success = false, message = it.message ?: "无法清除行内差异") },
    )

    fun dispose() {
        clearInline()
        connection.disconnect()
    }

    private fun computeHunks(diff: PatchedFileText): List<DiffHunk> {
        val beforeLines = if (diff.before.isEmpty()) emptyList() else diff.before.lines()
        val afterLines = if (diff.after.isEmpty()) emptyList() else diff.after.lines()
        return ComparisonManager.getInstance()
            .compareLines(diff.before, diff.after, ComparisonPolicy.DEFAULT, EmptyProgressIndicator())
            .map { change ->
                DiffHunk(
                    startLine = change.startLine2,
                    removedLines = beforeLines.subList(
                        change.startLine1.coerceAtMost(beforeLines.size),
                        change.endLine1.coerceAtMost(beforeLines.size),
                    ),
                    addedLines = afterLines.subList(
                        change.startLine2.coerceAtMost(afterLines.size),
                        change.endLine2.coerceAtMost(afterLines.size),
                    ),
                )
            }
    }

    private fun refreshFile(filePath: String) {
        clearMarkup(filePath)
        val hunks = hunksByFile[filePath].orEmpty()
        if (hunks.isEmpty()) return
        val editors = editorsForPath(filePath)
        if (editors.isEmpty()) return
        val document = editors.first().document
        val markup = FileMarkup()

        hunks.forEach { hunk ->
            if (hunk.addedLines.isNotEmpty() && document.lineCount > 0) {
                val start = hunk.startLine.coerceIn(0, document.lineCount - 1)
                val end = (hunk.startLine + hunk.addedLines.size - 1).coerceIn(0, document.lineCount - 1)
                val attributes = TextAttributes().apply {
                    backgroundColor = JBColor(Color(0xE1F4E5), Color(0x183D27))
                }
                editors.forEach { editor ->
                    (start..end).forEach { line ->
                        val highlighter = editor.markupModel.addLineHighlighter(
                            line,
                            HighlighterLayer.SELECTION - 1,
                            attributes,
                        )
                        markup.highlighters += ManagedHighlighter(editor.markupModel, highlighter)
                    }
                }
            }

            if (hunk.removedLines.isNotEmpty()) {
                val offset = if (document.lineCount > 0) {
                    document.getLineStartOffset(hunk.startLine.coerceIn(0, document.lineCount - 1))
                } else {
                    0
                }
                editors.forEach { editor ->
                    editor.inlayModel.addBlockElement(
                        offset,
                        false,
                        true,
                        0,
                        RemovedLinesRenderer(hunk.removedLines, editor),
                    )?.let(markup.inlays::add)
                }
            }
        }
        markupByFile[filePath] = markup
    }

    private fun editorsForPath(filePath: String): List<Editor> {
        val file = LocalFileSystem.getInstance().findFileByPath(filePath) ?: return emptyList()
        return FileEditorManager.getInstance(project)
            .getAllEditors(file)
            .filterIsInstance<TextEditor>()
            .map { it.editor }
    }

    private fun clearMarkup() {
        markupByFile.keys.toList().forEach(::clearMarkup)
    }

    private fun clearMarkup(filePath: String) {
        val markup = markupByFile.remove(filePath) ?: return
        markup.highlighters.forEach { managed ->
            if (managed.highlighter.isValid) managed.model.removeHighlighter(managed.highlighter)
        }
        markup.inlays.forEach(Inlay<*>::dispose)
    }

    private fun resolveProjectFile(file: String): Path {
        val base = project.basePath?.let(Paths::get)?.toAbsolutePath()?.normalize()
            ?: error("当前 IDEA 项目没有工作目录")
        val requested = Paths.get(file)
        val resolved = (if (requested.isAbsolute) requested else base.resolve(requested))
            .toAbsolutePath()
            .normalize()
        require(resolved.startsWith(base)) { "差异文件不在当前项目中：$file" }
        return resolved
    }

    private fun findVirtualFile(path: Path): VirtualFile? = LocalFileSystem.getInstance()
        .refreshAndFindFileByPath(path.toString().replace('\\', '/'))

    private fun runOnEdtAndWait(action: () -> Unit) {
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) {
            action()
            return
        }
        val failure = AtomicReference<Throwable?>()
        application.invokeAndWait {
            runCatching(action).onFailure(failure::set)
        }
        failure.get()?.let { throw it }
    }
}
