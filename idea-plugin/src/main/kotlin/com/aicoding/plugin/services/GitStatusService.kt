package com.aicoding.plugin.services

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffDialogHints
import com.intellij.diff.DiffManagerEx
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vfs.LocalFileSystem
import kotlinx.serialization.Serializable
import java.io.File
import java.util.concurrent.TimeUnit

@Serializable
data class GitChangedFile(
    val path: String,
    val status: String,
    val staged: Boolean,
    val additions: Int = 0,
    val deletions: Int = 0,
    /** True for binary files, where git reports "-" instead of counts. */
    val binary: Boolean = false,
)

@Serializable
data class GitFileDiffRequest(val path: String)

@Serializable
data class GitStatusResponse(
    val available: Boolean,
    val branch: String? = null,
    val upstream: String? = null,
    val ahead: Int = 0,
    val behind: Int = 0,
    val files: List<GitChangedFile> = emptyList(),
    val message: String? = null,
)

@Serializable
data class GitDiffSummary(
    val available: Boolean,
    val branch: String? = null,
    /** `git diff HEAD --stat`, trimmed — compact enough to feed a model. */
    val stat: String = "",
    val nameStatus: String = "",
    val message: String? = null,
)

@Serializable
data class GitCommitDialogRequest(val message: String? = null)

@Serializable
data class GitActionResponse(val success: Boolean, val message: String? = null)

/**
 * Read-only git status plus hand-offs to IDEA's own commit and push UI.
 *
 * Deliberately does not implement committing, branching or merging: IDEA's Commit window,
 * branch widget and Push dialog already do all of that better.
 */
@Service(Service.Level.PROJECT)
class GitStatusService(private val project: Project) {
    private val logger = Logger.getInstance(GitStatusService::class.java)
    private val workingDirectory = project.basePath?.let(::File)

    @Volatile
    private var lastBranch: String? = null

    fun status(): GitStatusResponse = runCatching {
        val result = git(listOf("status", "--short", "--branch"))
        require(result.exitCode == 0) { result.output.ifBlank { "无法读取 Git 状态" } }
        val lines = result.output.lines().filter(String::isNotBlank)
        val header = lines.firstOrNull()?.takeIf { it.startsWith("## ") }?.removePrefix("## ").orEmpty()
        val branch = header.substringBefore("...").substringBefore(" [").trim().ifBlank { null }
        val upstream = header.substringAfter("...", "").substringBefore(" [").trim().ifBlank { null }
        val counts = header.substringAfter("[", "").substringBefore("]", "")
        val stats = numstat()
        GitStatusResponse(
            available = true,
            ahead = Regex("ahead (\\d+)").find(counts)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0,
            behind = Regex("behind (\\d+)").find(counts)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0,
            branch = branch,
            files = lines.drop(if (header.isBlank()) 0 else 1)
                .mapNotNull(::parseStatusLine)
                .map { file -> stats[file.path]?.let { file.copy(additions = it.first, deletions = it.second, binary = it.third) } ?: file },
            upstream = upstream,
        )
    }.getOrElse { GitStatusResponse(false, message = it.message ?: "当前目录不是 Git 仓库") }

    /** `git diff HEAD --numstat` gives per-file line counts; untracked files are counted separately. */
    private fun numstat(): Map<String, Triple<Int, Int, Boolean>> {
        val result = git(listOf("diff", "HEAD", "--numstat"), 20_000)
        if (result.exitCode != 0) return emptyMap()
        val tracked = result.output.lines().filter(String::isNotBlank).mapNotNull { line ->
            val parts = line.split('\t')
            if (parts.size < 3) return@mapNotNull null
            val path = parts[2].substringAfter(" => ").trim().trim('"')
            val binary = parts[0] == "-" || parts[1] == "-"
            path to Triple(parts[0].toIntOrNull() ?: 0, parts[1].toIntOrNull() ?: 0, binary)
        }.toMap()

        // Untracked files never appear in `diff HEAD`; count their lines as additions.
        val untracked = git(listOf("ls-files", "--others", "--exclude-standard"), 20_000)
        if (untracked.exitCode != 0) return tracked
        val extra = untracked.output.lines().filter(String::isNotBlank).associate { path ->
            val file = workingDirectory?.resolve(path)
            val lines = runCatching {
                if (file != null && file.isFile && file.length() < 2_000_000) file.readLines().size else 0
            }.getOrDefault(0)
            path.trim() to Triple(lines, 0, false)
        }
        return tracked + extra
    }

    /** Opens IDEA's native diff for one file: committed revision on the left, working tree on the right. */
    fun openFileDiff(request: GitFileDiffRequest): GitActionResponse = runCatching {
        val relative = request.path.trim().trim('"')
        require(relative.isNotBlank()) { "缺少文件路径" }
        val base = (workingDirectory ?: error("当前 IDEA 项目没有工作目录")).toPath().toAbsolutePath().normalize()
        val absolute = base.resolve(relative).toAbsolutePath().normalize()
        require(absolute.startsWith(base)) { "文件不在当前项目中：$relative" }

        val show = git(listOf("show", "HEAD:$relative"), 20_000, trimOutput = false)
        val headText = if (show.exitCode == 0) show.output else ""
        val fileName = absolute.fileName.toString()
        ApplicationManager.getApplication().invokeLater {
            runCatching {
                val factory = DiffContentFactory.getInstance()
                val fileType = FileTypeManager.getInstance().getFileTypeByFileName(fileName)
                val virtualFile = LocalFileSystem.getInstance()
                    .refreshAndFindFileByPath(absolute.toString().replace('\\', '/'))
                val before = factory.create(project, headText, fileType)
                val current = virtualFile?.let { factory.create(project, it) }
                    ?: factory.create(project, "", fileType)
                DiffManagerEx.getInstance().showDiffBuiltin(
                    project,
                    SimpleDiffRequest("Git 差异：$fileName", before, current, "HEAD", "当前工作区"),
                    DiffDialogHints.MODAL,
                )
            }.onFailure { logger.info("Unable to open the git diff: ${it.message}") }
        }
        GitActionResponse(true, "已打开 IDEA 差异对比")
    }.getOrElse { GitActionResponse(false, it.message ?: "无法打开差异对比") }

    /**
     * Returns the current branch and whether it changed since the last call, so the caller can
     * warn that files the assistant read earlier may no longer match the working tree.
     */
    fun consumeBranchChange(): Pair<String?, String?> {
        val current = runCatching {
            git(listOf("rev-parse", "--abbrev-ref", "HEAD")).takeIf { it.exitCode == 0 }?.output?.trim()
        }.getOrNull()
        val previous = lastBranch
        lastBranch = current
        return previous to current
    }

    fun diffSummary(): GitDiffSummary = runCatching {
        val stat = git(listOf("diff", "HEAD", "--stat"), 30_000)
        val nameStatus = git(listOf("status", "--porcelain"), 30_000)
        require(stat.exitCode == 0) { stat.output.ifBlank { "无法读取 Git 差异" } }
        GitDiffSummary(
            available = true,
            branch = git(listOf("rev-parse", "--abbrev-ref", "HEAD")).output.trim().ifBlank { null },
            nameStatus = nameStatus.output.take(8_000),
            stat = stat.output.take(8_000),
        )
    }.getOrElse { GitDiffSummary(false, message = it.message ?: "无法读取 Git 差异") }

    /** Prefills the active changelist comment, then opens IDEA's own commit UI. */
    fun openCommitDialog(request: GitCommitDialogRequest): GitActionResponse = runCatching {
        val message = request.message?.trim()
        ApplicationManager.getApplication().invokeLater {
            if (!message.isNullOrBlank()) {
                // Deprecated alongside changelists generally, but 2023.2.4 exposes no replacement
                // for seeding the commit message, and IDEA's commit UI still reads it.
                //
                // Invoked reflectively: `setComment` moved up to the ChangeList super-interface in
                // later builds, so a direct call compiles to an invokevirtual on LocalChangeList
                // that no longer resolves there — a NoSuchMethodError on 2025.3 and 2026.2.
                runCatching {
                    val list = ChangeListManager.getInstance(project).defaultChangeList
                    list.javaClass.getMethod("setComment", String::class.java).invoke(list, message)
                }.onFailure { logger.info("Unable to prefill the commit message: ${it.message}") }
            }
            invokeVcsAction("CheckinProject")
        }
        GitActionResponse(true, if (message.isNullOrBlank()) "已打开 IDEA 提交窗口" else "已填入摘要并打开 IDEA 提交窗口")
    }.getOrElse { GitActionResponse(false, it.message ?: "无法打开提交窗口") }

    fun openPushDialog(): GitActionResponse = runCatching {
        ApplicationManager.getApplication().invokeLater { invokeVcsAction("Vcs.Push") }
        GitActionResponse(true, "已打开 IDEA 推送窗口")
    }.getOrElse { GitActionResponse(false, it.message ?: "无法打开推送窗口") }

    private fun invokeVcsAction(actionID: String) {
        val action = ActionManager.getInstance().getAction(actionID)
        if (action == null) {
            logger.info("VCS action not available: $actionID")
            return
        }
        ActionUtil.invokeAction(
            action,
            SimpleDataContext.getProjectContext(project),
            "CapybaraGit",
            null,
            null,
        )
    }

    private fun parseStatusLine(line: String): GitChangedFile? {
        if (line.length < 3) return null
        val index = line[0]
        val worktree = line[1]
        val path = line.drop(3).substringAfter(" -> ").trim().trim('"')
        if (path.isBlank()) return null
        return GitChangedFile(
            path = path,
            staged = index != ' ' && index != '?',
            status = describe(index, worktree),
        )
    }

    private fun describe(index: Char, worktree: Char): String = when {
        index == '?' || worktree == '?' -> "未跟踪"
        index == 'A' -> "新增"
        index == 'D' || worktree == 'D' -> "删除"
        index == 'R' -> "重命名"
        index == 'U' || worktree == 'U' -> "冲突"
        else -> "修改"
    }

    private fun git(
        arguments: List<String>,
        timeout: Long = 15_000,
        trimOutput: Boolean = true,
    ): CommandResult {
        val directory = workingDirectory ?: return CommandResult(-1, "当前 IDEA 项目没有工作目录")
        val process = ProcessBuilder(listOf("git") + arguments)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        val output = StringBuilder()
        val reader = Thread {
            process.inputStream.bufferedReader(Charsets.UTF_8).useLines { lines ->
                lines.forEach { output.appendLine(it) }
            }
        }.apply { isDaemon = true; start() }
        val completed = process.waitFor(timeout, TimeUnit.MILLISECONDS)
        if (!completed) process.destroyForcibly()
        reader.join(2_000)
        val text = output.toString()
        return CommandResult(if (completed) process.exitValue() else -1, if (trimOutput) text.trim() else text)
    }

    private data class CommandResult(val exitCode: Int, val output: String)
}
