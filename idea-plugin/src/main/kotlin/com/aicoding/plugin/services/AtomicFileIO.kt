package com.aicoding.plugin.services

import java.nio.charset.Charset
import java.nio.charset.StandardCharsets
import java.nio.channels.FileChannel
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Coordinates read-modify-write operations across threads, projects and IDEA processes. */
object AtomicFileIO {
    private val processLocks = ConcurrentHashMap<Path, ReentrantLock>()

    fun <T> withLock(path: Path, action: () -> T): T {
        val normalized = path.toAbsolutePath().normalize()
        val processLock = processLocks.computeIfAbsent(normalized) { ReentrantLock() }
        return processLock.withLock {
            val lockFile = lockFileFor(normalized)
            Files.createDirectories(lockFile.parent)
            FileChannel.open(lockFile, StandardOpenOption.CREATE, StandardOpenOption.WRITE).use { channel ->
                channel.lock().use { action() }
            }
        }
    }

    fun writeString(path: Path, content: String, charset: Charset = StandardCharsets.UTF_8) {
        val normalized = path.toAbsolutePath().normalize()
        Files.createDirectories(normalized.parent)
        val temporary = Files.createTempFile(normalized.parent, ".${normalized.fileName}.", ".tmp")
        try {
            Files.writeString(temporary, content, charset)
            try {
                Files.move(
                    temporary,
                    normalized,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temporary, normalized, StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            Files.deleteIfExists(temporary)
        }
    }

    private fun lockFileFor(path: Path): Path {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(path.toString().toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
        return Path.of(System.getProperty("java.io.tmpdir"), "capybara-file-locks", "$digest.lock")
    }
}
