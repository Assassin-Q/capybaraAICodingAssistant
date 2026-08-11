package com.aicoding.plugin.services

import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Finds command-line tools on whichever platform the IDE is running on.
 *
 * Two things make this harder than `which`:
 *
 *  1. The lookup itself is platform-specific. `where.exe` exists only on Windows, and asking for
 *     it on macOS throws — which is how a Mac with a perfectly working `opencode` ended up being
 *     told no service could be found.
 *  2. On macOS an IDE launched from Finder or the Dock inherits launchd's minimal PATH, not the
 *     one the user's shell builds. `/opt/homebrew/bin`, `/usr/local/bin` and `~/.opencode/bin` are
 *     all absent from it, so a plain `which` fails for tools the user can run in Terminal. The
 *     lookup therefore goes through a login shell, and falls back to the directories installers
 *     actually use.
 */
object ExecutableLookup {
    val isWindows: Boolean = System.getProperty("os.name").orEmpty().startsWith("Windows", ignoreCase = true)

    private val home: File get() = File(System.getProperty("user.home"))

    /** Directories installers use that a GUI-launched IDE will not have on its PATH. */
    private val UNIX_FALLBACK_DIRECTORIES = listOf(
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        ".opencode/bin",
        ".bun/bin",
        ".local/bin",
        ".npm-global/bin",
        "node_modules/.bin",
    )

    /**
     * Absolute paths for [command], best first. Empty when nothing matches.
     *
     * The Windows and Unix branches deliberately do not share a code path: `where` prints every
     * match on its own line, `command -v` prints one, and only the Unix side needs the login shell.
     */
    fun which(command: String): List<String> = if (isWindows) whereWindows(command) else whichUnix(command)

    private fun whereWindows(command: String): List<String> = runCatching {
        val process = ProcessBuilder("where.exe", command).redirectErrorStream(true).start()
        val lines = process.inputStream.bufferedReader().readLines()
        process.waitFor(5, TimeUnit.SECONDS)
        lines.map(String::trim).filter { it.isNotBlank() }
    }.getOrDefault(emptyList())

    private fun whichUnix(command: String): List<String> {
        val found = linkedSetOf<String>()

        // A login shell so the user's profile PATH applies. `command -v` is POSIX; `which` is not
        // guaranteed to exist and behaves differently across shells.
        val shell = System.getenv("SHELL")?.takeIf { File(it).canExecute() } ?: "/bin/sh"
        runCatching {
            val process = ProcessBuilder(shell, "-lc", "command -v $command")
                .redirectErrorStream(true)
                .start()
            val lines = process.inputStream.bufferedReader().readLines()
            process.waitFor(8, TimeUnit.SECONDS)
            lines.map(String::trim).filter { it.startsWith("/") }.forEach(found::add)
        }

        UNIX_FALLBACK_DIRECTORIES.forEach { directory ->
            val base = if (directory.startsWith("/")) File(directory) else File(home, directory)
            val candidate = File(base, command)
            if (candidate.isFile && candidate.canExecute()) found.add(candidate.absolutePath)
        }

        return found.toList()
    }

    /** The first [names] entry that resolves to an executable file, or null. */
    fun resolve(vararg names: String): String? = names
        .asSequence()
        .flatMap { which(it).asSequence() }
        .firstOrNull { File(it).isFile }

    /**
     * Wraps [executable] so the OS can actually run it.
     *
     * Only Windows needs this: `.cmd` and `.bat` are interpreted by the shell rather than executed,
     * and `.ps1` needs PowerShell. On Unix an executable file is run directly, and routing it
     * through `cmd.exe` would fail outright.
     */
    fun buildCommand(executable: String, args: List<String>): List<String> = when {
        !isWindows -> listOf(executable) + args

        executable.endsWith(".cmd", true) || executable.endsWith(".bat", true) -> {
            val commandLine = (listOf(executable) + args).joinToString(" ") { quote(it) }
            listOf("cmd.exe", "/d", "/s", "/c", commandLine)
        }

        executable.endsWith(".ps1", true) ->
            listOf("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executable) + args

        else -> listOf(executable) + args
    }

    private fun quote(value: String): String = if (value.contains(' ')) "\"$value\"" else value
}
