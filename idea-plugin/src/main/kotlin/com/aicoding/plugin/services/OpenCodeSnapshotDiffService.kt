package com.aicoding.plugin.services

import kotlinx.serialization.Serializable
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

@Serializable
data class OpenCodeSnapshotDiffRequest(
    val start: String,
    val end: String,
    val files: List<String> = emptyList(),
)

@Serializable
data class OpenCodeSnapshotFileDiff(
    val file: String,
    val status: String,
    val additions: Int,
    val deletions: Int,
    val patch: String,
)

private data class SnapshotDiffRow(
    val file: String,
    val status: String,
    val additions: Int,
    val deletions: Int,
    val binary: Boolean,
)

private data class GitResult(
    val code: Int,
    val stdout: String,
    val stderr: String,
)

class OpenCodeSnapshotDiffService {
    private val hashPattern = Regex("^[0-9a-fA-F]{7,64}$")
    private val gitExecutable: String by lazy(::findGitExecutable)
    @Volatile private var cachedGitDirectory: File? = null

    @Synchronized
    fun diff(request: OpenCodeSnapshotDiffRequest): List<OpenCodeSnapshotFileDiff> {
        require(hashPattern.matches(request.start)) { "Invalid OpenCode snapshot start hash" }
        require(hashPattern.matches(request.end)) { "Invalid OpenCode snapshot end hash" }
        if (request.start == request.end) return emptyList()

        val gitDirectory = findSnapshotRepository(request.start, request.end)
        val requestedFiles = request.files.map(::normalizePath).filter(String::isNotBlank).toSet()
        val statuses = parseStatuses(
            runGit(
                gitDirectory,
                listOf("diff", "--no-ext-diff", "--name-status", "--no-renames", "-z", request.start, request.end, "--", "."),
            ).stdout,
        )
        val rows = parseNumstat(
            runGit(
                gitDirectory,
                listOf("diff", "--no-ext-diff", "--numstat", "--no-renames", "-z", request.start, request.end, "--", "."),
            ).stdout,
            statuses,
        ).filter { row -> requestedFiles.isEmpty() || normalizePath(row.file) in requestedFiles }

        return rows.map { row ->
            val patch = if (row.binary) "" else runGit(
                gitDirectory,
                listOf(
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-renames",
                    "--unified=999999",
                    request.start,
                    request.end,
                    "--",
                    ":(top,literal)${row.file}",
                ),
            ).stdout
            OpenCodeSnapshotFileDiff(
                additions = row.additions,
                deletions = row.deletions,
                file = row.file,
                patch = patch,
                status = row.status,
            )
        }
    }

    private fun findSnapshotRepository(start: String, end: String): File {
        cachedGitDirectory?.takeIf { containsSnapshots(it, start, end) }?.let { return it }
        val repository = snapshotRoots()
            .asSequence()
            .filter(File::isDirectory)
            .flatMap { root -> root.walkTopDown().maxDepth(3).asSequence() }
            .filter(::isSnapshotGitDirectory)
            .firstOrNull { candidate -> containsSnapshots(candidate, start, end) }
            ?: error("OpenCode snapshot repository was not found for this task")
        cachedGitDirectory = repository
        return repository
    }

    private fun snapshotRoots(): List<File> {
        val home = File(System.getProperty("user.home"))
        val localAppData = System.getenv("LOCALAPPDATA")?.let(::File)
        val appData = System.getenv("APPDATA")?.let(::File)
        val xdgData = System.getenv("XDG_DATA_HOME")?.let(::File)
        val explicitData = System.getenv("OPENCODE_DATA_HOME")?.let(::File)
        return listOfNotNull(
            explicitData?.resolve("snapshot"),
            xdgData?.resolve("opencode/snapshot"),
            home.resolve(".local/share/opencode/snapshot"),
            localAppData?.resolve("opencode/snapshot"),
            appData?.resolve("opencode/snapshot"),
            home.resolve(".opencode/snapshot"),
        ).distinctBy { it.absoluteFile.normalize().path.lowercase() }
    }

    private fun isSnapshotGitDirectory(directory: File): Boolean =
        directory.isDirectory && directory.resolve("objects").isDirectory && directory.resolve("HEAD").isFile

    private fun containsSnapshots(directory: File, start: String, end: String): Boolean =
        gitSucceeds(directory, listOf("cat-file", "-e", "$start^{tree}")) &&
            gitSucceeds(directory, listOf("cat-file", "-e", "$end^{tree}"))

    private fun parseStatuses(output: String): Map<String, String> {
        val tokens = output.split('\u0000').filter(String::isNotEmpty)
        val statuses = mutableMapOf<String, String>()
        var index = 0
        while (index < tokens.size) {
            val token = tokens[index]
            val fields = token.split('\t', limit = 2)
            val code: String
            val file: String
            if (fields.size == 2) {
                code = fields[0]
                file = fields[1]
                index += 1
            } else if (index + 1 < tokens.size) {
                code = token
                file = tokens[index + 1]
                index += 2
            } else {
                break
            }
            statuses[normalizePath(file)] = when {
                code.startsWith("A") -> "added"
                code.startsWith("D") -> "deleted"
                else -> "modified"
            }
        }
        return statuses
    }

    private fun parseNumstat(output: String, statuses: Map<String, String>): List<SnapshotDiffRow> =
        output.split('\u0000')
            .filter(String::isNotBlank)
            .mapNotNull { entry ->
                val fields = entry.split('\t', limit = 3)
                if (fields.size < 3) return@mapNotNull null
                val file = normalizePath(fields[2])
                val binary = fields[0] == "-" && fields[1] == "-"
                SnapshotDiffRow(
                    additions = if (binary) 0 else fields[0].toIntOrNull() ?: 0,
                    binary = binary,
                    deletions = if (binary) 0 else fields[1].toIntOrNull() ?: 0,
                    file = file,
                    status = statuses[file] ?: "modified",
                )
            }

    private fun normalizePath(path: String): String = path.replace('\\', '/').removePrefix("./")

    private fun runGit(gitDirectory: File, arguments: List<String>): GitResult {
        val result = execute(
            listOf(gitExecutable, "-c", "core.quotepath=false", "--git-dir", gitDirectory.absolutePath) + arguments,
        )
        if (result.code != 0) {
            error(result.stderr.ifBlank { "Git exited with code ${result.code}" })
        }
        return result
    }

    private fun gitSucceeds(gitDirectory: File, arguments: List<String>): Boolean = runCatching {
        execute(
            listOf(gitExecutable, "--git-dir", gitDirectory.absolutePath) + arguments,
            timeoutSeconds = 8,
        ).code == 0
    }.getOrDefault(false)

    private fun findGitExecutable(): String {
        val programFiles = System.getenv("ProgramFiles")?.let(::File)
        val programFilesX86 = System.getenv("ProgramFiles(x86)")?.let(::File)
        val localAppData = System.getenv("LOCALAPPDATA")?.let(::File)
        val candidates = listOfNotNull(
            System.getenv("GIT_EXECUTABLE"),
            programFiles?.resolve("Git/cmd/git.exe")?.absolutePath,
            programFilesX86?.resolve("Git/cmd/git.exe")?.absolutePath,
            localAppData?.resolve("Programs/Git/cmd/git.exe")?.absolutePath,
            "git",
        ).distinct()
        return candidates.firstOrNull { candidate ->
            runCatching { execute(listOf(candidate, "--version"), timeoutSeconds = 5).code == 0 }.getOrDefault(false)
        } ?: error("Git executable was not found; OpenCode snapshot diffs require Git")
    }

    private fun execute(command: List<String>, timeoutSeconds: Long = 30): GitResult {
        val process = ProcessBuilder(command)
            .redirectInput(ProcessBuilder.Redirect.PIPE)
            .start()
        process.outputStream.close()
        val stdoutFuture = CompletableFuture.supplyAsync { process.inputStream.readBytes() }
        val stderrFuture = CompletableFuture.supplyAsync { process.errorStream.readBytes() }
        if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            error("Git command timed out")
        }
        val stdout = stdoutFuture.get(5, TimeUnit.SECONDS)
        val stderr = stderrFuture.get(5, TimeUnit.SECONDS)
        return GitResult(
            code = process.exitValue(),
            stderr = String(stderr, StandardCharsets.UTF_8).trim(),
            stdout = String(stdout, StandardCharsets.UTF_8),
        )
    }
}
