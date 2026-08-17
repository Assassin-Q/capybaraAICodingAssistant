package com.aicoding.plugin.services

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

data class CapturedProcess(
    val exitCode: Int,
    val output: ByteArray,
    val timedOut: Boolean,
)

/** Runs a short-lived command without letting output reads bypass the timeout. */
object BoundedProcessRunner {
    fun run(
        command: List<String>,
        directory: File? = null,
        timeoutMillis: Long,
        maxOutputBytes: Int = 1_048_576,
    ): CapturedProcess {
        require(command.isNotEmpty()) { "Command cannot be empty" }
        require(timeoutMillis > 0) { "Timeout must be positive" }
        require(maxOutputBytes > 0) { "Output limit must be positive" }

        val process = ProcessBuilder(command)
            .directory(directory)
            .redirectErrorStream(true)
            .start()
        runCatching { process.outputStream.close() }
        val outputFuture = CompletableFuture.supplyAsync {
            process.inputStream.use { readBounded(it, maxOutputBytes) }
        }
        val completed = process.waitFor(timeoutMillis, TimeUnit.MILLISECONDS)
        if (!completed) {
            process.destroy()
            if (!process.waitFor(500, TimeUnit.MILLISECONDS)) process.destroyForcibly()
            process.waitFor(2, TimeUnit.SECONDS)
        }
        val output = runCatching { outputFuture.get(2, TimeUnit.SECONDS) }
            .getOrElse {
                runCatching { process.inputStream.close() }
                outputFuture.cancel(true)
                byteArrayOf()
            }
        return CapturedProcess(
            exitCode = if (completed) process.exitValue() else -1,
            output = output,
            timedOut = !completed,
        )
    }

    private fun readBounded(input: InputStream, limit: Int): ByteArray {
        val output = ByteArrayOutputStream(minOf(limit, 64 * 1024))
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var retained = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            val writable = minOf(count, limit - retained)
            if (writable > 0) {
                output.write(buffer, 0, writable)
                retained += writable
            }
        }
        return output.toByteArray()
    }
}
