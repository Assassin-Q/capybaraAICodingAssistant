package com.aicoding.plugin.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.*
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.Alarm
import com.intellij.util.ui.JBUI
import com.aicoding.plugin.services.AICodingSettingsService
import com.aicoding.plugin.services.AIContextService
import com.aicoding.plugin.services.AIAsyncManager
import com.aicoding.plugin.services.MessageService
import com.aicoding.plugin.services.PopupResponse
import com.aicoding.plugin.services.CodeContext
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.event.*
import javax.swing.*

class SelectionPopupHandler(private val project: Project, private val editor: Editor) {
    private val settings = project.service<AICodingSettingsService>()
    private val contextService = project.service<AIContextService>()
    private val asyncManager = ApplicationManager.getApplication().service<AIAsyncManager>()
    private val messageService = project.service<MessageService>()
    
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, project)
    private var currentPopup: JBPopup? = null
    private var iconPopup: JBPopup? = null
    private var isPopupVisible = false
    
    private val editorListener = object : SelectionListener {
        override fun selectionChanged(e: SelectionEvent) {
            handleSelectionChange()
        }
    }
    
    private val documentListener = object : DocumentListener {
        override fun documentChanged(event: DocumentEvent) {
            // 文档变化时关闭悬浮图标
            hideIconPopup()
        }
    }
    
    fun install() {
        if (!settings.enableSelectionPopup) return
        
        editor.selectionModel.addSelectionListener(editorListener)
        editor.document.addDocumentListener(documentListener)
        
        // 安装快捷键监听
        installShortcutListener()
        
        println("SelectionPopupHandler installed for editor")
    }
    
    fun uninstall() {
        editor.selectionModel.removeSelectionListener(editorListener)
        editor.document.removeDocumentListener(documentListener)
        alarm.cancelAllRequests()
        hideIconPopup()
        hidePopup()
    }
    
    private fun installShortcutListener() {
        val focusManager = IdeFocusManager.getInstance(project)
        val disposable = Disposer.newDisposable()
        
        val listener = object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_A && 
                    e.isControlDown && e.isShiftDown && 
                    !e.isAltDown && !e.isMetaDown) {
                    e.consume()
                    showPopupFromShortcut()
                }
            }
        }
        
        editor.contentComponent.addKeyListener(listener)
        Disposer.register(disposable) {
            editor.contentComponent.removeKeyListener(listener)
        }
    }
    
    private fun handleSelectionChange() {
        val selectionModel = editor.selectionModel
        val hasSelection = selectionModel.hasSelection()
        
        if (!hasSelection) {
            hideIconPopup()
            return
        }
        
        val selectedText = selectionModel.selectedText ?: return
        if (selectedText.isBlank()) {
            hideIconPopup()
            return
        }
        
        // 延迟显示图标，避免频繁闪烁
        alarm.cancelAllRequests()
        alarm.addRequest({
            ApplicationManager.getApplication().runReadAction {
                if (editor.isDisposed || !editor.selectionModel.hasSelection()) return@runReadAction
                
                showIconPopup()
            }
        }, settings.popupTriggerDelay)
    }
    
    private fun showIconPopup() {
        if (isPopupVisible || iconPopup != null) return
        
        ApplicationManager.getApplication().runReadAction {
            if (editor.isDisposed) return@runReadAction
            
            val selectionModel = editor.selectionModel
            if (!selectionModel.hasSelection()) return@runReadAction
            
            val selectionStart = selectionModel.selectionStart
            if (selectionStart < 0 || selectionStart >= editor.document.textLength) return@runReadAction
            
            try {
                val visualPosition = editor.offsetToVisualPosition(selectionStart)
                val point = editor.visualPositionToXY(visualPosition)
                
                val iconLabel = JLabel("🤖")
                iconLabel.toolTipText = "点击获取AI建议 (Ctrl+Shift+A)"
                iconLabel.font = JBUI.Fonts.label(14f)
            
            iconLabel.addMouseListener(object : MouseAdapter() {
                override fun mouseClicked(e: MouseEvent) {
                    showPopup()
                }
                
                override fun mouseEntered(e: MouseEvent) {
                    iconLabel.foreground = JBUI.CurrentTheme.Link.linkColor()
                }
                
                override fun mouseExited(e: MouseEvent) {
                    iconLabel.foreground = null
                }
            })
            
                ApplicationManager.getApplication().invokeLater {
                    iconPopup = JBPopupFactory.getInstance().createComponentPopupBuilder(iconLabel, null)
                        .setRequestFocus(false)
                        .setCancelOnClickOutside(true)
                        .setCancelOnOtherWindowOpen(true)
                        .setCancelKeyEnabled(true)
                        .createPopup()
                    
                    val location = RelativePoint(editor.contentComponent, point)
                    iconPopup?.show(location)
                }
            } catch (e: Exception) {
                println("Failed to show icon popup: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    private fun hideIconPopup() {
        iconPopup?.cancel()
        iconPopup = null
    }
    
    fun showPopupFromShortcut() {
        val selectionModel = editor.selectionModel
        if (!selectionModel.hasSelection()) {
            // 如果没有选择文本，选择当前行
            val caretModel = editor.caretModel
            val lineNumber = caretModel.logicalPosition.line
            val lineStart = editor.document.getLineStartOffset(lineNumber)
            val lineEnd = editor.document.getLineEndOffset(lineNumber)
            selectionModel.setSelection(lineStart, lineEnd)
        }
        
        showPopup()
    }
    
    private fun showPopup() {
        hideIconPopup()
        
        val selectionModel = editor.selectionModel
        val selectedText = selectionModel.selectedText ?: return
        
        // 提取上下文
        val context = contextService.extractContext(project, editor, selectedText)
        
        // 创建弹出对话框
        val panel = JPanel(BorderLayout())
        panel.border = JBUI.Borders.empty(10)
        panel.preferredSize = Dimension(600, 500)
        
        // 标题
        val titleLabel = JLabel("AI 代码助手")
        titleLabel.font = JBUI.Fonts.label(16f)
        titleLabel.border = JBUI.Borders.emptyBottom(10)
        panel.add(titleLabel, BorderLayout.NORTH)
        
        // 中央面板
        val centerPanel = JPanel(BorderLayout())
        centerPanel.border = JBUI.Borders.empty(5)
        
        // 主内容面板（使用垂直Box布局）
        val contentPanel = JPanel()
        contentPanel.layout = BoxLayout(contentPanel, BoxLayout.Y_AXIS)
        
        // 选中代码显示区域
        val selectedCodeLabel = JLabel("选中代码:")
        selectedCodeLabel.alignmentX = JLabel.LEFT_ALIGNMENT
        
        val selectedCodeArea = JBTextArea(selectedText)
        selectedCodeArea.isEditable = false
        selectedCodeArea.lineWrap = true
        selectedCodeArea.wrapStyleWord = true
        selectedCodeArea.rows = 5
        val selectedCodeScrollPane = JScrollPane(selectedCodeArea)
        selectedCodeScrollPane.alignmentX = JScrollPane.LEFT_ALIGNMENT
        selectedCodeScrollPane.border = JBUI.Borders.empty(5)
        
        // 指令输入
        val instructionLabel = JLabel("指令:")
        instructionLabel.alignmentX = JLabel.LEFT_ALIGNMENT
        
        val instructionField = JBTextField()
        instructionField.toolTipText = "输入AI指令，如：优化性能、添加注释、重构函数等"
        instructionField.alignmentX = JBTextField.LEFT_ALIGNMENT
        
        val instructionPanel = JPanel(BorderLayout(5, 0))
        instructionPanel.add(instructionLabel, BorderLayout.WEST)
        instructionPanel.add(instructionField, BorderLayout.CENTER)
        instructionPanel.alignmentX = JPanel.LEFT_ALIGNMENT
        
        // 常用指令按钮
        val quickActionsPanel = JPanel()
        quickActionsPanel.layout = BoxLayout(quickActionsPanel, BoxLayout.X_AXIS)
        quickActionsPanel.alignmentX = JPanel.LEFT_ALIGNMENT
        
        val quickActions = listOf(
            "优化性能" to "优化这段代码的性能",
            "添加注释" to "为这段代码添加详细注释",
            "重构函数" to "重构这个函数使其更清晰",
            "生成测试" to "为这段代码生成单元测试",
            "解释代码" to "解释这段代码的功能"
        )
        
        quickActions.forEach { (text, instruction) ->
            val button = JButton(text)
            button.addActionListener {
                instructionField.text = instruction
                processAIRequest(selectedText, context, instruction)
            }
            quickActionsPanel.add(button)
            quickActionsPanel.add(Box.createHorizontalStrut(5))
        }
        
        // 结果展示区域
        val resultLabel = JLabel("AI 回复:")
        resultLabel.alignmentX = JLabel.LEFT_ALIGNMENT
        
        val resultArea = JBTextArea()
        resultArea.isEditable = false
        resultArea.lineWrap = true
        resultArea.wrapStyleWord = true
        resultArea.rows = 8
        val resultScrollPane = JScrollPane(resultArea)
        resultScrollPane.alignmentX = JScrollPane.LEFT_ALIGNMENT
        resultScrollPane.border = JBUI.Borders.empty(5)
        
        // 按钮面板
        val buttonPanel = JPanel()
        buttonPanel.alignmentX = JPanel.LEFT_ALIGNMENT
        val sendButton = JButton("发送")
        val cancelButton = JButton("取消")
        
        sendButton.addActionListener {
            val instruction = instructionField.text.trim()
            if (instruction.isNotEmpty()) {
                processAIRequest(selectedText, context, instruction)
            }
        }
        
        cancelButton.addActionListener {
            hidePopup()
        }
        
        buttonPanel.add(sendButton)
        buttonPanel.add(Box.createHorizontalStrut(10))
        buttonPanel.add(cancelButton)
        
        // 组装内容面板
        contentPanel.add(selectedCodeLabel)
        contentPanel.add(Box.createVerticalStrut(5))
        contentPanel.add(selectedCodeScrollPane)
        contentPanel.add(Box.createVerticalStrut(10))
        contentPanel.add(instructionPanel)
        contentPanel.add(Box.createVerticalStrut(5))
        contentPanel.add(quickActionsPanel)
        contentPanel.add(Box.createVerticalStrut(10))
        contentPanel.add(resultLabel)
        contentPanel.add(Box.createVerticalStrut(5))
        contentPanel.add(resultScrollPane)
        contentPanel.add(Box.createVerticalStrut(10))
        contentPanel.add(buttonPanel)
        
        // 将内容面板放入滚动面板（以防内容过多）
        val contentScrollPane = JScrollPane(contentPanel)
        contentScrollPane.border = null
        
        centerPanel.add(contentScrollPane, BorderLayout.CENTER)
        
        panel.add(centerPanel, BorderLayout.CENTER)
        
        // 创建弹出窗口
        currentPopup = JBPopupFactory.getInstance().createComponentPopupBuilder(panel, instructionField)
            .setTitle("AI 代码助手")
            .setResizable(true)
            .setMovable(true)
            .setRequestFocus(true)
            .setCancelOnClickOutside(false)
            .setCancelOnOtherWindowOpen(true)
            .setCancelKeyEnabled(true)
            .setCancelCallback {
                hidePopup()
                true
            }
            .createPopup()
        
        val selectionStart = selectionModel.selectionStart
        val visualPosition = editor.offsetToVisualPosition(selectionStart)
        val point = editor.visualPositionToXY(visualPosition)
        val location = RelativePoint(editor.contentComponent, point)
        
        currentPopup?.show(location)
        isPopupVisible = true
        
        // 设置回车键发送
        instructionField.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER && !e.isShiftDown) {
                    e.consume()
                    sendButton.doClick()
                }
            }
        })
    }
    
    private fun processAIRequest(selectedText: String, context: CodeContext, instruction: String) {
        // 显示处理中状态
        val popup = currentPopup
        if (popup != null) {
            val component = popup.content
            if (component is JPanel) {
                val resultArea = findResultArea(component)
                resultArea?.text = "AI处理中..."
                resultArea?.foreground = JBUI.CurrentTheme.ContextHelp.FOREGROUND
            }
        }
        
        // 异步调用AI服务
        asyncManager.submitPopupTask(selectedText, context.beforeContext + selectedText + context.afterContext, instruction)
            .thenAccept { result ->
                when (result) {
                    is AIAsyncManager.AIAsyncResult.Success -> {
                        val response = result.value
                        ApplicationManager.getApplication().invokeLater {
                            showAIResponse(response)
                        }
                    }
                    is AIAsyncManager.AIAsyncResult.Error -> {
                        ApplicationManager.getApplication().invokeLater {
                            showError("AI处理失败: ${result.exception.message}")
                        }
                    }
                    is AIAsyncManager.AIAsyncResult.Timeout -> {
                        ApplicationManager.getApplication().invokeLater {
                            showError("AI处理超时，请重试")
                        }
                    }
                    is AIAsyncManager.AIAsyncResult.Cancelled -> {
                        // 用户取消，不显示错误
                    }
                }
            }
    }
    
    private fun showAIResponse(response: PopupResponse) {
        val popup = currentPopup
        if (popup != null) {
            val component = popup.content
            if (component is JPanel) {
                val resultArea = findResultArea(component)
                resultArea?.text = buildString {
                    appendLine("优化建议:")
                    appendLine(response.explanation)
                    appendLine()
                    appendLine("修改后代码:")
                    appendLine(response.suggestedText)
                    if (response.alternatives.isNotEmpty()) {
                        appendLine()
                        appendLine("其他方案:")
                        response.alternatives.forEach { alt ->
                            appendLine("• $alt")
                        }
                    }
                }
                resultArea?.foreground = JBUI.CurrentTheme.Label.foreground()
                
                // 添加应用按钮
                val buttonPanel = findButtonPanel(component)
                buttonPanel?.removeAll()
                
                val applyButton = JButton("应用修改")
                val applyAltButton = JButton("查看其他方案")
                val closeButton = JButton("关闭")
                
                applyButton.addActionListener {
                    applyCodeChange(response.suggestedText)
                    hidePopup()
                }
                
                applyAltButton.addActionListener {
                    showAlternatives(response.alternatives)
                }
                
                closeButton.addActionListener {
                    hidePopup()
                }
                
                buttonPanel?.add(applyButton)
                buttonPanel?.add(Box.createHorizontalStrut(5))
                buttonPanel?.add(applyAltButton)
                buttonPanel?.add(Box.createHorizontalStrut(5))
                buttonPanel?.add(closeButton)
                
                component.revalidate()
                component.repaint()
            }
        }
    }
    
    private fun applyCodeChange(newText: String) {
        val selectionModel = editor.selectionModel
        val document = editor.document
        
        ApplicationManager.getApplication().runWriteAction {
            document.replaceString(
                selectionModel.selectionStart,
                selectionModel.selectionEnd,
                newText
            )
        }
    }
    
    private fun showAlternatives(alternatives: List<String>) {
        // 简化实现：显示第一个替代方案
        if (alternatives.isNotEmpty()) {
            JOptionPane.showMessageDialog(
                currentPopup?.content,
                "替代方案:\n\n${alternatives.joinToString("\n\n")}",
                "AI 建议",
                JOptionPane.INFORMATION_MESSAGE
            )
        }
    }
    
    private fun showError(message: String) {
        val popup = currentPopup
        if (popup != null) {
            val component = popup.content
            if (component is JPanel) {
                val resultArea = findResultArea(component)
                resultArea?.text = message
                resultArea?.foreground = java.awt.Color.RED
            }
        }
    }
    
    private fun findResultArea(panel: JPanel): JTextArea? {
        for (component in panel.components) {
            if (component is JScrollPane) {
                val viewport = component.viewport
                if (viewport.view is JTextArea) {
                    return viewport.view as JTextArea
                }
            }
            if (component is JPanel) {
                val result = findResultArea(component)
                if (result != null) return result
            }
        }
        return null
    }
    
    private fun findButtonPanel(panel: JPanel): JPanel? {
        for (component in panel.components) {
            if (component is JPanel && component.components.any { it is JButton }) {
                return component
            }
            if (component is JPanel) {
                val result = findButtonPanel(component)
                if (result != null) return result
            }
        }
        return null
    }
    
    private fun hidePopup() {
        currentPopup?.cancel()
        currentPopup = null
        isPopupVisible = false
    }
}