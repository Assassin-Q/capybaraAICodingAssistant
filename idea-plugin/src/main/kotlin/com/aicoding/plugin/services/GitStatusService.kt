package com.aicoding.plugin.services

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager
import kotlinx.serialization.Serializable
import java.io.File
import java.util.concurrent.TimeUnit

@Serializable
data class GitChangedFile(val path: String, val status: String, val staged: Boolean)

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
        GitStatusResponse(
            available = true,
            ahead = Regex("ahead (\\d+)").find(counts)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0,
            behind = Regex("behind (\\d+)").find(counts)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0,
            branch = branch,
            files = lines.drop(if (header.isBlank()) 0 else 1).mapNotNull(::parseStatusLine),
            upstream = upstream,
        )
    }.getOrElse { GitStatusResponse(false, message = it.message ?: "当前目录不是 Git 仓库") }

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
                @Suppress("DEPRECATION")
                runCatching { ChangeListManager.getInstance(project).defaultChangeList.setComment(message) }
                    .onFailure { logger.info("Unable to prefill the commit message: ${it.message}") }
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

    private fun git(arguments: List<String>, timeout: Long = 15_000): CommandResult {
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
        return CommandResult(if (completed) process.exitValue() else -1, output.toString().trim())
    }

    private data class CommandResult(val exitCode: Int, val output: String)
}
