package com.aicoding.plugin.services

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.BasicFileAttributes
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Service for cleaning up JNA temporary files left by OpenCode's Java language server (jdtls).
 * 
 * These files are typically created in the system temp directory and may not be cleaned up
 * properly when the service exits abnormally.
 * 
 * Pattern examples:
 * - jna-*.dll (JNA native library extraction on Windows)
 * - jna-*.so (JNA native library extraction on Linux)
 * - jna-*.dylib (JNA native library extraction on macOS)
 * - *-00000000.dll (JNA loading failure residues on Windows)
 * - *-00000000.so (JNA loading failure residues on Linux)
 * - *-00000000.dylib (JNA loading failure residues on macOS)
 */
@Service(Service.Level.APP)
class JNACleanupService : Disposable {
    companion object {
        private val LOG = Logger.getInstance(JNACleanupService::class.java)
        
        // Platform-specific JNA file patterns to clean up
        private fun getPlatformPatterns(): List<String> {
            val osName = System.getProperty("os.name", "").lowercase()
            return when {
                osName.contains("win") -> listOf(
                    "jna-*.dll",
                    "*-00000000.dll"
                )
                osName.contains("linux") || osName.contains("unix") -> listOf(
                    "jna-*.so",
                    "*-00000000.so"
                )
                osName.contains("mac") -> listOf(
                    "jna-*.dylib",
                    "*-00000000.dylib"
                )
                else -> emptyList() // Unknown OS, no patterns
            }
        }
        
        // Default retention period: 24 hours
        private val DEFAULT_RETENTION_HOURS = 24L
        
        // Cleanup interval: 24 hours
        private val CLEANUP_INTERVAL_HOURS = 24L
        
        // Maximum number of files to process in one cleanup run (to avoid excessive processing time)
        private const val MAX_FILES_TO_PROCESS = 1000
        
        // Maximum processing time in milliseconds (2 minutes)
        private const val MAX_PROCESSING_TIME_MS = 2 * 60 * 1000L
    }
    
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private var initialized = false
    
    init {
        try {
            // JNA cleanup disabled due to performance issues
            // scheduler.scheduleAtFixedRate(
            //     ::cleanupOldFiles,
            //     10, // initial delay in minutes (increased to avoid startup impact)
            //     CLEANUP_INTERVAL_HOURS * 60, // period in minutes (24 hours)
            //     TimeUnit.MINUTES
            // )
            initialized = true
            LOG.info("JNACleanupService initialized (cleanup disabled due to performance issues)")
        } catch (e: Exception) {
            LOG.error("Failed to initialize JNACleanupService", e)
        }
    }
    
    /**
     * Clean up old JNA temporary files.
     * 
     * @param retentionHours Only delete files older than this many hours.
     *                       Default is 24 hours to avoid affecting running processes.
     */
    fun cleanupOldFiles(retentionHours: Long = DEFAULT_RETENTION_HOURS) {
        LOG.info("JNA cleanup disabled (was called with retentionHours=$retentionHours)")
        // Cleanup disabled due to performance issues
        /* 
        // Ensure we're not running on UI thread
        if (com.intellij.openapi.application.ApplicationManager.getApplication().isDispatchThread) {
            LOG.warn("JNA cleanup attempted on UI thread, moving to background")
            com.intellij.openapi.application.ApplicationManager.getApplication().executeOnPooledThread {
                cleanupOldFiles(retentionHours)
            }
            return
        }
        
        val tempDir = getTempDirectory()
        if (tempDir == null || !tempDir.exists() || !tempDir.isDirectory) {
            LOG.warn("Temp directory not found or inaccessible: $tempDir")
            return
        }
        
        LOG.debug("Starting JNA cleanup in directory: $tempDir")
        
        val cutoffTime = Instant.now().minus(Duration.ofHours(retentionHours))
        var totalDeleted = 0
        var totalErrors = 0
        var totalProcessed = 0
        val startTime = System.currentTimeMillis()
        
        try {
            val patterns = getPlatformPatterns()
            if (patterns.isEmpty()) {
                LOG.debug("No cleanup patterns defined for this platform")
                return
            }
            
            for (pattern in patterns) {
                // Check if we've exceeded limits before processing next pattern
                if (totalProcessed >= MAX_FILES_TO_PROCESS) {
                    LOG.info("Reached maximum file processing limit ($MAX_FILES_TO_PROCESS), stopping cleanup")
                    break
                }
                
                if (System.currentTimeMillis() - startTime > MAX_PROCESSING_TIME_MS) {
                    LOG.info("Exceeded maximum processing time ($MAX_PROCESSING_TIME_MS ms), stopping cleanup")
                    break
                }
                
                val files = findFilesByPattern(tempDir, pattern)
                LOG.debug("Found ${files.size} files matching pattern: $pattern")
                
                // Process files in smaller batches to avoid hogging CPU/IO
                val BATCH_SIZE = 100
                for ((index, file) in files.withIndex()) {
                    // Check limits for each file
                    totalProcessed++
                    if (totalProcessed > MAX_FILES_TO_PROCESS) {
                        LOG.info("Reached maximum file processing limit ($MAX_FILES_TO_PROCESS), stopping cleanup")
                        break
                    }
                    
                    if (System.currentTimeMillis() - startTime > MAX_PROCESSING_TIME_MS) {
                        LOG.info("Exceeded maximum processing time ($MAX_PROCESSING_TIME_MS ms), stopping cleanup")
                        break
                    }
                    
                    try {
                        if (shouldDeleteFile(file, cutoffTime)) {
                            deleteFileOrDirectory(file)
                            totalDeleted++
                            LOG.debug("Deleted: ${file.name}")
                        }
                    } catch (e: Exception) {
                        totalErrors++
                        LOG.warn("Failed to delete file: ${file.absolutePath}", e)
                    }
                    
                    // Yield after each batch to avoid hogging resources
                    if (index > 0 && index % BATCH_SIZE == 0) {
                        try {
                            Thread.sleep(10) // Small delay to yield CPU/IO
                        } catch (e: InterruptedException) {
                            Thread.currentThread().interrupt()
                            break
                        }
                    }
                }
            }
            
            val elapsedTime = System.currentTimeMillis() - startTime
            LOG.info("JNA cleanup completed: deleted $totalDeleted files, $totalErrors errors, " +
                    "processed $totalProcessed files in ${elapsedTime}ms")
        } catch (e: Exception) {
            LOG.error("Error during JNA cleanup", e)
        }
        */
    }
    
    /**
     * Get the system temporary directory.
     */
    private fun getTempDirectory(): File? {
        return try {
            val tempPath = System.getProperty("java.io.tmpdir")
            if (tempPath.isNullOrEmpty()) {
                // Fallback to environment variable on Windows
                val envTemp = System.getenv("TEMP") ?: System.getenv("TMP")
                if (!envTemp.isNullOrEmpty()) {
                    File(envTemp)
                } else {
                    LOG.warn("Could not determine temp directory path")
                    null
                }
            } else {
                File(tempPath)
            }
        } catch (e: Exception) {
            LOG.warn("Failed to get temp directory", e)
            null
        }
    }
    
    /**
     * Find files matching a pattern in a directory (non-recursive for performance).
     * Uses streaming directory listing to handle large directories efficiently.
     */
    private fun findFilesByPattern(directory: File, pattern: String): List<File> {
        return try {
            if (!directory.exists() || !directory.isDirectory) {
                return emptyList()
            }
            
            val matchingFiles = mutableListOf<File>()
            val stream = Files.newDirectoryStream(directory.toPath())
            
            try {
                for (path in stream) {
                    val file = path.toFile()
                    
                    // Check if file matches pattern
                    val matches = when {
                        pattern == "jna-*.dll" -> file.name.startsWith("jna-") && file.name.endsWith(".dll")
                        pattern == "jna-*.so" -> file.name.startsWith("jna-") && file.name.endsWith(".so")
                        pattern == "jna-*.dylib" -> file.name.startsWith("jna-") && file.name.endsWith(".dylib")
                        pattern == "*-00000000.dll" -> file.name.endsWith("-00000000.dll")
                        pattern == "*-00000000.so" -> file.name.endsWith("-00000000.so")
                        pattern == "*-00000000.dylib" -> file.name.endsWith("-00000000.dylib")
                        else -> false // Unknown pattern, should not happen
                    }
                    
                    if (matches) {
                        matchingFiles.add(file)
                    }
                }
            } finally {
                stream.close()
            }
            
            matchingFiles
        } catch (e: Exception) {
            LOG.warn("Failed to list files in directory: $directory", e)
            emptyList()
        }
    }
    

    
    /**
     * Determine if a file should be deleted based on its age.
     */
    private fun shouldDeleteFile(file: File, cutoffTime: Instant): Boolean {
        return try {
            val attributes = Files.readAttributes(file.toPath(), BasicFileAttributes::class.java)
            val fileTime = attributes.creationTime().toInstant()
            fileTime.isBefore(cutoffTime)
        } catch (e: Exception) {
            // If we can't read attributes, use last modified time
            val lastModified = Instant.ofEpochMilli(file.lastModified())
            lastModified.isBefore(cutoffTime)
        }
    }
    
    /**
     * Delete a file or directory recursively.
     */
    private fun deleteFileOrDirectory(file: File) {
        if (file.isDirectory) {
            val contents = file.listFiles()
            if (contents != null) {
                for (child in contents) {
                    deleteFileOrDirectory(child)
                }
            }
        }
        
        try {
            Files.delete(file.toPath())
        } catch (e: Exception) {
            // Try to mark for deletion on exit as a fallback
            file.deleteOnExit()
            LOG.warn("Failed to delete file: ${file.absolutePath}, error: ${e.message}")
            // Don't rethrow to allow continuing with other files
        }
    }
    
    /**
     * Manually trigger cleanup with custom retention period.
     * Default retention is 1 hour to avoid deleting files that might be in use.
     */
    fun cleanupNow(retentionHours: Long = 1) {
        LOG.info("Manual JNA cleanup triggered with retention: $retentionHours hours")
        cleanupOldFiles(retentionHours)
    }
    
    override fun dispose() {
        try {
            if (initialized) {
                scheduler.shutdown()
                if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow()
                }
                LOG.info("JNACleanupService disposed")
            }
        } catch (e: Exception) {
            LOG.error("Error disposing JNACleanupService", e)
        }
    }
}