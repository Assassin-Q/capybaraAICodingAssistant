package com.aicoding.plugin.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefClient
import org.cef.CefSettings
import com.aicoding.plugin.server.HttpServerManager
import java.awt.BorderLayout
import javax.swing.JPanel

class AICodingPanel(private val project: Project, private val toolWindow: ToolWindow) : JPanel(BorderLayout()), Disposable {
    private val browser: JBCefBrowser
    private val httpServer: HttpServerManager

    init {
        // 尝试配置 JCEF 以支持 Monaco Editor 的 Web Worker
        try {
            val jbCefApp = JBCefApp.getInstance()
            // 尝试添加命令行开关（方法名可能不同，尝试常见变体）
            val method = jbCefApp.javaClass.methods.find { it.name.contains("CommandLineSwitch") }
            if (method != null) {
                // 尝试调用添加开关的方法
                val switches = listOf(
                    "--disable-web-security",
                    "--allow-file-access-from-files",
                    "--allow-file-access",
                    "--disable-site-isolation-trials"
                )
                for (switch in switches) {
                    try {
                        method.invoke(jbCefApp, switch)
                        println("Added JCEF command line switch: $switch")
                    } catch (e: Exception) {
                        // 忽略单个开关添加失败
                    }
                }
                println("JCEF command line switches configured for Monaco Editor Worker support")
            } else {
                println("Warning: Could not find JCEF command line switch method")
            }
        } catch (e: Exception) {
            println("Warning: Could not configure JCEF settings: ${e.message}")
        }
        
        // 创建并配置 JBCefBrowser 以启用 IME 支持
        val browserBuilder = JBCefBrowser.createBuilder()
        // 禁用离屏渲染可能有助于 IME（中文输入法）
        browserBuilder.setOffScreenRendering(false)
        
        browser = browserBuilder.build()
        
        // 创建 HttpServerManager，它会管理 OpenCodeServiceManager
        httpServer = HttpServerManager(project)
        
        add(browser.component, BorderLayout.CENTER)
        startServer()
        
        // 注册为 Disposable，确保项目关闭时清理资源
        Disposer.register(project, this)
    }

    private fun startServer() {
        // Get project path
        val projectPath = project.basePath
        if (projectPath != null) {
            println("Project path: $projectPath")
            httpServer.setProjectPath(projectPath)
        } else {
            println("Warning: Project path is null")
        }
        
        // 启动 HTTP 服务器（它会自动启动 OpenCode 服务）
        httpServer.start()
        val url = "http://localhost:${httpServer.getPort()}"
        println("Loading frontend from: $url")
        browser.loadURL(url)
    }

    override fun dispose() {
        println("AICodingPanel disposing...")
        try {
            browser.dispose()
        } catch (e: Exception) {
            println("Error disposing browser: ${e.message}")
        }
        try {
            httpServer.stop()
        } catch (e: Exception) {
            println("Error stopping HTTP server: ${e.message}")
        }
        println("AICodingPanel disposed successfully")
    }
}