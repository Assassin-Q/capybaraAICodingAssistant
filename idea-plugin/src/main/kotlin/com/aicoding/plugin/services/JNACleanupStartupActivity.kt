package com.aicoding.plugin.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.startup.StartupActivity

/**
 * Startup activity that initializes the JNA cleanup service on IDE startup.
 * This ensures the periodic cleanup scheduler is started.
 */
class JNACleanupStartupActivity : StartupActivity {
    companion object {
        private val LOG = Logger.getInstance(JNACleanupStartupActivity::class.java)
    }
    
    override fun runActivity(project: com.intellij.openapi.project.Project) {
        // Get the application-level service to initialize it
        val cleanupService = ApplicationManager.getApplication().getService(JNACleanupService::class.java)
        
        // Schedule cleanup with delay to avoid impacting IDE startup (disabled)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // Wait 30 seconds to allow IDE to fully initialize
                Thread.sleep(30000)
                
                // JNA cleanup disabled due to performance issues
                // cleanupService.cleanupNow()
                LOG.debug("JNA cleanup service initialized on IDE startup (cleanup disabled)")
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                LOG.info("JNA startup cleanup interrupted")
            } catch (e: Exception) {
                LOG.error("Background JNA cleanup failed on startup", e)
            }
        }
        
        // Log minimal info to reduce startup overhead
        LOG.debug("JNA cleanup service initialization scheduled on IDE startup (cleanup disabled)")
    }
}