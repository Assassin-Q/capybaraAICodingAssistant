package com.aicoding.plugin.ui

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.wm.IdeFocusManager
import java.awt.Component

@Service(Service.Level.PROJECT)
class EditorManager(private val project: Project) {
    private val handlers = mutableMapOf<com.intellij.openapi.editor.Editor, SelectionPopupHandler>()
    
    fun install() {
        val settings = project.service<com.aicoding.plugin.services.AICodingSettingsService>()
        if (!settings.enableSelectionPopup) return
        
        val editorFactory = com.intellij.openapi.editor.EditorFactory.getInstance()
        val editors = editorFactory.allEditors.filter { it.project == project }
        
        editors.forEach { editor ->
            installHandler(editor)
        }
        
        editorFactory.addEditorFactoryListener(object : EditorFactoryListener {
            override fun editorCreated(event: EditorFactoryEvent) {
                if (event.editor.project == project) {
                    installHandler(event.editor)
                }
            }
            
            override fun editorReleased(event: EditorFactoryEvent) {
                if (event.editor.project == project) {
                    uninstallHandler(event.editor)
                }
            }
        }, project)
        
        println("EditorManager installed for project: ${project.name}")
    }
    
    fun uninstall() {
        handlers.values.forEach { handler ->
            handler.uninstall()
        }
        handlers.clear()
        println("EditorManager uninstalled for project: ${project.name}")
    }
    
    fun refresh() {
        uninstall()
        install()
    }
    
    private fun installHandler(editor: com.intellij.openapi.editor.Editor) {
        if (handlers.containsKey(editor)) return
        
        val handler = SelectionPopupHandler(project, editor)
        handler.install()
        handlers[editor] = handler
    }
    
    private fun uninstallHandler(editor: com.intellij.openapi.editor.Editor) {
        val handler = handlers.remove(editor)
        handler?.uninstall()
    }
    
    fun getHandler(editor: com.intellij.openapi.editor.Editor): SelectionPopupHandler? {
        return handlers[editor]
    }
    
    fun showPopupForCurrentEditor() {
        val editorFactory = com.intellij.openapi.editor.EditorFactory.getInstance()
        val focusManager = IdeFocusManager.getInstance(project)
        
        val focusedComponent = focusManager.focusOwner
        var editor: com.intellij.openapi.editor.Editor? = null
        
        if (focusedComponent != null) {
            val allEditors = editorFactory.allEditors.toList()
            editor = allEditors.firstOrNull { ed ->
                ed.contentComponent == focusedComponent || 
                ed.component.isAncestorOf(focusedComponent)
            }
        }
        
        if (editor == null) {
            val editors = editorFactory.allEditors.filter { it.project == project }.toList()
            editor = editors.firstOrNull()
        }
        
        if (editor != null) {
            val handler = getHandler(editor)
            handler?.showPopupFromShortcut()
        }
    }
}

class EditorManagerStartupActivity : StartupActivity {
    override fun runActivity(project: Project) {
        val settings = project.service<com.aicoding.plugin.services.AICodingSettingsService>()
        if (settings.enableSelectionPopup) {
            project.service<EditorManager>().install()
        }
    }
}