package com.aicoding.plugin.services

import java.io.File

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
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/opt/local/bin",
        ".opencode/bin",
        ".bun/bin",
        ".local/bin",
        ".local/share/opencode/bin",
        ".npm-global/bin",
        ".nvm/versions/node/current/bin",
        ".volta/bin",
        ".yarn/bin",
        ".cargo/bin",
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
        val result = BoundedProcessRunner.run(listOf("where.exe", command), timeoutMillis = 5_000, maxOutputBytes = 64 * 1024)
        if (result.timedOut) emptyList()
        else result.output.toString(Charsets.UTF_8).lineSequence().map(String::trim).filter { it.isNotBlank() }.toList()
    }.getOrDefault(emptyList())

    private fun whichUnix(command: String): List<String> {
        val found = linkedSetOf<String>()
        val shell = System.getenv("SHELL")?.takeIf { File(it).canExecute() } ?: "/bin/sh"

        /**
         * Three shell modes, because none of them alone is enough.
         *
         * `-lic` comes first: zsh — the macOS default — reads `.zprofile` and `.zlogin` for a login
         * shell but only reads `.zshrc` when the shell is *interactive*, and `.zshrc` is where most
         * people actually set PATH. A login-only shell therefore misses exactly the tools the user
         * can run in Terminal. `-lc` follows for shells that do the opposite, and `-c` last for the
         * case where a noisy rc file makes the other two fail.
         */
        listOf(listOf("-lic"), listOf("-lc"), listOf("-c")).forEach { flags ->
            if (found.isNotEmpty()) return@forEach
            runCatching {
                val result = BoundedProcessRunner.run(
                    listOf(shell) + flags + "command -v $command",
                    timeoutMillis = 8_000,
                    maxOutputBytes = 64 * 1024,
                )
                if (result.timedOut) return@runCatching
                // Interactive shells print prompts and banners; only absolute paths are of interest.
                result.output.toString(Charsets.UTF_8).lineSequence().map(String::trim)
                    .filter { it.startsWith("/") && File(it).isFile }
                    .forEach(found::add)
            }
        }

        UNIX_FALLBACK_DIRECTORIES.forEach { directory ->
            val base = if (directory.startsWith("/")) File(directory) else File(home, directory)
            val candidate = File(base, command)
            if (candidate.isFile && candidate.canExecute()) found.add(candidate.absolutePath)
        }

        // Swallowing this was a mistake: when the lookup failed the log said nothing at all, so a
        // Mac reporting "command not found" gave no way to tell which paths had been tried.
        println("Capybara: lookup '$command' via $shell -> ${if (found.isEmpty()) "(none)" else found.joinToString()}")
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
