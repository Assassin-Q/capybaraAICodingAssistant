package com.aicoding.plugin.services

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.serialization.Serializable

@Serializable
data class FileSearchRequest(
    val query: String,
    /** `name` matches file names the way Ctrl+N does; `content` looks inside files. */
    val mode: String = "name",
    val limit: Int = 30,
)

@Serializable
data class FileAttachRequest(val path: String)

@Serializable
data class FileSearchHit(
    val path: String,
    /** Project-relative, which is what the composer shows and what the model should be given. */
    val relativePath: String,
    val name: String,
    /** Content matches only: 1-based line of the first hit. */
    val line: Int? = null,
    /** Content matches only: the matching line, trimmed and clipped. */
    val preview: String? = null,
)

@Serializable
data class FileSearchResponse(
    val success: Boolean,
    val hits: List<FileSearchHit> = emptyList(),
    /** True when IDEA is still indexing, so the caller can say the results are partial. */
    val indexing: Boolean = false,
    /** True when the scan hit its time or size budget before running out of files. */
    val truncated: Boolean = false,
    val message: String? = null,
)

/**
 * File lookup backed by IDEA's own project model rather than a filesystem walk.
 *
 * Going through [ProjectFileIndex] is what makes this agree with the IDE: excluded folders,
 * generated output, and library roots are already filtered out, so the composer never offers a
 * file from `build/` or `node_modules` that the user would not find with Ctrl+N either.
 *
 * Both modes are budgeted. A content scan over a large repository can take arbitrarily long, and
 * this runs behind an HTTP request the UI is waiting on, so it stops at whichever comes first —
 * enough hits, the file cap, or the time limit — and says so via [FileSearchResponse.truncated]
 * instead of pretending the result set is complete.
 */
class IdeaFileSearchService(private val project: Project) {

    fun search(request: FileSearchRequest): FileSearchResponse = runCatching {
        val query = request.query.trim()
        if (query.isEmpty()) return FileSearchResponse(success = true)
        val limit = request.limit.coerceIn(1, 200)
        val indexing = DumbService.getInstance(project).isDumb
        when (request.mode.trim().lowercase()) {
            "content" -> searchContent(query, limit, indexing)
            else -> searchNames(query, limit, indexing)
        }
    }.getOrElse { FileSearchResponse(success = false, message = it.message ?: "文件检索失败") }

    private fun searchNames(query: String, limit: Int, indexing: Boolean): FileSearchResponse {
        val scored = mutableListOf<Pair<Int, VirtualFile>>()
        var examined = 0
        var truncated = false
        read {
            val fileTypes = FileTypeManager.getInstance()
            ProjectFileIndex.getInstance(project).iterateContent { file ->
                if (file.isDirectory) return@iterateContent true
                if (++examined > FILE_SCAN_CAP) {
                    truncated = true
                    return@iterateContent false
                }
                // Compiled and packaged output is worthless as chat context and drowns the real
                // matches: searching "ACPanel" surfaced build/classes/.../AICodingPanel.class
                // alongside the source. ProjectFileIndex only omits roots the IDE has marked
                // excluded, and a Gradle `build/` directory is not always one of them.
                if (fileTypes.getFileTypeByFile(file).isBinary) return@iterateContent true
                val score = fuzzyScore(file.name, query)
                if (score != null) scored += score to file
                true
            }
        }
        // Ranked after collection rather than during: taking the first N matches in iteration
        // order would surface whatever the index happens to walk first, not the closest names.
        val hits = scored.sortedWith(compareBy({ it.first }, { it.second.name.length }))
            .take(limit)
            .map { (_, file) -> hitOf(file) }
        return FileSearchResponse(success = true, hits = hits, indexing = indexing, truncated = truncated)
    }

    private fun searchContent(query: String, limit: Int, indexing: Boolean): FileSearchResponse {
        val needle = query.lowercase()
        val hits = mutableListOf<FileSearchHit>()
        val deadline = System.currentTimeMillis() + CONTENT_BUDGET_MS
        var truncated = false
        read {
            val fileTypes = FileTypeManager.getInstance()
            ProjectFileIndex.getInstance(project).iterateContent { file ->
                if (hits.size >= limit) {
                    truncated = true
                    return@iterateContent false
                }
                if (System.currentTimeMillis() > deadline) {
                    truncated = true
                    return@iterateContent false
                }
                if (file.isDirectory || file.length > MAX_CONTENT_BYTES) return@iterateContent true
                // Binary files would both waste the budget and produce unreadable previews.
                if (fileTypes.getFileTypeByFile(file).isBinary) return@iterateContent true
                val text = runCatching { VfsUtilCore.loadText(file) }.getOrNull() ?: return@iterateContent true
                if (!text.contains(needle, ignoreCase = true)) return@iterateContent true
                val index = text.indexOf(needle, ignoreCase = true)
                val line = text.take(index).count { it == '\n' } + 1
                val lineText = text.lineSequence().drop(line - 1).firstOrNull().orEmpty()
                hits += hitOf(file).copy(line = line, preview = lineText.trim().take(PREVIEW_CHARS))
                true
            }
        }
        return FileSearchResponse(success = true, hits = hits, indexing = indexing, truncated = truncated)
    }

    /**
     * Attaches a searched file to the composer exactly as the editor's right-click action does.
     *
     * Publishing through [MessageService] rather than returning the text keeps one code path for
     * "a file became context": same SSE event, same chip, same truncation rules. A second path
     * would be one more place for the two to drift.
     */
    fun attach(request: FileAttachRequest): FileSearchResponse = runCatching {
        // Everything that touches the project model runs under one read action.
        //
        // This handler is on an HTTP thread, and `isInContent` asserts read access. The platform's
        // assertion reports through Logger.error, which in a released IDE logs rather than throws —
        // so the attach still succeeded while the user got an "IDE error occurred" balloon for it.
        val (target, kind, text) = read {
            val file = LocalFileSystem.getInstance().findFileByPath(request.path.replace('\\', '/'))
                ?: error("找不到该文件：${request.path}")
            require(ProjectFileIndex.getInstance(project).isInContent(file)) { "该文件不在当前项目内容根中" }
            val fileKind = when {
                file.isDirectory -> "directory"
                FileTypeManager.getInstance().getFileTypeByFile(file).isBinary -> "binary"
                else -> "file"
            }
            Triple(file, fileKind, contextTextOf(file))
        }
        // Published outside the lock: notifying SSE listeners is not model access, and holding a
        // read action across it would block writes for as long as the delivery takes.
        project.getService(MessageService::class.java).addMessage(
            type = "add_to_chat",
            content = text,
            kind = kind,
            fileName = target.path,
        )
        FileSearchResponse(success = true, hits = listOf(hitOf(target)))
    }.getOrElse { FileSearchResponse(success = false, message = it.message ?: "无法引用该文件") }

    private fun contextTextOf(file: VirtualFile): String = when {
        file.isDirectory -> "目录：${file.path}"
        FileTypeManager.getInstance().getFileTypeByFile(file).isBinary -> "二进制文件：${file.path}"
        file.length > MAX_ATTACH_BYTES -> "文件：${file.path}\n[文件大于 512 KB，未读取内容]"
        // Callers already hold the read action; nesting another would be redundant.
        else -> runCatching { VfsUtilCore.loadText(file) }.getOrElse { "[无法读取文件：${it.message.orEmpty()}]" }
    }

    private fun hitOf(file: VirtualFile): FileSearchHit {
        val base = project.basePath
        val path = file.path
        val relative = if (base != null && path.startsWith(base)) {
            path.removePrefix(base).trimStart('/', '\\')
        } else {
            path
        }
        return FileSearchHit(path = path, relativePath = relative, name = file.name)
    }

    /**
     * Ctrl+N style matching: prefix beats word-start beats scattered subsequence, lower is better.
     * Returns null when the characters do not appear in order at all.
     */
    private fun fuzzyScore(value: String, term: String): Int? {
        val name = value.lowercase()
        val query = term.lowercase()
        if (query.isEmpty()) return 0
        if (name == query) return 0
        if (name.startsWith(query)) return 1
        val contains = name.indexOf(query)
        if (contains >= 0) return 10 + contains
        var cursor = 0
        var gaps = 0
        for (character in query) {
            val index = name.indexOf(character, cursor)
            if (index < 0) return null
            gaps += index - cursor
            cursor = index + 1
        }
        return 100 + gaps
    }

    private fun <T> read(action: () -> T): T = ReadAction.compute<T, RuntimeException>(action)

    private companion object {
        /** Stops a pathological project from turning a name lookup into a long scan. */
        const val FILE_SCAN_CAP = 200_000
        const val CONTENT_BUDGET_MS = 2_500L
        const val MAX_CONTENT_BYTES = 2L * 1024 * 1024
        const val PREVIEW_CHARS = 200
        /** Matches the editor right-click limit so both paths truncate at the same place. */
        const val MAX_ATTACH_BYTES = 512L * 1024
    }
}
