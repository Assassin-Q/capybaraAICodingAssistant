// @ts-nocheck
import React, { RefObject, useMemo, useCallback, memo, useRef, useEffect, useState } from 'react'
import { Button, Checkbox, Flex, Input, Radio, Select, Space, Switch, Tooltip, Typography, Tag } from 'antd'
import { 
  SendOutlined,
  AppstoreOutlined, 
  CloudServerOutlined, 
  FileOutlined, 
  SafetyOutlined,
  SearchOutlined
} from '@ant-design/icons'

import type { SkillConfig, MCPServer, Provider } from '../../types'

const { Text } = Typography

interface FileItem {
  path: string
  name: string
  relativePath?: string
  type: 'file' | 'directory'
  matches?: Array<{
    line: number
    column: number
    text: string
    highlightStart: number
    highlightEnd: number
  }>
}

export interface MessageInputProps {
  // 输入状态
  inputValue: string
  isSending: boolean
  currentSessionId: string | null
  senderRef: RefObject<any>
  
  // 选择器状态
  showSkillPicker: boolean
  showMCPPicker: boolean
  showFilePicker: boolean
  recording: boolean
  
  // 文件搜索状态
  fileSearchQuery: string
  fileSearchResults: FileItem[]
  fileSearchType: 'filename' | 'content'
  fileFuzzyMatch: boolean
  fileExactMatch: boolean
  fileExtension: string
  fileCaseSensitive: boolean
  
  // 配置状态
  chatMode: 'plan' | 'build'
  selectedProvider: string | null
  selectedModel: string | null
  autoConfirm: boolean
  // 思考强度
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max'
  onReasoningEffortChange?: (effort: 'low' | 'medium' | 'high' | 'max') => void
  // 当前选中模型的推理能力
  modelReasoningCapable?: boolean
  
  // 数据源
  skills: SkillConfig[]
  mcpServers: MCPServer[]
  selectedFiles: FileItem[]
  selectedSkills: SkillConfig[]
  selectedMCPServers: MCPServer[]
  providers: Provider[]
  
  // 回调函数
  onInputChange: (value: string) => void
  onSendMessage: () => void
  onCancel: () => void
   onPasteFile: (files: FileList) => void
   onPasteText?: (text: string) => string
   onRecordingChange: (recording: boolean) => void
  onChatModeChange: (mode: 'plan' | 'build') => void
  onProviderModelChange: (providerId: string | null, modelId: string | null) => void
  onAutoConfirmChange: (autoConfirm: boolean) => void
  // 特殊字符按钮回调
  onSkillButtonClick?: () => void
  onMCPButtonClick?: () => void
  onFileButtonClick?: () => void
  
  // 文件搜索回调
  onFileSearch: (query: string) => void
  onFileSearchTypeChange: (type: 'filename' | 'content') => void
  onFileFuzzyMatchChange: (fuzzyMatch: boolean) => void
  onFileExactMatchChange: (exactMatch: boolean) => void
  onFileExtensionChange: (extension: string) => void
  onFileCaseSensitiveChange: (caseSensitive: boolean) => void
  
  // 选择器回调
  onSelectSkill: (skill: SkillConfig) => void
  onSelectMCPServer: (mcp: MCPServer) => void
  onSelectFile: (file: FileItem) => void
  // 标签移除回调
  onRemoveSkill?: (skillId: string) => void
  onRemoveMCPServer?: (serverId: string) => void
  onRemoveFile?: (filePath: string) => void
  onRemoveRightClickFileInfo?: () => void
  
  // 条件显示
  hasQuestionOrPermission: boolean
  questionMessage?: string
  permissionMessage?: string
  
  // 右键文件信息
  rightClickFileInfo?: {
    fileName: string
    lineRange?: { start: number; end: number }
    type: string
  }
  
  // 弹窗显示回调
  onShowLongTextModal?: (id: string, content: string) => void
  onShowSkillInfoModal?: (name: string, description: string, type: 'skill' | 'mcp') => void
  onShowImagePreviewModal?: (url: string, name: string) => void
  onShowFileInfoModal?: (name: string, mime: string, url: string) => void
  // longTextMap数据
  longTextMap?: Record<string, string>
  longTextMapRef?: React.RefObject<Record<string, string>>
  
  // 语音识别
  speechRecognitionRef: RefObject<any>
}

const MessageInput = ({
  inputValue,
  isSending,
  currentSessionId,
  senderRef,
  showSkillPicker,
  showMCPPicker,
  showFilePicker,
  recording,
  // 文件搜索状态
  fileSearchQuery,
  fileSearchResults,
  fileSearchType,
  fileFuzzyMatch,
  fileExactMatch,
  fileExtension,
  fileCaseSensitive,
  // 配置状态
  chatMode,
  selectedProvider,
  selectedModel,
  autoConfirm,
  // 思考强度
  reasoningEffort,
  onReasoningEffortChange,
  modelReasoningCapable,
  // 数据源
  skills,
  mcpServers,
  selectedFiles,
  selectedSkills,
  selectedMCPServers,
  providers,
  // 回调函数
  onInputChange,
  onSendMessage,
  onCancel,
   onPasteFile,
   onPasteText,
   onRecordingChange,
  onChatModeChange,
  onProviderModelChange,
  onAutoConfirmChange,
  // 特殊字符按钮回调
  onSkillButtonClick,
  onMCPButtonClick,
  onFileButtonClick,
  // 文件搜索回调
  onFileSearch,
  onFileSearchTypeChange,
  onFileFuzzyMatchChange,
  onFileExactMatchChange,
  onFileExtensionChange,
  onFileCaseSensitiveChange,
  // 选择器回调
  onSelectSkill,
  onSelectMCPServer,
  onSelectFile,
  // 标签移除回调
  onRemoveSkill,
  onRemoveMCPServer,
  onRemoveFile,
  onRemoveRightClickFileInfo,
  // 条件显示
  hasQuestionOrPermission,
  questionMessage = '请先回答问题以继续对话',
  permissionMessage = '请先处理权限请求以继续对话',
  rightClickFileInfo,
  // 弹窗显示回调
  onShowLongTextModal,
  onShowSkillInfoModal,
  onShowImagePreviewModal,
  onShowFileInfoModal,
  // longTextMap数据
  longTextMap,
  longTextMapRef,
  // 语音识别
  speechRecognitionRef,
}) => {
  // 生成模型选项（按厂商分组）
  const modelOptions = useMemo(() => {
    const groupedOptions: Array<{ 
      label: string; 
      options: Array<{ 
        label: string; 
        value: string; 
        searchText: string;
        title?: string;
        isFree?: boolean;
      }> 
    }> = []
    
    providers.forEach(provider => {
      const models = provider.models || {}
      const modelOptions: Array<{ 
        label: string; 
        value: string; 
        searchText: string;
        title?: string;
        isFree?: boolean;
      }> = []
      
      Object.entries(models).forEach(([modelId, model]: [string, any]) => {
        // 显示所有模型，不仅仅是 'available' 状态
        let label = model.name // 只显示模型名称，不显示状态
        // 只有OpenCode Zen才显示免费标签
        const isFree = provider.id === 'opencode' && (
          model.isFree === true || model.isFree === 'true' || 
          !model.cost || (model.cost.input === 0 && model.cost.output === 0)
        )
        if (isFree) {
          label = `${model.name}（免费）`
        }
        const value = `${provider.id}/${modelId}`
        // 构建详细tooltip
        const tooltipParts = []
        if (model.description) {
          tooltipParts.push(model.description)
        }
        
        // 添加上下文大小信息
        if (model.limit?.context) {
          const contextK = Math.round(model.limit.context / 1024)
          tooltipParts.push(`上下文大小: ${contextK}K tokens`)
        }
        
        // 添加推理支持信息
        if (model.capabilities?.reasoning) {
          tooltipParts.push('支持推理 (reasoning)')
        }
        
        // 添加输入类型支持信息
        if (model.capabilities?.input && typeof model.capabilities.input === 'object') {
          const inputTypes = []
          if (model.capabilities.input.text === true) inputTypes.push('文本')
          if (model.capabilities.input.audio === true) inputTypes.push('音频')
          if (model.capabilities.input.image === true) inputTypes.push('图像')
          if (model.capabilities.input.video === true) inputTypes.push('视频')
          if (model.capabilities.input.pdf === true) inputTypes.push('PDF')
          
          if (inputTypes.length > 0) {
            tooltipParts.push(`支持输入: ${inputTypes.join(', ')}`)
          }
        }
        
        const tooltip = tooltipParts.join('\n')
        
        modelOptions.push({
          label,
          value,
          searchText: `${provider.name} ${model.name} ${modelId}`.toLowerCase(),
          title: tooltip || model.name, // 添加详细tooltip提示
          isFree // 新增字段，用于选项渲染
        })
      })
      
      if (modelOptions.length > 0) {
        groupedOptions.push({
          label: provider.name,
          options: modelOptions
        })
      }
    })
    
      return groupedOptions
    }, [providers])

      // contenteditable div的ref
    const contentEditableRef = useRef<HTMLDivElement>(null)
    const placeholderRef = useRef<HTMLSpanElement>(null)
    const isSyncingRef = useRef(false)
    const [pickerSearchText, setPickerSearchText] = useState('')
    const pickerRef = useRef<HTMLDivElement>(null)
    const [inputFocused, setInputFocused] = useState(false)

    // 点击外部关闭 picker
    useEffect(() => {
      if (!showSkillPicker && !showMCPPicker) return
      const handler = (e: MouseEvent) => {
        if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
          if (showSkillPicker) onSkillButtonClick?.()
          else if (showMCPPicker) onMCPButtonClick?.()
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [showSkillPicker, showMCPPicker])

    // 打开 picker 时重置搜索
    useEffect(() => {
      if (showSkillPicker || showMCPPicker) setPickerSearchText('')
    }, [showSkillPicker, showMCPPicker])

    // 更新placeholder显示状态
    const updatePlaceholder = useCallback(() => {
      const div = contentEditableRef.current
      const placeholder = placeholderRef.current
      if (!div || !placeholder) return
      
      // 总是使用div的实际文本内容判断
      const divText = div.textContent || ''
      const isEmpty = !divText || divText.trim() === ''
      
      if (isEmpty) {
        div.setAttribute('data-empty', 'true')
        placeholder.style.display = 'block'
      } else {
        div.removeAttribute('data-empty')
        placeholder.style.display = 'none'
      }
    }, [])

    // 将文本转换为带样式元素的DOM片段
    const renderTextToDOM = useCallback((text: string): DocumentFragment => {
      const fragment = document.createDocumentFragment()
      // 匹配所有特殊格式：[LONG_TEXT:...]、[SKILL:...]、[MCP:...]、[FILE:...]、[IMAGE:...]
      const placeholderRegex = /\[(LONG_TEXT|SKILL|MCP|FILE|IMAGE):([^\]]+)\]/g
      let lastIndex = 0
      let match: RegExpExecArray | null
      
      while ((match = placeholderRegex.exec(text)) !== null) {
        // 添加匹配前的普通文本
        if (match.index > lastIndex) {
          const textNode = document.createTextNode(text.substring(lastIndex, match.index))
          fragment.appendChild(textNode)
        }
        
        const [fullMatch, type, value] = match
        const el = document.createElement('span')
        el.setAttribute('contenteditable', 'false')
        el.className = 'long-text-tag'
        el.style.display = 'inline-block'
        el.style.padding = '2px 8px'
        el.style.borderRadius = '4px'
        el.style.margin = '0 2px'
        el.style.fontSize = '12px'
        el.style.cursor = 'pointer'
        el.style.textDecoration = 'underline'
        el.style.textDecorationStyle = 'dotted'
        el.style.textUnderlineOffset = '2px'
        el.style.whiteSpace = 'nowrap'
        
        if (type === 'LONG_TEXT') {
          // 长文本格式：[LONG_TEXT:id:label] (label为URI编码)
          const [, id, encodedLabel] = value.match(/^([^:]+):(.+)$/) || [, value, value]
          let labelText = ''
          try {
            labelText = decodeURIComponent(encodedLabel)
          } catch {
            labelText = encodedLabel
          }
          if (!labelText) labelText = '📄 长文本'
          el.textContent = labelText
          el.setAttribute('data-long-text-id', id)
          el.setAttribute('data-placeholder', fullMatch)
          el.style.backgroundColor = 'var(--accent-light, rgba(22, 119, 255, 0.1))'
          el.style.color = 'var(--accent-color, #1677ff)'
          el.style.display = 'inline'
          
          // 添加点击事件
          el.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const content = longTextMapRef?.current?.[id] || longTextMap?.[id] || ''
            if (onShowLongTextModal && content) {
              onShowLongTextModal(id, content)
            }
          })
        } else if (type === 'SKILL') {
          // 技能格式：[SKILL:name]
          el.textContent = `@${value}`
          el.setAttribute('data-type', 'skill')
          el.setAttribute('data-value', value)
          el.style.backgroundColor = 'var(--success-light, rgba(82, 196, 26, 0.1))'
          el.style.color = 'var(--success-color, #52c41a)'
          
          // 添加点击事件
          el.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onShowSkillInfoModal) {
              const skill = skills?.find(s => s.name === value)
              onShowSkillInfoModal(value, skill?.description || '', 'skill')
            }
          })
        } else if (type === 'MCP') {
          // MCP格式：[MCP:name]
          el.textContent = `#${value}`
          el.setAttribute('data-type', 'mcp')
          el.setAttribute('data-value', value)
          el.style.backgroundColor = 'var(--warning-light, rgba(250, 173, 20, 0.1))'
          el.style.color = 'var(--warning-color, #faad14)'
          
          // 添加点击事件
          el.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onShowSkillInfoModal) {
              const mcpServer = mcpServers?.find(m => m.name === value)
              onShowSkillInfoModal(value, mcpServer?.url || '', 'mcp')
            }
          })
        } else if (type === 'FILE') {
          // 文件格式：[FILE:uid:filename] 或 [FILE:path]
          const parts = value.split(':')
          const fileName = parts.length > 1 ? parts.slice(1).join(':') : value
          el.textContent = `📄 ${fileName}`
          el.setAttribute('data-type', 'file')
          el.setAttribute('data-value', value)
          el.title = fileName
          el.style.backgroundColor = 'var(--bg-tertiary, #f5f5f5)'
          el.style.color = 'var(--text-primary)'
          el.style.cursor = 'default'
        } else if (type === 'IMAGE') {
          // 图片格式：[IMAGE:uid:filename]
          const [uid, ...nameParts] = value.split(':')
          const fileName = nameParts.join(':') || 'image'
          el.textContent = `🖼️ ${fileName}`
          el.setAttribute('data-type', 'image')
          el.setAttribute('data-value', value)
          el.title = fileName
          el.style.backgroundColor = 'var(--info-light, rgba(22, 119, 255, 0.1))'
          el.style.color = 'var(--info-color, #1677ff)'
          el.style.cursor = 'default'
        }
        
        // 在div前添加零宽空格，确保光标可定位在div之前
        fragment.appendChild(document.createTextNode('\u200B'))
        fragment.appendChild(el)
        // 在div后添加零宽空格，确保光标可定位在div之后
        fragment.appendChild(document.createTextNode('\u200B'))
        // 更新lastIndex到匹配结束位置
        lastIndex = match.index + fullMatch.length
      }
      
      // 添加剩余文本
      if (lastIndex < text.length) {
        const textNode = document.createTextNode(text.substring(lastIndex))
        fragment.appendChild(textNode)
      }
      
      return fragment
    }, [longTextMap, longTextMapRef, skills, mcpServers, onShowLongTextModal, onShowSkillInfoModal, onShowImagePreviewModal, onShowFileInfoModal])

    // 从contenteditable div提取文本（处理特殊格式元素）
    const extractTextFromDiv = useCallback((div: HTMLDivElement): string => {
      let text = ''
      
      const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          let nodeText = node.textContent || ''
          // 过滤零宽空格（用于光标定位，不计入文本）
          nodeText = nodeText.replace(/\u200B/g, '')
          if (nodeText.trim()) {
            text += nodeText
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement
          const placeholder = element.getAttribute('data-placeholder')
          const longTextId = element.getAttribute('data-long-text-id')
          const type = element.getAttribute('data-type')
          const value = element.getAttribute('data-value')
          
          if (placeholder) {
            // 使用完整占位符，跳过子节点
            text += placeholder
          } else if (longTextId) {
            // 构造占位符，跳过子节点
            text += `[LONG_TEXT:${longTextId}:${element.textContent || ''}]`
          } else if (type === 'skill') {
            // 技能格式
            text += `[SKILL:${value}]`
          } else if (type === 'mcp') {
            // MCP格式
            text += `[MCP:${value}]`
          } else if (type === 'file') {
            // 文件格式
            text += `[FILE:${value}]`
          } else if (type === 'image') {
            // 图片格式
            text += `[IMAGE:${value}]`
          } else if (element.tagName === 'BR') {
            // 换行符
            text += '\n'
          } else if (element.tagName === 'DIV') {
            // div元素 = 换行（contenteditable回车产生div）
            if (text.length > 0 && !text.endsWith('\n')) {
              text += '\n'
            }
            // 递归处理div子节点
            for (const child of Array.from(element.childNodes)) {
              processNode(child)
            }
          } else {
            // 普通元素，递归处理子节点
            for (const child of Array.from(element.childNodes)) {
              processNode(child)
            }
          }
        }
      }
      
      for (const child of Array.from(div.childNodes)) {
        processNode(child)
      }
      
      return text
    }, [])

    // 同步输入值到contenteditable div
    useEffect(() => {
      const div = contentEditableRef.current
      if (!div) return
      
      const currentText = extractTextFromDiv(div)
      if (currentText === inputValue) return
      
      isSyncingRef.current = true
      
      // 检查是否包含特殊格式
      const hasSpecialFormat = /\[(LONG_TEXT|SKILL|MCP|FILE|IMAGE):[^\]]+\]/.test(inputValue)
      
      // 如果用户正在输入框中编辑，追加内容时跳过重建DOM，仅更新文本
      // 但如果有特殊格式标签，则必须走 renderTextToDOM
      if (!hasSpecialFormat && div === document.activeElement && div.contains(window.getSelection()?.anchorNode || null)) {
        if (inputValue.startsWith(currentText) && inputValue !== currentText) {
          // 追加内容到末尾
          const suffix = inputValue.slice(currentText.length)
          div.appendChild(document.createTextNode(suffix))
          // 移动光标到末尾
          const sel = window.getSelection()
          if (sel && sel.rangeCount) {
            const range = document.createRange()
            range.selectNodeContents(div)
            range.collapse(false)
            sel.removeAllRanges(); sel.addRange(range)
          }
          updatePlaceholder()
          isSyncingRef.current = false
          return
        }
      }
      
      if (hasSpecialFormat) {
        // 特殊格式：保存光标位置 → 重建DOM → 恢复光标
        let savedOffset = -1
        const sel = window.getSelection()
        if (sel && sel.rangeCount && div.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0)
          const preRange = range.cloneRange()
          preRange.selectNodeContents(div)
          preRange.setEnd(range.startContainer, range.startOffset)
          savedOffset = preRange.toString().length
        }
        
        while (div.firstChild) div.removeChild(div.firstChild)
        const fragment = renderTextToDOM(inputValue)
        div.appendChild(fragment)
        
        if (savedOffset >= 0) {
          try {
            const newSel = window.getSelection()
            const newRange = document.createRange()
            let charCount = 0, targetNode: Node | null = null, targetOffset = 0
            const walk = (node: Node): boolean => {
              if (targetNode) return true
              if (node.nodeType === Node.TEXT_NODE) {
                const len = (node.textContent || '').length
                if (charCount + len >= savedOffset) {
                  targetNode = node; targetOffset = savedOffset - charCount; return true
                }
                charCount += len
              } else {
                for (const child of Array.from(node.childNodes)) { if (walk(child)) return true }
              }
              return false
            }
            walk(div)
            if (targetNode) {
              newRange.setStart(targetNode, Math.min(targetOffset, (targetNode.textContent || '').length))
              newRange.collapse(true)
              newSel?.removeAllRanges(); newSel?.addRange(newRange)
            }
          } catch { /* ignore */ }
        }
      } else {
        // 纯文本：如果用户正在输入且不是清空操作，信任 onInput 事件
        if (inputValue !== '') {
          const sel = window.getSelection()
          if (sel && sel.rangeCount && div.contains(sel.anchorNode)) {
            isSyncingRef.current = false
            return
          }
        }
        div.textContent = inputValue
      }
      
      updatePlaceholder()
      queueMicrotask(() => { isSyncingRef.current = false })
    }, [inputValue, updatePlaceholder, extractTextFromDiv, renderTextToDOM])

    // 初始挂载时更新placeholder状态
    useEffect(() => {
      updatePlaceholder()
    }, [updatePlaceholder])

    // 处理contenteditable输入变化
    const handleInput = useCallback(() => {
      // 跳过程序化DOM更新触发的input事件，防止反馈循环
      if (isSyncingRef.current) return
      const div = contentEditableRef.current
      if (div) {
        const text = extractTextFromDiv(div)
        onInputChange(text)
        updatePlaceholder()
      }
    }, [onInputChange, updatePlaceholder, extractTextFromDiv])

    // 处理键盘事件（Ctrl+Enter发送）
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (!isSending && inputValue.trim()) {
          onSendMessage()
        }
      }
    }, [onSendMessage, isSending, inputValue])

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      const files = e.clipboardData.files
      if (files && files.length > 0 && onPasteFile) {
        onPasteFile(files)
        e.preventDefault()
        return
      }

      e.preventDefault()
      const pastedText = e.clipboardData.getData('text/plain')
      if (!pastedText) return

      const root = contentEditableRef.current
      if (!root) return

      if (onPasteText) {
        const processedText = onPasteText(pastedText)
        if (processedText !== pastedText) {
          const selection = window.getSelection()
          if (!selection || !selection.rangeCount) {
            // 没有选区时，将处理后的内容追加到末尾
            const hasSpecialFormat = /\[(LONG_TEXT|SKILL|MCP|FILE|IMAGE):[^\]]+\]/.test(processedText)
            if (hasSpecialFormat) {
              const fragment = renderTextToDOM(processedText)
              root.appendChild(fragment)
            } else {
              root.appendChild(document.createTextNode(processedText))
            }
            const extractedText = extractTextFromDiv(root)
            onInputChange(extractedText)
            updatePlaceholder()
            return
          }
          const range = selection.getRangeAt(0)
          // 删除选中的内容
          range.deleteContents()
          const hasSpecialFormat = /\[(LONG_TEXT|SKILL|MCP|FILE|IMAGE):[^\]]+\]/.test(processedText)
          if (hasSpecialFormat) {
            const fragment = renderTextToDOM(processedText)
            range.insertNode(fragment)
          } else {
            range.insertNode(document.createTextNode(processedText))
          }
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
          const extractedText = extractTextFromDiv(root)
          onInputChange(extractedText)
          updatePlaceholder()
          return
        }
      }

      // 先捕获选区再聚焦，避免focus()重置光标位置
      const sel = window.getSelection()
      root.focus()
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const textNode = document.createTextNode(pastedText)
        range.insertNode(textNode)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      } else {
        root.appendChild(document.createTextNode(pastedText))
      }

      const extractedText = extractTextFromDiv(root)
      onInputChange(extractedText)
      updatePlaceholder()
    }, [onPasteText, onInputChange, onPasteFile, updatePlaceholder, extractTextFromDiv, renderTextToDOM])

   // 自定义选项渲染函数
  const optionRender = useCallback((option: any) => {
    const currentValue = selectedProvider && selectedModel ? `${selectedProvider}/${selectedModel}` : undefined
    
    // 检查是否为分组标题（根据Ant Design的分组结构）
    // 分组标题通常没有value属性，或者有options属性
    const isGroupTitle = !option.value || option.options
    
    if (isGroupTitle) {
      return (
        <div style={{ 
          fontSize: '14px', 
          fontWeight: 'bold',
          color: 'var(--text-primary)',
          padding: '4px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          cursor: 'default',
          lineHeight: '1.2'
        }}>
          {option.label}
        </div>
      )
    }
    
    // 模型选项
    const isSelected = option.value === currentValue
    const isFree = option.isFree === true
    return (
      <div 
        title={option.title}
        style={{ 
          fontSize: '12px', 
          color: 'var(--text-primary)',
          padding: '4px 12px 4px 24px', // 左边留更多空间缩进，表示层级
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          lineHeight: '1.2',
          minHeight: '24px' // 确保最小高度，但不要太高
        }}
      >
        <span>{option.label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isFree && <Tag color="green" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>免费</Tag>}
          {isSelected && <span style={{ color: 'var(--success-color)', marginLeft: 8 }}>✓</span>}
        </div>
      </div>
    )
  }, [selectedProvider, selectedModel])


  // 如果没有会话或存在问询/权限请求，显示提示信息
  if (!currentSessionId || hasQuestionOrPermission) {
    return (
      <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
        {!currentSessionId 
          ? '请先创建或选择会话以开始对话' 
          : (hasQuestionOrPermission ? questionMessage : permissionMessage)}
      </div>
    )
  }

  return (
    <>
      {/* 技能、MCP、文件选择器弹窗 */}

      {/* 指令弹窗 - 技能选择 */}
      {showSkillPicker && (
        <div ref={pickerRef} style={{
          position: 'absolute', bottom: '100%', left: 12, width: 300, maxHeight: 320,
          backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: 4, overflow: 'hidden', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Space style={{ width: '100%' }}>
              <AppstoreOutlined />
              <Text strong>选择技能</Text>
            </Space>
          </div>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <Input
              size="small"
              placeholder="搜索技能名称或描述..."
              value={pickerSearchText}
              onChange={e => setPickerSearchText(e.target.value)}
              allowClear
              autoFocus
              style={{ width: '100%', fontSize: 12 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {(() => {
              const filtered = skills.filter(s => s.enabled && (
                !pickerSearchText || s.name.toLowerCase().includes(pickerSearchText.toLowerCase()) ||
                (s.description || '').toLowerCase().includes(pickerSearchText.toLowerCase())
              ))
              const truncate = (text: string, max: number) => text.length > max ? text.slice(0, max) + '...' : text
              return filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>无匹配技能</div>
              ) : filtered.map(skill => (
                <div key={skill.name} style={{ cursor: 'pointer', padding: '8px 12px', borderBottom: '1px solid var(--border-light)' }}
                  onClick={() => onSelectSkill(skill)}
                >
                  <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{skill.name}</div>
                  {skill.description && (
                    <div title={skill.description.length > 30 ? skill.description : undefined}
                      style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                      {truncate(skill.description, 30)}
                    </div>
                  )}
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 指令弹窗 - MCP 选择 */}
      {showMCPPicker && (
        <div ref={pickerRef} style={{
          position: 'absolute', bottom: '100%', left: 12, width: 300, maxHeight: 320,
          backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: 4, overflow: 'hidden', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Space>
              <CloudServerOutlined />
              <Text strong>选择 MCP 服务器</Text>
            </Space>
          </div>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <Input
              size="small"
              placeholder="搜索 MCP 名称或地址..."
              value={pickerSearchText}
              onChange={e => setPickerSearchText(e.target.value)}
              allowClear
              autoFocus
              style={{ width: '100%', fontSize: 12 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {(() => {
              const filtered = mcpServers.filter(m => m.enabled && (
                !pickerSearchText || m.name.toLowerCase().includes(pickerSearchText.toLowerCase()) ||
                (m.url || '').toLowerCase().includes(pickerSearchText.toLowerCase())
              ))
              const truncate = (text: string, max: number) => text.length > max ? text.slice(0, max) + '...' : text
              return filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>无匹配 MCP 服务器</div>
              ) : filtered.map(mcp => (
                <div key={mcp.name} style={{ cursor: 'pointer', padding: '8px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onClick={() => onSelectMCPServer(mcp)}
                >
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{mcp.name}</div>
                    <div title={mcp.url.length > 30 ? mcp.url : undefined}
                      style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {truncate(mcp.url, 30)}
                    </div>
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 指令弹窗 - 文件搜索 */}
      {showFilePicker && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 12,
            width: 400,
            maxHeight: 300,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Space>
              <SearchOutlined />
              <Text strong>搜索文件</Text>
            </Space>
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="输入文件名搜索..."
              value={fileSearchQuery}
              onChange={e => onFileSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>搜索类型</div>
                <Radio.Group 
                  value={fileSearchType} 
                  onChange={e => {
                    onFileSearchTypeChange(e.target.value)
                    if (fileSearchQuery.trim()) {
                      onFileSearch(fileSearchQuery)
                    }
                  }}
                  size="small"
                >
                  <Radio value="filename">文件名</Radio>
                  <Radio value="content">内容</Radio>
                </Radio.Group>
              </div>
               <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>匹配选项</div>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Radio.Group 
                    value={fileFuzzyMatch ? 'fuzzy' : fileExactMatch ? 'exact' : 'none'}
                    onChange={e => {
                      const value = e.target.value
                      const newFuzzyMatch = value === 'fuzzy'
                      const newExactMatch = value === 'exact'
                      onFileFuzzyMatchChange(newFuzzyMatch)
                      onFileExactMatchChange(newExactMatch)
                      if (fileSearchQuery.trim()) {
                        // 使用新的值立即搜索
                        setTimeout(() => onFileSearch(fileSearchQuery), 0)
                      }
                    }}
                    size="small"
                  >
                    <Radio value="fuzzy">模糊匹配</Radio>
                    <Radio value="exact">全量匹配</Radio>
                    <Radio value="none">无特殊匹配</Radio>
                  </Radio.Group>
                  <Checkbox 
                    checked={fileCaseSensitive}
                    onChange={e => {
                      onFileCaseSensitiveChange(e.target.checked)
                      if (fileSearchQuery.trim()) {
                        onFileSearch(fileSearchQuery)
                      }
                    }}
                  >
                    区分大小写
                  </Checkbox>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>后缀匹配</div>
                    <Input
                      size="small"
                      placeholder="例如: .kt, .java (留空则匹配所有文件)"
                      value={fileExtension}
                      onChange={e => {
                        onFileExtensionChange(e.target.value)
                        if (fileSearchQuery.trim()) {
                          // 不立即搜索，等待用户输入完成
                        }
                      }}
                      onBlur={() => {
                        if (fileSearchQuery.trim()) {
                          onFileSearch(fileSearchQuery)
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </div>
                </Space>
              </div>
            </Space>
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {fileSearchResults.map((file, idx) => (
              <div
                key={file.name + (idx as number)}
                style={{ cursor: 'pointer', padding: '8px 12px', borderBottom: '1px solid var(--border-light)' }}
                onClick={() => onSelectFile(file)}
              >
                <Space>
                  <FileOutlined />
                  <Text style={{ color: 'var(--text-primary)' }}>{file.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{file.path}</Text>
                </Space>
              </div>
            ))}
          </div>
        </div>
      )}

        {/* 自定义contenteditable输入框 */}
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
        }}>
          {/* 输入框区域 */}
          <div style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            border: inputFocused
              ? '1px solid var(--accent-color)'
              : '1px solid var(--border-color)',
            borderRadius: 2,
            // backgroundColor: 'var(--bg-primary)',
            height: 80,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: inputFocused
              ? '0 0 0 3px var(--accent-light), inset 0 0 8px rgba(51,154,240,0.06)'
              : 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div
              ref={contentEditableRef}
              contentEditable="true"
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              data-placeholder="输入您的需求... 按 Ctrl+Enter 发送（AI生成，仅供参考，注意审查，注意备份代码）"
              style={{
                flex: 1,
                outline: 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                caretColor: 'var(--accent-color)',
                padding: '12px',
                paddingRight: 48,
                overflowY: 'auto',
              }}
              className="message-input-editor"
            />
            <span
              ref={placeholderRef}
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                color: 'var(--text-disabled)',
                pointerEvents: 'none',
              }}
              data-placeholder-role="true"
            >
              输入您的需求... 按 Ctrl+Enter 发送（AI生成，仅供参考，注意审查，注意备份代码）
            </span>
          </div>
        </div>

      {/* 工具栏 */}
      <Flex gap={6} align="center" style={{ marginTop: 6, padding: '0 2px' }} justify="space-between">
        <Flex gap={6} align="center">
          {/* 智能体/计划 切换 */}
          <Switch
            checked={chatMode === 'build'}
            onChange={(checked) => onChatModeChange(checked ? 'build' : 'plan')}
            checkedChildren="构建 (Build)"
            unCheckedChildren="计划 (Plan)"
            className="mode-switch"
          />
        
          {/* 模型选择 */}
          <Select
            size="small"
            value={selectedProvider && selectedModel ? `${selectedProvider}/${selectedModel}` : undefined}
            placeholder="选择模型"
            showSearch
            filterOption={(input, option) => {
              const searchText = (option as any)?.searchText || ''
              return searchText.toLowerCase().includes(input.toLowerCase())
            }}
            popupMatchSelectWidth={false}
            getPopupContainer={() => document.body}
            listHeight={300}
            options={modelOptions}
            optionRender={optionRender}
            onChange={(value) => {
              if (value) {
                const [provId, modelId] = value.split('/')
                onProviderModelChange(provId, modelId)
              } else {
                onProviderModelChange(null, null)
              }
            }}
            style={{ minWidth: 120, borderRadius: 2 }}
          />
        
          {/* 思考强度选择 */}
          {modelReasoningCapable && (
            <Select
              size="small"
              value={reasoningEffort || 'medium'}
              onChange={(value) => onReasoningEffortChange?.(value)}
              style={{ width: 56, borderRadius: 2 }}
              popupMatchSelectWidth={false}
              options={[
                { label: '低', value: 'low' },
                { label: '中', value: 'medium' },
                { label: '高', value: 'high' },
                { label: '最大', value: 'max' },
              ]}
            />
          )}
        
          <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-color)', margin: '0 2px' }} />

          {/* 技能选择按钮 */}
          {onSkillButtonClick && (
            <Tooltip title="选择技能">
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={onSkillButtonClick}
                type="text"
                style={{ color: showSkillPicker ? 'var(--accent-color)' : 'var(--text-secondary)', borderRadius: 2, fontSize: 11 }}
              />
            </Tooltip>
          )}

          {/* MCP 服务器选择按钮 */}
          {onMCPButtonClick && (
            <Tooltip title="选择 MCP 服务器">
              <Button
                size="small"
                icon={<CloudServerOutlined />}
                onClick={onMCPButtonClick}
                type="text"
                style={{ color: showMCPPicker ? 'var(--accent-color)' : 'var(--text-secondary)', borderRadius: 2, fontSize: 11 }}
              />
            </Tooltip>
          )}
        </Flex>

        {/* 发送/取消按钮 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {isSending ? (
            <button
              type="button"
              onClick={onCancel}
              title="取消发送"
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                border: '1px solid var(--error-color)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--error-color)',
                animation: 'pulse-dot 1.5s infinite',
              }} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSendMessage}
              disabled={!inputValue.trim()}
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                border: inputValue.trim() ? 'none' : '1px solid var(--border-color)',
                backgroundColor: inputValue.trim() ? 'var(--accent-color)' : 'var(--bg-secondary)',
                color: inputValue.trim() ? '#fff' : 'var(--text-tertiary)',
                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                flexShrink: 0,
                boxShadow: inputValue.trim() ? '0 2px 8px rgba(51, 154, 240, 0.4)' : 'none',
              }}
              onMouseEnter={e => {
                if (inputValue.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)'
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-hover)'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                if (inputValue.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-color)'
                }
              }}
            >
              <SendOutlined style={{ fontSize: 14,marginLeft: 3, transform: 'rotate(-45deg)', display: 'block' }} />
            </button>
          )}
        </div>
      </Flex>
    </>
  )
}

export default memo<MessageInputProps>(MessageInput)