package com.aicoding.plugin.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManagerListener
import com.intellij.openapi.diagnostic.Logger
import com.aicoding.plugin.services.OpenCodeServiceManager

class ProjectCleanupListener : ProjectManagerListener {
    companion object {
        private val LOG = Logger.getInstance(ProjectCleanupListener::class.java)
    }

    override fun projectOpened(project: Project) {
        LOG.info("Project opened: ${project.name}")
        try {
            val service = project.getService(OpenCodeServiceManager::class.java)
            if (service != null) {
                LOG.info("Incrementing OpenCode service project count for project: ${project.name}")
                service.incrementProjectCount()
            } else {
                LOG.info("OpenCodeServiceManager not found for project: ${project.name}")
            }
        } catch (e: Exception) {
            LOG.error("Error incrementing OpenCode service project count for project ${project.name}", e)
        }
    }

    override fun projectClosing(project: Project) {
        LOG.info("Project closing: ${project.name}")
        // 注释掉关闭OpenCode服务的代码，项目退出后不需要关闭服务
        // try {
        //     val service = project.getService(OpenCodeServiceManager::class.java)
        //     if (service != null) {
        //         LOG.info("Stopping OpenCode service for project: ${project.name}")
        //         service.stopService()
        //     } else {
        //         LOG.info("OpenCodeServiceManager not found for project: ${project.name}")
        //     }
        // } catch (e: Exception) {
        //     LOG.error("Error stopping OpenCode service for project ${project.name}", e)
        // }
        
        // Also trigger JNA cleanup when project closes (clean files older than 1 hour) in background thread (disabled)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val jnaCleanupService = ApplicationManager.getApplication().getService(JNACleanupService::class.java)
                if (jnaCleanupService != null) {
                    LOG.info("JNA cleanup disabled on project close: ${project.name}")
                    // jnaCleanupService.cleanupNow(1) // Clean files older than 1 hour (disabled)
                }
            } catch (e: Exception) {
                LOG.error("Error triggering JNA cleanup for project ${project.name}", e)
            }
        }
    }

    override fun projectClosed(project: Project) {
        LOG.info("Project closed: ${project.name}")
    }
}