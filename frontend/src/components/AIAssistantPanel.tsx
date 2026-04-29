import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button, message as antMessage, Modal } from 'antd'
import { DownCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons'





import SettingsDialog from './SettingsDialog'
import QuestionPanel from './chat/QuestionPanel'
import TodoPanel from './chat/TodoPanel'
import PermissionPanel from './chat/PermissionPanel'
import MessageInput from './chat/MessageInput'
import SessionHistoryPanel from './chat/SessionHistoryPanel'
import ChatArea, { type ChatAreaHandle } from './chat/ChatArea'
import FileAttachmentPanel from './chat/FileAttachmentPanel'
import TopToolbar from './TopToolbar'
import TranslationModal from './chat/TranslationModal'
import SelectionContextMenu from './chat/SelectionContextMenu'

import { Message, Settings, SkillConfig, Todo, ThoughtStep, MessagePart, PermissionRequest, QuestionRequest, TokenUsage, ContextUsage, SessionStatus } from '../types'
import { kotlinApi, Session, ServerStatus, ChatMessage } from '../utils/kotlinApi'
import { useSSEHandler } from '../hooks/useSSEHandler'
import { useKotlinSSE } from '../hooks/useKotlinSSE'
import { useChatScroll } from '../hooks/useChatScroll'

// 哨兵标签常量
const LONG_TEXT_START = '[LONG_TEXT_START]'
const LONG_TEXT_END = '[LONG_TEXT_END]'
const FILE_START = '[FILE_START]'
const FILE_END = '[FILE_END]'
const IMAGE_START = '[IMAGE_START]'
const IMAGE_END = '[IMAGE_END]'
const SKILL_START = '[SKILL_START]'
const SKILL_END = '[SKILL_END]'
const MCP_START = '[MCP_START]'
const MCP_END = '[MCP_END]'
const LONG_TEXT_PREFIX = '[LONG_TEXT:'
const LONG_TEXT_SUFFIX = ']'
const LONG_TEXT_THRESHOLD = 50

interface AIAssistantPanelProps {
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
}

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

interface BackendTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  id?: string
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ isDark, onThemeChange }) => {


  // 服务器状态
  const [serverStatus, setServerStatus] = useState<'loading' | 'installed' | 'running' | 'not_installed'>('loading')
  const [serverStatusData, setServerStatusData] = useState<ServerStatus | null>(null)
  // SSE 重连计数器，每次重启服务后递增强制重连
  const [sseReconnectKey, setSseReconnectKey] = useState(0)
  
  // 会话状态
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [parentSessionId, setParentSessionId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, SessionStatus>>({})
  
  // 消息状态
  const [messages, setMessages] = useState<Message[]>([])
  const [messageLimit, setMessageLimit] = useState<number>(5)
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false)
  
  // 切换会话时重置发送状态并刷新会话状态
  useEffect(() => {
    setIsSending(false)
    loadSessionStatuses()
  }, [currentSessionId])
  const [loadingMoreMessages, setLoadingMoreMessages] = useState<boolean>(false)
  // 长文本映射（用于粘贴长文本）
  const [longTextMap, setLongTextMap] = useState<Record<string, string>>({})
  const longTextMapRef = useRef<Record<string, string>>({})
  // 同步ref和state
  useEffect(() => {
    longTextMapRef.current = longTextMap
  }, [longTextMap])
  // 右键菜单消息处理
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set())
  const [rightClickFileInfo, setRightClickFileInfo] = useState<{
    fileName: string
    lineRange?: { start: number; end: number }
    type: string
  } | undefined>(undefined)
  
  // 待办事项状态
  const [todos, setTodos] = useState<Todo[]>([])
  const [todoCollapsed, setTodoCollapsed] = useState(false)
  
  // 滚动相关refs（保留必要的refs）
  const scrollRef = useRef<HTMLElement>(null)
  const chatAreaRef = useRef<ChatAreaHandle>(null)
  const senderRef = useRef<any>(null)
  const speechRecognitionRef = useRef<any>(null)
  const creatingSessionRef = useRef(false)
  const serverCheckIntervalRef = useRef<number | null>(null)

  // 使用新的滚动hook
  const {
    forceScrollToBottom,
    scrollToBottom,
    showScrollToBottom,
    isAtBottom,
    setLoadingHistory,
  } = useChatScroll({
    scrollRef,
    chatAreaRef,
    messages,
    loadingMoreMessages,
  })
  
  // 当待办事项面板折叠状态变化时，如果当前在底部，保持滚动到底部
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
        }
      })
    }
  }, [todoCollapsed, isAtBottom])
  
  // 设置状态
  const [settings, setSettings] = useState<Settings>({
    theme: isDark ? 'dark' : 'light',
    model: '',
    providerId: undefined,
    promptEnhancementEnabled: false,
    enhancementLevel: 'medium',
    autoContextEnabled: true,
    skills: [],
    mcpServers: [],
    promptTemplates: [],
    permissions: [],
  })
  
  // 模型和提供商
  const [providers, setProviders] = useState<any[]>([])

  // 简单hash函数，为content生成稳定id
  const generateTodoId = (content: string) => {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i)
      hash = hash & hash // 转换为32位整数
    }
    return `todo-${Math.abs(hash).toString(16)}`
  }
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  
  // 模式 (build/plan)
  const [chatMode, setChatMode] = useState<'build' | 'plan'>('build')
  
  // 思考强度
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high' | 'max'>('medium')
  
  // 权限设置
  const [autoConfirm, setAutoConfirm] = useState(false)
  
  // UI 状态
  const [showSettings, setShowSettings] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [recording, setRecording] = useState(false)
  // 会话标题编辑状态
  const [editingSessionTitle, setEditingSessionTitle] = useState(false)
  const [sessionTitleInput, setSessionTitleInput] = useState('')
  // Token 使用统计
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)

  // OpenCode 交互状态
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])
  const [questionRequests, setQuestionRequests] = useState<QuestionRequest[]>([])
  const [_showQuestionModal, setShowQuestionModal] = useState(false)
  const [currentPermission, setCurrentPermission] = useState<PermissionRequest | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionRequest | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  const [permissionMessage, setPermissionMessage] = useState('')
  const [questionMessage, _setQuestionMessage] = useState('请先回答问题以继续对话')
  const [selectedAnswers, setSelectedAnswers] = useState<string[][]>([])
  const [customAnswers, setCustomAnswers] = useState<string[]>([])
  
  // 输入状态
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<any[]>([])
  
  // 指令弹窗状态
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  const [showMCPPicker, setShowMCPPicker] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileSearchResults, setFileSearchResults] = useState<FileItem[]>([])
  const [fileSearchType, setFileSearchType] = useState<'filename' | 'content'>('filename')
  const [fileFuzzyMatch, setFileFuzzyMatch] = useState(true)
  const [fileExactMatch, setFileExactMatch] = useState(false)
  const [fileExtension, setFileExtension] = useState('')
  
  // 选中标签状态
  const [selectedSkills, setSelectedSkills] = useState<any[]>([])
  const [selectedMCPServers, setSelectedMCPServers] = useState<any[]>([])
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([])
  const [fileCaseSensitive, setFileCaseSensitive] = useState(false)
  
  // 弹窗状态（用于输入框中的span标签点击）
  const [longTextModalVisible, setLongTextModalVisible] = useState(false)
  const [longTextContent, setLongTextContent] = useState('')
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [imagePreviewName, setImagePreviewName] = useState('')
  const [fileInfoVisible, setFileInfoVisible] = useState(false)
  const [fileInfoName, setFileInfoName] = useState('')
  const [fileInfoMime, setFileInfoMime] = useState('')
  const [skillInfoVisible, setSkillInfoVisible] = useState(false)
  const [skillInfoName, setSkillInfoName] = useState('')
  const [skillInfoDescription, setSkillInfoDescription] = useState('')
  const [skillInfoType, setSkillInfoType] = useState<'skill' | 'mcp'>('skill')
  // 翻译弹窗状态
  const [translateModalVisible, setTranslateModalVisible] = useState(false)
  const [translateText, setTranslateText] = useState('')
  
  // 回滚相关状态
  const [revertModalVisible, setRevertModalVisible] = useState(false)
  const [pendingRevertMessage, setPendingRevertMessage] = useState<{id: string, partId?: string, content: string} | null>(null)
  const [revertedMessageId, setRevertedMessageId] = useState<string | null>(null)
  
  // 技能和 MCP 数据
  const [skills, setSkills] = useState<SkillConfig[]>([])
  
  // 监听右键菜单"添加到对话"事件
  useEffect(() => {
    const handleAddToInput = (e: CustomEvent) => {
      const text = e.detail
      if (text) {
        setInputValue(prev => prev ? `${prev}\n${text}` : text)
      }
    }
    window.addEventListener('add-to-input', handleAddToInput as EventListener)
    return () => window.removeEventListener('add-to-input', handleAddToInput as EventListener)
  }, [setInputValue])
  
  const loadProviders = async () => {
    try {
      console.log('开始加载提供商...')
      const response = await kotlinApi.getProviders()
      console.log('提供商API响应:', response)
      
      if (response.data?.all && Array.isArray(response.data.all) && response.data.connected && Array.isArray(response.data.connected)) {
        console.log(`找到 ${response.data.all.length} 个提供商，已连接: ${response.data.connected.length}`)
        
        // 只显示已连接的厂商
        const connectedProviders = response.data.all.filter(provider => 
          response.data!.connected.includes(provider.id)
        )
        console.log(`已连接提供商: ${connectedProviders.length}`, connectedProviders.map(p => ({ id: p.id, name: p.name, modelCount: Object.keys(p.models || {}).length })))
        
        // 检查每个提供商的模型状态
        connectedProviders.forEach(provider => {
          const models = provider.models || {}
           const availableModels = Object.entries(models).filter(([, model]: [string, any]) => model.status === 'available')
          console.log(`提供商 ${provider.id} (${provider.name}) 有 ${Object.keys(models).length} 个模型，其中 ${availableModels.length} 个可用`)
        })
        
        setProviders(connectedProviders)
        
        // 检查当前选中的模型是否仍然有效
        const currentProvider = selectedProvider
        const currentModel = selectedModel
        console.log('当前选中的模型:', currentProvider, currentModel)
        
        if (currentProvider && currentModel) {
          // 查找当前选中的提供商
          const currentProviderObj = connectedProviders.find(p => p.id === currentProvider)
          if (currentProviderObj) {
            // 检查模型是否存在
            const modelExists = currentProviderObj.models && currentProviderObj.models[currentModel]
            if (modelExists) {
              console.log('当前选中的模型仍然有效，保持选中')
              // 模型有效，保持当前选中状态
              setSelectedProvider(currentProvider)
              setSelectedModel(currentModel)
              return
            } else {
              console.log('当前选中的模型已不存在，重新选择默认模型')
            }
          } else {
            console.log('当前选中的提供商已不存在，重新选择默认模型')
          }
        }
        
        // 设置默认模型
        console.log('默认模型配置:', response.data.default)
        if (response.data.default && typeof response.data.default === 'object') {
          // 找到第一个已连接厂商的默认模型
          const firstConnectedProvider = response.data.connected[0]
          console.log(`第一个已连接厂商: ${firstConnectedProvider}`)
          if (firstConnectedProvider && response.data.default[firstConnectedProvider]) {
            setSelectedProvider(firstConnectedProvider)
            setSelectedModel(response.data.default[firstConnectedProvider])
            console.log(`设置默认模型: ${firstConnectedProvider}/${response.data.default[firstConnectedProvider]}`)
          } else {
            console.log(`没有找到厂商 ${firstConnectedProvider} 的默认模型`)
            // 如果没有默认模型，设置第一个厂商的第一个可用模型
            if (connectedProviders.length > 0) {
              const firstProvider = connectedProviders[0]
              const firstModelId = Object.keys(firstProvider.models || {})[0]
              if (firstModelId) {
                setSelectedProvider(firstProvider.id)
                setSelectedModel(firstModelId)
                console.log(`设置第一个模型作为默认: ${firstProvider.id}/${firstModelId}`)
              }
            }
          }
        } else {
          console.log('没有默认模型配置，尝试设置第一个可用模型')
          if (connectedProviders.length > 0) {
            const firstProvider = connectedProviders[0]
            const firstModelId = Object.keys(firstProvider.models || {})[0]
            if (firstModelId) {
              setSelectedProvider(firstProvider.id)
              setSelectedModel(firstModelId)
              console.log(`设置第一个模型作为默认: ${firstProvider.id}/${firstModelId}`)
            }
          }
        }
      } else {
        console.warn('提供商API响应数据结构异常:', response.data)
        setProviders([])
      }
    } catch (error) {
      console.error('加载提供商失败:', error)
      setProviders([])
    }
  }

  // 配置 Monaco Editor 的 Worker 加载，解决 JCEF 环境下 Worker 加载问题
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 配置 MonacoEnvironment 以使用正确的 Worker URL
      const monacoEnv = (window as any).MonacoEnvironment
      if (!monacoEnv) {
        (window as any).MonacoEnvironment = {
           getWorkerUrl: function (_moduleId: string, label: string) {
            // 对于本地开发服务器，使用相对路径加载 Worker 脚本
            // 避免 JCEF 的跨域限制
            if (label === 'json') {
              return './monaco-editor/esm/vs/language/json/json.worker.js'
            }
            if (label === 'css') {
              return './monaco-editor/esm/vs/language/css/css.worker.js'
            }
            if (label === 'html') {
              return './monaco-editor/esm/vs/language/html/html.worker.js'
            }
            if (label === 'typescript' || label === 'javascript') {
              return './monaco-editor/esm/vs/language/typescript/ts.worker.js'
            }
            // 默认编辑器 Worker
            return './monaco-editor/esm/vs/editor/editor.worker.js'
          }
        }
      }
      
      // 另外，尝试使用全局 monaco 实例配置（如果已加载）
      const configureMonaco = () => {
        const monaco = (window as any).monaco
        if (monaco) {
          // 可以在这里配置 Monaco 编辑器选项
        }
      }
      
      // 如果 monaco 已经加载，立即配置
      configureMonaco()
      // 监听 monaco 加载事件
      window.addEventListener('monaco-loaded', configureMonaco)
      
      return () => {
        window.removeEventListener('monaco-loaded', configureMonaco)
      }
    }
  }, [])
  
  // 初始化加载待处理的权限和问题请求
  useEffect(() => {
    const loadPendingRequests = async () => {
      try {
        // 获取项目路径
        const projectPathResponse = await kotlinApi.getProjectPath()
        if (projectPathResponse.data?.path) {
          const directory = projectPathResponse.data.path
          
          // 加载权限请求
          const permissionsResponse = await kotlinApi.getPermissions(directory)
          if (permissionsResponse.data && Array.isArray(permissionsResponse.data)) {
            setPermissionRequests(permissionsResponse.data)
          }
          
          // 加载问题请求
          const questionsResponse = await kotlinApi.getQuestions()
          if (questionsResponse.data && Array.isArray(questionsResponse.data)) {
            // 过滤当前会话的问题
            const sessionQuestions = questionsResponse.data.filter(
              (q: any) => q.sessionID === currentSessionId
            )
            setQuestionRequests(sessionQuestions)
          }
        }
      } catch (error) {
        console.error('加载待处理请求失败:', error)
      }
    }
    
    loadPendingRequests()
  }, [currentSessionId])
  
  // 语音识别初始化
  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      console.warn('Web Speech API not supported')
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN' // 默认中文

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        }
      }
      // 将最终识别结果追加到输入框
      if (finalTranscript) {
        setInputValue(prev => prev + finalTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error)
      setRecording(false)
      antMessage.error(`语音识别错误: ${event.error}`)
    }

    recognition.onend = () => {
      setRecording(false)
    }

    speechRecognitionRef.current = recognition

    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop()
        speechRecognitionRef.current = null
      }
    }
  }, [])

  // 主题缓存
  useEffect(() => {
    const savedTheme = localStorage.getItem('ai-coding-theme')
    if (savedTheme) {
      const isDarkMode = savedTheme === 'dark'
      if (isDarkMode !== isDark) {
        onThemeChange(isDarkMode)
      }
    }
  }, [])

  // 保存主题偏好
  useEffect(() => {
    localStorage.setItem('ai-coding-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // 检查服务器状态 - 动态重试间隔：失败时5秒，成功时120秒
  useEffect(() => {
    // 立即执行一次检查
    checkServerStatus()
    
    // 根据当前状态设置初始间隔
    const initialInterval = serverStatus === 'running' ? 120000 : 5000
    serverCheckIntervalRef.current = setInterval(checkServerStatus, initialInterval)
    
    return () => {
      if (serverCheckIntervalRef.current) {
        clearInterval(serverCheckIntervalRef.current)
        serverCheckIntervalRef.current = null
      }
    }
  }, [])
  
  // 当服务器状态变化时调整检测间隔
  useEffect(() => {
    if (!serverCheckIntervalRef.current) return
    
    // 清除现有定时器
    clearInterval(serverCheckIntervalRef.current)
    
    // 根据新状态设置新的定时器
    const newInterval = serverStatus === 'running' ? 120000 : 5000
    serverCheckIntervalRef.current = setInterval(checkServerStatus, newInterval)
    
    console.log(`服务状态变为 ${serverStatus}, 检测间隔调整为 ${newInterval/1000} 秒`)
  }, [serverStatus])

  // 加载会话列表
  useEffect(() => {
    if (serverStatus === 'running') {
      loadSessions()
      loadProviders()
      loadSkills()
      loadMCPServers()
    }
  }, [serverStatus])

  // 加载消息、待办事项和问询
  useEffect(() => {
    if (currentSessionId) {
       loadMessages(currentSessionId, 5, false) // 初始加载5条
       loadTodos(currentSessionId)
       loadQuestions()
       loadPermissions()
    }
  }, [currentSessionId])

  // 应用主题
  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])



  // 轮询右键菜单消息
  useEffect(() => {
    // 已禁用，改用SSE
    return
    if (serverStatus !== 'running') return

    const pollChatMessages = async () => {
      try {
        const response = await kotlinApi.getChatMessages()
        if (response.data) {
           const newMessages = response.data.filter(msg => !processedMessageIds.has(String(msg.id)))
          
          if (newMessages.length > 0) {
            // 处理新消息
            newMessages.forEach(msg => {
              // 将右键菜单消息添加到当前会话
              const newMessage: Message = {
                id: `rightclick-${msg.id}`,
                content: msg.content,
                role: 'user' as const,
                timestamp: msg.timestamp || Date.now(),
                status: 'success' as const,
              }
              
              // 添加到消息列表
              setMessages(prev => [...prev, newMessage])
              
               // 标记为已处理
               setProcessedMessageIds(prev => new Set([...prev, String(msg.id)]))
              
              // 可选：从后端删除已处理的消息
              // kotlinApi.deleteChatMessage(msg.id)
            })
          }
        }
      } catch (error) {
        console.error('轮询聊天消息失败:', error)
      }
    }

    // 立即执行一次
    pollChatMessages()
    
    // 每2秒轮询一次
    const interval = setInterval(pollChatMessages, 2000)
    return () => clearInterval(interval)
  }, [serverStatus, processedMessageIds])

  // 使用自定义SSE处理器
  useSSEHandler({
    currentSessionId,
    serverStatus,
    sseReconnectKey,
    setMessages,
    setPermissionRequests,
    setQuestionRequests,
    setCurrentPermission,
    setCurrentQuestion,
    setCurrentQuestionIndex,
    setSelectedAnswers,
    setCustomAnswers,
    setPermissionMessage,
    loadProviders,
    setAttachments,
    setInputValue,
    setProcessedMessageIds,
    processedMessageIds,
    setTodos,
    generateTodoId,
    currentPermission,
    currentQuestion,
    setSessionStatuses,
    autoConfirm,
    settings,
    setRightClickFileInfo,
  })
  
  // 格式化右键菜单消息 - 使用长文本span标签格式
  const formatRightClickMessage = useCallback((chatMsg: ChatMessage): string => {
    const { type, content, fileName, lineRange } = chatMsg
    
    // 生成长文本标签
    const generateLongTextTag = (text: string, label: string): string => {
      const id = `long_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      // 同时更新ref和state，确保点击时能获取到内容
      longTextMapRef.current = { ...longTextMapRef.current, [id]: text }
      setLongTextMap(prev => ({ ...prev, [id]: text }))
      const encodedLabel = encodeURIComponent(label)
      return `[LONG_TEXT:${id}:${encodedLabel}]`
    }
    
    // 判断是否有代码内容
    const hasCode = content && content !== fileName
    
    if (type === 'add_to_chat') {
      // 添加到对话：只需要长文本的span标签
      if (hasCode) {
        const label = `📄 ${fileName || '代码片段'}${lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : ''} (${content.length}字)`
        return generateLongTextTag(content, label)
      } else if (fileName) {
        return `文件: ${fileName}`
      } else {
        return content || ''
      }
    } else if (type === 'explain_code') {
      // 解释代码：解释代码 + xxx长文本标签
      if (hasCode) {
        const label = `📄 ${fileName || '代码片段'}${lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : ''} (${content.length}字)`
        return `解释代码 ${generateLongTextTag(content, label)}`
      } else {
        return `解释代码 文件: ${fileName || 'unknown'}`
      }
    } else if (type === 'optimize_code') {
      // 优化代码：优化代码 + xxx长文本标签
      if (hasCode) {
        const label = `📄 ${fileName || '代码片段'}${lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : ''} (${content.length}字)`
        return `优化代码 ${generateLongTextTag(content, label)}`
      } else {
        return `优化代码 文件: ${fileName || 'unknown'}`
      }
    } else if (type === 'generate_test') {
      // 生成单元测试：生成单元测试 + xxx长文本标签
      if (hasCode) {
        const label = `📄 ${fileName || '代码片段'}${lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : ''} (${content.length}字)`
        return `生成单元测试 ${generateLongTextTag(content, label)}`
      } else {
        return `生成单元测试 文件: ${fileName || 'unknown'}`
      }
    } else {
      return content || ''
    }
  }, [setLongTextMap])
  
  // 处理Kotlin SSE的chat_message事件
  const handleKotlinChatMessage = useCallback((chatMsg: ChatMessage) => {
    console.log('Handling Kotlin chat_message:', chatMsg)
    
    // 检查是否已处理过
    if (processedMessageIds.has(String(chatMsg.id))) {
      console.log('Message already processed:', chatMsg.id)
      return
    }
    
    // 设置右键文件信息
    setRightClickFileInfo({
      fileName: chatMsg.fileName || 'unknown',
      lineRange: chatMsg.lineRange,
      type: chatMsg.type
    })
    
    // 格式化消息并添加到输入框
    const formatted = formatRightClickMessage(chatMsg)
    setInputValue(prev => prev ? `${prev}\n${formatted}` : formatted)
    
    // 标记为已处理
    setProcessedMessageIds(prev => new Set([...prev, String(chatMsg.id)]))
    
    antMessage.success('内容已添加到对话框')
  }, [processedMessageIds, setRightClickFileInfo, setInputValue, formatRightClickMessage])
  
// 使用Kotlin SSE处理器
  useKotlinSSE({
    serverStatus,
    sseReconnectKey,
    onChatMessage: handleKotlinChatMessage,
  })
  
  // 翻译回调
  const handleTranslate = useCallback((text: string) => {
    setTranslateText(text)
    setTranslateModalVisible(true)
  }, [])

  // 添加到对话回调（从选中文本右键菜单）
  const handleAddSelectionToChat = useCallback((text: string) => {
    // 长文本转换为 LONG_TEXT 标签
    let processed = text
    if (text.length > LONG_TEXT_THRESHOLD) {
      const id = `long_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      longTextMapRef.current = { ...longTextMapRef.current, [id]: text }
      setLongTextMap(prev => ({ ...prev, [id]: text }))
      const preview = text.substring(0, 15).replace(/\n/g, ' ') + '...'
      const charCount = text.length
      const label = encodeURIComponent(`📄 ${preview} (${charCount}字)`)
      processed = `[LONG_TEXT:${id}:${label}]`
    }
    setInputValue(prev => prev ? `${prev}\n${processed}` : processed)
    antMessage.success('已添加到对话')
  }, [])
  
  const checkServerStatus = async () => {
    try {
      const response = await kotlinApi.getStatus()
      if (response.data) {
        setServerStatusData(response.data)
        if (!response.data.installed) {
          setServerStatus('not_installed')
        } else if (response.data.running) {
          setServerStatus('running')
        } else {
          setServerStatus('installed')
        }
      } else {
        // 如果没有数据，假设服务未安装
        setServerStatus('not_installed')
        setServerStatusData(null)
      }
    } catch {
      // 发生错误，假设服务未安装
      setServerStatus('not_installed')
      setServerStatusData(null)
    }
  }

  const loadSessionStatuses = async () => {
    try {
      const response = await kotlinApi.getSessionStatus()
      if (response.data) {
         setSessionStatuses(prev => ({
           ...prev,
           ...response.data as Record<string, SessionStatus>
         }))
      }
    } catch (error) {
      console.error('获取会话状态失败', error)
    }
  }

  const loadSessions = async () => {
    // 防止重复创建会话
    if (creatingSessionRef.current) return
    
    // 获取项目路径
    let directory = '.'
    try {
      const projectPathResponse = await kotlinApi.getProjectPath()
      if (projectPathResponse.data?.path) {
        directory = projectPathResponse.data.path
      }
    } catch (error) {
      console.warn('获取项目路径失败，使用默认目录:', error)
    }
    
    const response = await kotlinApi.getSessions()
     if (response.data) {
       let sessionListTemp = response.data
       let sessionList = []
       
       // 路径标准化函数，统一使用正斜杠
       const normalizePath = (path: string | undefined) => {
         if (!path || path === '.') return path
         return path.replace(/\\/g, '/')
       }
       
       const normalizedDirectory = normalizePath(directory)
       
       for(let i=0;i<sessionListTemp.length;i++){
         const sessionDir = sessionListTemp[i]['directory']
         if (sessionDir && normalizedDirectory === normalizePath(sessionDir)) {
           sessionList.push(sessionListTemp[i])
         }
       }

       setSessions(sessionList)
       // 加载会话状态
       await loadSessionStatuses()
      
      // 检查当前会话是否仍然存在
      if (currentSessionId && !sessionList.find(s => s.id === currentSessionId)) {
        // 当前会话已不存在，清除它
        setCurrentSessionId(null)
      }
      
      if (!currentSessionId) {
        // 排除子会话，只选择主会话
        const mainSessions = sessionList.filter(s => !s.parentID)
        if (mainSessions.length > 0) {
          // 有主会话但未选择，选择第一个主会话
          setCurrentSessionId(mainSessions[0].id)
        } else if (sessionList.length > 0) {
          // 没有主会话但有子会话，选择第一个会话
          setCurrentSessionId(sessionList[0].id)
        } else {
          // 没有会话，自动创建一个新会话
          creatingSessionRef.current = true
          try {
            const createResponse = await kotlinApi.createSession()
            if (createResponse.data) {
              const newSession = createResponse.data
              setSessions(prev => [newSession, ...prev])
               setCurrentSessionId(newSession.id)
               setRevertedMessageId(null)
              antMessage.success('已自动创建新会话')
            } else {
              antMessage.error('自动创建会话失败：' + (createResponse.error || '未知错误'))
            }
          } catch (error) {
            console.error('自动创建会话失败', error)
            antMessage.error('自动创建会话失败')
          } finally {
            creatingSessionRef.current = false
          }
        }
      }
    }
   }



   const handleSaveSessionTitle = async () => {
    if (!currentSessionId || !sessionTitleInput.trim()) {
      setEditingSessionTitle(false)
      setSessionTitleInput('')
      return
    }

    try {
        // 获取当前项目目录
        const projectPathResponse = await kotlinApi.getProjectPath()
        let directory = projectPathResponse.data?.path
        
        // 如果获取项目路径失败，使用当前目录 '.' 作为默认值
        if (projectPathResponse.error || !directory) {
          console.warn('获取项目路径失败，使用默认目录:', projectPathResponse.error)
          directory = '.'
        }
        
        // 更新会话标题
        const response = await kotlinApi.updateSession(currentSessionId, sessionTitleInput.trim(), directory)
        if (!response.error) {
          // 更新本地sessions状态
          setSessions(prev => prev.map(session => 
            session.id === currentSessionId 
              ? { ...session, title: sessionTitleInput.trim() }
              : session
          ))
          antMessage.success('会话标题已更新')
        } else {
          antMessage.error('更新失败：' + (response.error || '未知错误'))
        }
      } catch (error) {
        console.error('保存会话标题失败', error)
        antMessage.error('保存失败')
      } finally {
       setEditingSessionTitle(false)
       setSessionTitleInput('')
     }
   }

  const loadSkills = async () => {
    try {
      // 先从 OpenCode /command 端点加载技能基本信息
      const response = await kotlinApi.getCommands()
      if (response.data && Array.isArray(response.data)) {
        // 再从后端文件系统获取技能的 scope 信息
        let scopeMap: Record<string, string> = {}
        try {
          const scopeResponse = await kotlinApi.getAllSkills()
          if (scopeResponse.data?.skills && Array.isArray(scopeResponse.data.skills)) {
            scopeResponse.data.skills.forEach((s: any) => {
              scopeMap[s.id] = s.scope || 'project'
            })
          }
        } catch { /* ignore */ }
        
        // 过滤出 source 为 'skill' 的项目
        const skillItems = response.data.filter((item: any) => item.source === 'skill')
        const skillsList = skillItems.map((item: any) => ({
          id: `skill-${item.name}`,
          name: item.name || 'unnamed',
          description: item.description || '',
          content: item.template || '',
          enabled: true,
          scope: (scopeMap[item.name] || 'project') as 'project' | 'global',
        }))
        setSkills(skillsList)
        setSettings(prev => ({
          ...prev,
          skills: skillsList
        }))
        return
      }
    } catch (error) {
      console.warn('从 /command 端点加载技能失败:', error)
    }

    // 回退到旧方法
    try {
      const response = await kotlinApi.getAllSkills()
      if (response.data?.skills && Array.isArray(response.data.skills)) {
        const skillsList = response.data.skills.map((skill: any) => ({
          id: `skill-${skill.id || skill.name}`,
          name: skill.name || skill.id || 'unnamed',
          description: skill.description || '',
          content: skill.content || '',
          enabled: true,
          scope: skill.scope || 'project',
        }))
        setSkills(skillsList)
        setSettings(prev => ({
          ...prev,
          skills: skillsList
        }))
      }
    } catch (error) {
      console.error('加载技能失败:', error)
      setSkills([])
      setSettings(prev => ({
        ...prev,
        skills: []
      }))
    }
  }

  const loadMCPServers = async () => {
    const response = await kotlinApi.getMCPServers()
    if (response.data) {
      const mcpList = Object.entries(response.data).map(([name, config]: [string, any]) => {
        const enabled = config.enabled !== undefined ? config.enabled : config.status === 'running'
        const type = config.type || (config.url ? 'remote' : 'local')
        return {
          id: `mcp-${name}`,
          name,
          url: config.url || '',
          enabled,
          type,
          command: config.command,
          environment: config.environment,
          headers: config.headers,
          oauth: config.oauth,
          timeout: config.timeout,
        }
      })
      setSettings(prev => ({ ...prev, mcpServers: mcpList }))
    }
  }

  // 加载问询数据
  const loadQuestions = async () => {
    try {
      const response = await kotlinApi.getQuestions()
      if (response.data && Array.isArray(response.data)) {
        // 过滤当前会话的问询
        const sessionQuestions = response.data.filter((q: any) => q.sessionID === currentSessionId)
        setQuestionRequests(sessionQuestions)
        // 如果没有当前问询且有问询存在，设置第一个为当前问询
        if (!currentQuestion && sessionQuestions.length > 0) {
          setCurrentQuestion(sessionQuestions[0])
          setCurrentQuestionIndex(0)
          setSelectedAnswers([])
          setCustomAnswers([])
        }
      }
     } catch (error) {
       console.error('加载问询失败:', error)
     }
   }

   // 加载权限请求数据
   const loadPermissions = async () => {
     try {
       // 获取项目路径
       const projectPathResponse = await kotlinApi.getProjectPath()
       if (projectPathResponse.data) {
         const directory = projectPathResponse.data.path
         const response = await kotlinApi.getPermissions(directory)
         if (response.data && Array.isArray(response.data)) {
           // 过滤当前会话的权限请求
           const sessionPermissions = response.data.filter((p: any) => p.sessionID === currentSessionId)
           setPermissionRequests(sessionPermissions)
           // 如果没有当前权限请求且有权限请求存在，设置第一个为当前权限请求
           if (!currentPermission && sessionPermissions.length > 0) {
             setCurrentPermission(sessionPermissions[0])
           }
         }
       }
     } catch (error) {
       console.error('加载权限请求失败:', error)
     }
   }

      const loadMessages = async (sessionId: string, limit?: number, append = false) => {
 
       const currentLimit = limit || messageLimit
       setLoadingMoreMessages(true)
       if (append) {
         setLoadingHistory(true)
 
       }
       try {
        const response = await kotlinApi.getMessages(sessionId, currentLimit)
        if (response.data) {
          const formattedMessages: Message[] = response.data.map((item: any) => {
            // 提取思考链内容 (reasoning parts)
            const reasoningParts = item.parts?.filter((p: any) => p.type === 'reasoning') || []
            const thoughtSteps: ThoughtStep[] = reasoningParts.map((p: any, index: number) => ({
              id: p.id || `reason-${index}`,
              description: p.text || p.content || '',
              status: 'completed' as const,
              messageId: item.info?.id
            }))

            // 提取文本内容 (text parts)
            const textParts = item.parts?.filter((p: any) => p.type === 'text') || []
            const content = textParts.map((p: any) => p.text || p.content || '').join('\n') || ''

            // 转换所有parts为MessagePart格式
            const parts: MessagePart[] = item.parts?.map((p: any) => ({
              id: p.id || '',
              type: p.type,
              content: p.text || p.content || '',
              time: p.time,
              // tool类型特有字段
              callID: p.callID,
              tool: p.tool,
              state: p.state
            })) || []

            // 确定消息状态：如果有错误信息，则为error；否则为success
            const hasError = item.info?.error !== undefined
            const messageStatus = hasError ? 'error' as const : 'success' as const
            
            return {
              id: item.info?.id || `msg-${Date.now()}`,
              content: content,
              role: item.info?.role === 'user' ? 'user' : 'assistant',
              timestamp: item.info?.time?.created || item.info?.createdAt || Date.now(),
              status: messageStatus,
              errorInfo: hasError ? {
                name: item.info.error.name || 'MessageAbortedError',
                data: item.info.error.data || { message: 'The operation was aborted.' }
              } : undefined,
              thoughtChain: thoughtSteps.length > 0 ? {
                steps: thoughtSteps,
                expanded: false,
              } : undefined,
              parentID: item.info?.parentID,
              parts: parts.length > 0 ? parts : undefined
            }
          })
          
          if (append) {
            // 追加消息，去除重复
            const existingIds = new Set(messages.map(m => m.id))
            const newMessages = formattedMessages.filter(m => !existingIds.has(m.id))
            setMessages(prev => [...newMessages, ...prev])
          } else {
            setMessages(formattedMessages)
          }
          
          // 从最新消息中提取智能体和模型设置
          const assistantMessages = response.data.filter((item: any) => item.info?.role === 'assistant')
          if (assistantMessages.length > 0) {
            // 按创建时间排序，最新的在前
            assistantMessages.sort((a: any, b: any) => {
              const timeA = a.info?.time?.created || 0
              const timeB = b.info?.time?.created || 0
              return timeB - timeA
            })
            const latestMessage = assistantMessages[0]
            const info = latestMessage.info
            
            // 设置智能体模式
            if (info.agent === 'plan' || info.agent === 'build') {
              setChatMode(info.agent)
            }
            
            // 设置模型和提供商
            if (info.providerID && info.modelID) {
              setSelectedProvider(info.providerID)
              setSelectedModel(info.modelID)
            }
          }
          
          // 检查是否有更多消息
          setHasMoreMessages(response.data.length >= currentLimit)
        }
        } catch (error) {
          console.error('Failed to load messages:', error)
        } finally {
          setLoadingMoreMessages(false)
          setLoadingHistory(false)

        }
    }

    const loadMoreMessages = async () => {
      if (!currentSessionId || loadingMoreMessages) return
      const newLimit = messageLimit + 5
      setMessageLimit(newLimit)
      await loadMessages(currentSessionId, newLimit, true)
    }



    // 转换后端todo格式为前端Todo格式
    const convertBackendTodo = (backendTodo: BackendTodo, index: number): Todo => {
      return {
        id: backendTodo.id || generateTodoId(backendTodo.content) || `todo-${index}`,
        title: backendTodo.content,
        description: `优先级: ${backendTodo.priority === 'high' ? '高' : backendTodo.priority === 'medium' ? '中' : '低'}`,
        status: backendTodo.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: currentSessionId || ''
      }
    }

    const loadTodos = async (sessionId: string) => {
      try {
        const response = await kotlinApi.getSessionTodos(sessionId)
        if (response.data && Array.isArray(response.data)) {
          // 转换后端数据格式 - 后端返回 {content, status, priority}
          const convertedTodos = response.data.map((item: any, index: number) => {
            const backendTodo: BackendTodo = {
              content: item.content || item.title || '',
              status: item.status || 'pending',
              priority: item.priority || 'medium',
              id: item.id
            }
            return convertBackendTodo(backendTodo, index)
          })
          setTodos(convertedTodos)
        } else {
          setTodos([])
        }
      } catch (error) {
        console.error('加载待办事项失败', error)
        setTodos([])
      }
    }

  // 执行回滚操作
  const executeRevert = useCallback(async (messageId: string, partId?: string, messageContent?: string) => {
    if (!currentSessionId) return
    
    try {
      const response = await kotlinApi.revertMessage(currentSessionId, messageId, partId)
      if (response.data) {
        antMessage.success('已回滚到该消息状态')
        
        // 设置回滚的消息ID
        setRevertedMessageId(messageId)
        
        // 将消息内容放入输入框
        if (messageContent) {
          setInputValue(messageContent)
        }
        
        // 重新加载消息
        await loadMessages(currentSessionId)
        
        // 保持回滚状态以在前端隐藏消息
        // setRevertedMessageId(null)
        
        // 获取session信息以了解哪些消息被回滚
        try {
          const sessionResponse = await kotlinApi.getSession(currentSessionId)
          if (sessionResponse.data) {
            // TODO: 从session数据中解析已回滚的消息ID

          }
        } catch (error) {
          console.error('获取session信息失败:', error)
        }
      } else {
        antMessage.error('回滚失败：' + (response.error || '未知错误'))
      }
    } catch (error) {
      console.error('回滚失败', error)
      antMessage.error('回滚失败')
    }
  }, [currentSessionId, kotlinApi, loadMessages, antMessage])

  // 回滚到指定消息 (旧函数，保持兼容性)
  const handleRevertMessage = useCallback(async (messageId: string, partId?: string) => {
    await executeRevert(messageId, partId)
  }, [executeRevert])

  // 分叉会话
  const handleForkSession = useCallback(async (messageId?: string) => {
    if (!currentSessionId) return
    
    try {
      const response = await kotlinApi.forkSession(currentSessionId, messageId)
       if (response.data) {
        const newSession = response.data
        // 添加新会话到列表
        setSessions(prev => [newSession, ...prev])
        // 切换到新会话
        setCurrentSessionId(newSession.id)
        setMessages([])
        setRevertedMessageId(null)
        antMessage.success('会话已分叉')
      } else {
        antMessage.error('分叉失败：' + (response.error || '未知错误'))
      }
    } catch (error) {
      console.error('分叉失败', error)
      antMessage.error('分叉失败')
    }
  }, [currentSessionId, kotlinApi, setSessions, setCurrentSessionId, setMessages, antMessage])

  // 更新会话活跃状态和状态
  const updateSessionActivity = () => {
    if (!currentSessionId) return
    
    // 检查当前会话的消息状态
    const hasLoadingMessages = messages.some(msg => msg.status === 'loading')
    
    setActiveSessions(prev => {
      const newSet = new Set(prev)
      if (hasLoadingMessages) {
        newSet.add(currentSessionId)
      } else {
        newSet.delete(currentSessionId)
      }
      return newSet
    })
    
    // 会话状态现在由后端和SSE事件管理，本地只更新activeSessions
  }

  // 监听消息变化，更新会话活跃状态
  useEffect(() => {
    updateSessionActivity()
  }, [messages, currentSessionId])

  // AI 会话从忙碌变为空闲时，通知 IDEA 刷新文件系统
  const prevSessionStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!currentSessionId) return
    const currentStatus = sessionStatuses[currentSessionId]?.type
    const prevStatus = prevSessionStatusRef.current
    prevSessionStatusRef.current = currentStatus
    if (prevStatus === 'busy' && currentStatus !== 'busy' && currentStatus !== undefined) {
      console.log(`Session idle (${prevStatus} -> ${currentStatus}), triggering file system reload`)
      kotlinApi.reloadFileSystem().catch(() => {})
    }
  }, [sessionStatuses, currentSessionId])

  // 刷新当前会话
  const handleRefresh = async () => {
    if (!currentSessionId) return
    
    try {
      // 重置消息限制为5，仅显示最近的消息
      setMessageLimit(5)
      // 重新加载会话列表
      await loadSessions()
      // 重新加载当前会话的消息，只加载最近的5条
      await loadMessages(currentSessionId, 5)
      antMessage.success('已刷新')
    } catch (error) {
      console.error('刷新失败', error)
      antMessage.error('刷新失败')
    }
  }


  // 创建新会话
  const handleCreateSession = async () => {
    try {
      const response = await kotlinApi.createSession()
       if (response.data) {
        const newSession = response.data
        setSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newSession.id)
        setMessages([])
        setRevertedMessageId(null)
        antMessage.success('会话创建成功')
      } else {
        antMessage.error('创建会话失败：' + (response.error || '未知错误'))
      }
    } catch (error) {
      console.error('创建会话失败', error)
      antMessage.error('创建会话失败')
    }
  }

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const response = await kotlinApi.deleteSession(sessionId)
      if (response.data) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null)
          setMessages([])
        }
        antMessage.success('会话已删除')
      } else {
        antMessage.error('删除失败：' + (response.error || '未知错误'))
      }
    } catch (error) {
      console.error('删除会话失败', error)
      antMessage.error('删除会话失败')
    }
  }


  // 选择技能
  // 移除选中的技能
  const handleRemoveSkill = useCallback((skillId: string) => {
    setSelectedSkills(prev => prev.filter(s => s.id !== skillId))
  }, [setSelectedSkills])

  // 移除选中的MCP服务器
  const handleRemoveMCPServer = useCallback((serverId: string) => {
    setSelectedMCPServers(prev => prev.filter(m => m.id !== serverId))
  }, [setSelectedMCPServers])

  // 移除选中的文件
  const handleRemoveFile = useCallback((filePath: string) => {
    setSelectedFiles(prev => prev.filter(f => f.path !== filePath))
  }, [setSelectedFiles])

  const handleSelectSkill = useCallback((skill: any) => {
    if (skill) {
      // 直接插入到输入框，使用特殊格式
      setInputValue(prev => {
        const trimmed = prev.endsWith('@') ? prev.slice(0, -1) : prev
        return `${trimmed}[SKILL:${skill.name}] `
      })
      setShowSkillPicker(false)
    }
  }, [setInputValue, setShowSkillPicker])

  // 选择MCP
  const handleSelectMCP = useCallback((mcp: any) => {
    if (mcp) {
      // 直接插入到输入框，使用特殊格式
      setInputValue(prev => {
        const trimmed = prev.endsWith('#') ? prev.slice(0, -1) : prev
        return `${trimmed}[MCP:${mcp.name}] `
      })
      setShowMCPPicker(false)
    }
  }, [setInputValue, setShowMCPPicker])

  // 文件搜索
  const handleFileSearch = useCallback(async (query: string) => {
    setFileSearchQuery(query) // 更新搜索查询状态
    
    if (!query.trim()) {
      setFileSearchResults([])
      return
    }
    
    try {
      const response = await kotlinApi.searchFiles({
        query: query,
        searchType: fileSearchType,
        caseSensitive: fileCaseSensitive,
        exactMatch: fileExactMatch,
        fuzzyMatch: fileFuzzyMatch,
        extension: fileExtension, // 添加扩展名参数
        limit: 10
      })
      
      if (response.data?.success) {
        const fileItems: FileItem[] = response.data.results.map(result => ({
          path: result.path,
          name: result.name,
          relativePath: result.relativePath,
          type: result.type as 'file' | 'directory',
          matches: result.matches
        }))
        setFileSearchResults(fileItems)
      }
    } catch (error) {
      console.error('文件搜索失败', error)
    }
  }, [fileSearchType, fileCaseSensitive, fileExactMatch, fileFuzzyMatch, fileExtension, setFileSearchQuery, setFileSearchResults])

  // 文件搜索类型变化
  const handleFileSearchTypeChange = useCallback((type: 'filename' | 'content') => {
    setFileSearchType(type)
    if (fileSearchQuery.trim()) {
      handleFileSearch(fileSearchQuery)
    }
  }, [fileSearchQuery, handleFileSearch, setFileSearchType])

  // 文件模糊匹配变化
  const handleFileFuzzyMatchChange = useCallback((fuzzyMatch: boolean) => {
    setFileFuzzyMatch(fuzzyMatch)
    if (fuzzyMatch) {
      setFileExactMatch(false)
    }
    if (fileSearchQuery.trim()) {
      setTimeout(() => handleFileSearch(fileSearchQuery), 0)
    }
  }, [fileSearchQuery, handleFileSearch, setFileFuzzyMatch, setFileExactMatch])

  // 文件精确匹配变化
  const handleFileExactMatchChange = useCallback((exactMatch: boolean) => {
    setFileExactMatch(exactMatch)
    if (exactMatch) {
      setFileFuzzyMatch(false)
    }
    if (fileSearchQuery.trim()) {
      setTimeout(() => handleFileSearch(fileSearchQuery), 0)
    }
  }, [fileSearchQuery, handleFileSearch, setFileExactMatch, setFileFuzzyMatch])

  // 文件扩展名变化
  const handleFileExtensionChange = useCallback((extension: string) => {
    setFileExtension(extension)
    // 不立即搜索，等待用户输入完成（通过 onBlur 触发）
  }, [setFileExtension])

  // 文件大小写敏感变化
  const handleFileCaseSensitiveChange = useCallback((caseSensitive: boolean) => {
    setFileCaseSensitive(caseSensitive)
    if (fileSearchQuery.trim()) {
      handleFileSearch(fileSearchQuery)
    }
  }, [fileSearchQuery, handleFileSearch, setFileCaseSensitive])

  // 选择文件
  const handleSelectFile = useCallback((file: any) => {
    if (file) {
      // 直接插入到输入框，使用特殊格式
      const filePath = file.path || file.name
      setInputValue(prev => {
        const trimmed = prev.endsWith('/') ? prev.slice(0, -1) : prev
        return `${trimmed}[FILE:${filePath}] `
      })
      setShowFilePicker(false)
      setFileSearchQuery('')
      setFileSearchResults([])
    }
  }, [setInputValue, setShowFilePicker, setFileSearchQuery, setFileSearchResults])

  // 处理附件变化
  const handleAttachmentChange = (info: any) => {
    // 移除输入框中指定uid的标签（FILE或IMAGE格式）
    const removeTagByUid = (uid: string) => {
      setInputValue(prev => {
        let result = prev
        // 移除 [FILE:uid:filename] 格式
        result = result.replace(new RegExp(`\\[FILE:${uid}:[^\\]]+\\]\\u200B?`), '')
        // 移除 [IMAGE:uid:filename] 格式
        result = result.replace(new RegExp(`\\[IMAGE:${uid}:[^\\]]+\\]\\u200B?`), '')
        return result
      })
    }

    // Attachments组件删除时会传入fileList
    if (Array.isArray(info)) {
      // 从旧列表中找出被删除的uid
      const removedUids = attachments
        .filter(att => !info.some((item: any) => item.uid === att.uid))
        .map(att => att.uid)
      
      setAttachments(info)
      
      // 同步删除输入框中的标签
      removedUids.forEach(removeTagByUid)
    } else if (info?.file) {
      // 单个文件操作
      const { file, fileList } = info
      setAttachments(fileList || [])
      
      if (file.status === 'removed' || fileList?.length < attachments.length) {
        removeTagByUid(file.uid)
      }
    }
  }







  // 会话列表


  // 处理输入变化 - 只更新输入值，性能优化
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
  }, [setInputValue])

  // 处理模型选择变化
  const handleProviderModelChange = useCallback((providerId: string | null, modelId: string | null) => {
    setSelectedProvider(providerId || null)
    setSelectedModel(modelId || null)
  }, [setSelectedProvider, setSelectedModel])
  
  // 计算当前选中模型是否支持推理
  const modelReasoningCapable = useMemo(() => {
    if (!selectedProvider || !selectedModel) return false
    const provider = providers.find(p => p.id === selectedProvider)
    if (!provider || !provider.models) return false
    const model = provider.models[selectedModel]
    return model?.reasoning === true || model?.capabilities?.reasoning === true
  }, [selectedProvider, selectedModel, providers])
  
  // 计算当前选中模型支持的模态类型
  const modelModalities = useMemo(() => {
    if (!selectedProvider || !selectedModel) return { input: ['text'], output: ['text'] }
    const provider = providers.find(p => p.id === selectedProvider)
    if (!provider || !provider.models) return { input: ['text'], output: ['text'] }
    const model = provider.models[selectedModel]
    // 优先使用 modalities，回退到 capabilities
    if (model?.modalities?.input) return model.modalities
    if (model?.capabilities?.input) {
      const inputTypes: string[] = ['text']
      if (model.capabilities.input.image) inputTypes.push('image')
      if (model.capabilities.input.audio) inputTypes.push('audio')
      if (model.capabilities.input.video) inputTypes.push('video')
      if (model.capabilities.input.pdf) inputTypes.push('pdf')
      return { input: inputTypes, output: ['text'] }
    }
    return { input: ['text'], output: ['text'] }
  }, [selectedProvider, selectedModel, providers])

  // 处理右键文件信息移除
  const handleRemoveRightClickFileInfo = useCallback(() => {
    setRightClickFileInfo(undefined)
  }, [setRightClickFileInfo])

  // 处理技能按钮点击
  const handleSkillButtonClick = useCallback(() => {
    setShowSkillPicker(prev => !prev)
    setShowMCPPicker(false)
    setShowFilePicker(false)
  }, [setShowSkillPicker, setShowMCPPicker, setShowFilePicker])

  // 处理MCP按钮点击
  const handleMCPButtonClick = useCallback(() => {
    setShowMCPPicker(prev => !prev)
    setShowSkillPicker(false)
    setShowFilePicker(false)
  }, [setShowSkillPicker, setShowMCPPicker, setShowFilePicker])

  // 处理文件按钮点击
  const handleFileButtonClick = useCallback(() => {
    setShowFilePicker(prev => !prev)
    setShowSkillPicker(false)
    setShowMCPPicker(false)
  }, [setShowSkillPicker, setShowMCPPicker, setShowFilePicker])

  // 同步附件列表：当用户在输入框中删除文件/图片标签时，同步清除attachments
  useEffect(() => {
    if (attachments.length === 0) return
    // 提取当前inputValue中所有FILE和IMAGE标签的uid
    const tagUids = new Set<string>()
    const fileRegex = /\[FILE:([^:]+):/g
    const imageRegex = /\[IMAGE:([^:]+):/g
    let match
    while ((match = fileRegex.exec(inputValue)) !== null) {
      tagUids.add(match[1])
    }
    while ((match = imageRegex.exec(inputValue)) !== null) {
      tagUids.add(match[1])
    }
    // 过滤掉已不存在的附件
    const remaining = attachments.filter(att => tagUids.has(att.uid))
    if (remaining.length !== attachments.length) {
      setAttachments(remaining)
    }
  }, [inputValue, attachments, setAttachments])

  // 替换占位符为哨兵包裹的实际内容
  const replacePlaceholders = useCallback((text: string): string => {
    // 处理长文本占位符
    let result = text.replace(/\[LONG_TEXT:([^:]+):([^\]]+)\]/g, (_match, id, _label) => {
      const fullText = longTextMap[id]
      if (fullText) {
        return `${LONG_TEXT_START}${fullText}${LONG_TEXT_END}`
      }
      return _match
    })
    
    // 处理技能占位符 [SKILL:name] → [SKILL_START]使用xxx技能|SKILL|xxx技能[SKILL_END]
    result = result.replace(/\[SKILL:([^\]]+)\]/g, (_match, name) => {
      return `${SKILL_START}使用${name}技能|SKILL|${name}${SKILL_END}`
    })
    
    // 处理MCP占位符 [MCP:name] → [MCP_START]使用xxx服务|MCP|xxx服务[MCP_END]
    result = result.replace(/\[MCP:([^\]]+)\]/g, (_match, name) => {
      return `${MCP_START}使用${name}服务|MCP|${name}${MCP_END}`
    })
    
    // 处理文件占位符 [FILE:uid:filename] → [FILE_START]filename|mime|truncatedData[FILE_END]
    result = result.replace(/\[FILE:([^:]+):([^\]]+)\]/g, (_match, uid, filename) => {
      const att = attachments.find(a => a.uid === uid)
      if (att && att.url) {
        const mime = att.mimeType || att.file?.type || 'application/octet-stream'
        const base64Match = att.url.match(/^data:[^;]+;base64,(.+)$/)
        const truncatedData = base64Match ? base64Match[1].substring(0, 36) : ''
        return `${FILE_START}${filename}|${mime}|${truncatedData}${FILE_END}`
      }
      return `${FILE_START}${filename}${FILE_END}`
    })
    
    // 处理图片占位符 [IMAGE:uid:filename] → [IMAGE_START]filename|mime|truncatedData[IMAGE_END]
    result = result.replace(/\[IMAGE:([^:]+):([^\]]+)\]/g, (_match, uid, filename) => {
      const att = attachments.find(a => a.uid === uid)
      if (att && att.url) {
        const mime = att.mimeType || att.file?.type || 'image/png'
        const base64Match = att.url.match(/^data:[^;]+;base64,(.+)$/)
        const truncatedData = base64Match ? base64Match[1].substring(0, 36) : ''
        return `${IMAGE_START}${filename}|${mime}|${truncatedData}${IMAGE_END}`
      }
      return `${IMAGE_START}${filename}${IMAGE_END}`
    })
    
    return result
  }, [longTextMap, attachments])
  
  // 发送消息
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !currentSessionId || isSending) return
    
    // 校验附件类型是否被当前模型支持
    if (attachments.length > 0) {
      const supportedInputTypes = modelModalities.input || ['text']
      const unsupportedFiles: string[] = []
      
      attachments.forEach(att => {
        const mime = att.mimeType || att.file?.type || ''
        let fileType = 'file'
        if (mime.startsWith('image/')) fileType = 'image'
        else if (mime.startsWith('video/')) fileType = 'video'
        else if (mime.startsWith('audio/')) fileType = 'audio'
        else if (mime === 'application/pdf') fileType = 'pdf'
        
        // 检查是否支持该类型
        if (!supportedInputTypes.includes(fileType) && !supportedInputTypes.includes('file')) {
          unsupportedFiles.push(`${att.name} (${fileType})`)
        }
      })
      
      if (unsupportedFiles.length > 0) {
        antMessage.error(`当前模型不支持以下文件类型，请删除后重试：${unsupportedFiles.join('、')}`)
        return
      }
    }
    
    setIsSending(true)
    
    // 将占位符转换为哨兵标签，用于气泡显示（processTags 识别哨兵标签）
    const displayContent = replacePlaceholders(inputValue).trim()
    const tempUserId = `temp-user-${Date.now()}`
    // 清空输入框
    setInputValue('')
    
    // 预创建临时用户消息，SSE会更新ID和状态，但保留content（含哨兵标签）
    setMessages(prev => [...prev, {
      id: tempUserId,
      role: 'user',
      content: displayContent,
      status: 'loading',
      timestamp: Date.now(),
    }])
    
    // 收集附件内容 - 所有文件都作为file parts发送
    const attachmentParts: any[] = []
    if (attachments.length > 0) {
      attachments.forEach(att => {
        if (att.url) {
          attachmentParts.push({
            type: 'file',
            mime: att.mimeType || att.file?.type || 'application/octet-stream',
            url: att.url,
            filename: att.name,
          })
        }
      })
      // 清空附件列表
      setAttachments([])
    }
    
    // 重置回滚状态，因为用户正在发送新消息
    setRevertedMessageId(null)
    
    // 发送消息后强制滚动到底部
    forceScrollToBottom()
    
    try {
      const modelString = selectedProvider && selectedModel ? `${selectedProvider}/${selectedModel}` : undefined
      
      // 组装消息parts：文本 + 文件附件
      const parts = [{ type: 'text', text: displayContent }, ...attachmentParts]
      
      const response = await kotlinApi.sendMessage(
        currentSessionId, 
        parts,
        modelString,
        chatMode,
        modelReasoningCapable ? reasoningEffort : undefined
      )

      if (!response.error) {
        // 消息会通过 SSE 接收
      } else {
        console.error('Message send failed:', response.error)
        antMessage.error('发送失败：' + (response.error || '未知错误'))
        // 发送失败可能是服务未运行，刷新状态
        checkServerStatus()
      }
    } catch (error) {
      console.error('发送消息失败', error)
      antMessage.error('发送失败')
      checkServerStatus()
    } finally {
      // 等待SSE事件通过会话状态来更新发送状态
      // 当收到 session.status 或 message.updated 事件后会自动清除
    }
  }, [inputValue, currentSessionId, isSending, selectedProvider, selectedModel, chatMode, attachments, setIsSending, setInputValue, setRevertedMessageId, setAttachments, setMessages, antMessage, kotlinApi, forceScrollToBottom, replacePlaceholders])

   // 跳转到子会话
   const handleGoToSession = (sessionId: string) => {
     // 设置父会话ID为当前会话
     if (currentSessionId) {
       setParentSessionId(currentSessionId)
     }
     // 切换到子会话
     setCurrentSessionId(sessionId)
     // 清空当前消息
     setMessages([])
     // 加载子会话的消息
     loadMessages(sessionId)
   }

   // 返回父会话
   const handleBackToParentSession = () => {
     if (parentSessionId) {
       setCurrentSessionId(parentSessionId)
       setParentSessionId(null)
       // 加载父会话的消息
       loadMessages(parentSessionId)
     }
   }

   // 取消发送
    const handleCancel = useCallback(async () => {
     if (currentSessionId) {
       try {
         await kotlinApi.abortSession(currentSessionId)
         antMessage.success('会话已中止')
       } catch (error) {
         console.error('中止会话失败:', error)
         antMessage.error('中止会话失败')
       }
     }
     setIsSending(false)
   }, [currentSessionId, setIsSending])

   // 处理粘贴文本（长文本转换为占位符）
  const handlePasteText = useCallback((text: string): string => {
    // 检查文本长度是否超过阈值
    if (text.length <= LONG_TEXT_THRESHOLD) {
      return text
    }
    
    // 生成唯一ID
    const id = `long_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    
    // 同时更新ref和state，确保renderTextToDOM能立即访问到
    longTextMapRef.current = { ...longTextMapRef.current, [id]: text }
    setLongTextMap(prev => ({
      ...prev,
      [id]: text
    }))
    
    // 生成预览文本（前15个字符），编码后放入占位符避免]等特殊字符干扰正则
    const preview = text.substring(0, 15).replace(/\n/g, ' ') + '...'
    const charCount = text.length
    const label = encodeURIComponent(`📄 ${preview} (${charCount}字)`)
    
    // 返回占位符（包含ID和编码后的标签）
    return `${LONG_TEXT_PREFIX}${id}:${label}${LONG_TEXT_SUFFIX}`
  }, [])
  
  // 处理粘贴文件 - 所有文件都转为base64存储到attachments
  const handlePasteFile = useCallback((files: FileList) => {
    if (!files || files.length === 0) return
    
    // 先同步插入所有文件的span标签到输入框
    const fileEntries: Array<{uid: string, name: string, file: File}> = []
    Array.from(files).forEach(file => {
      const uid = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      fileEntries.push({ uid, name: file.name, file })
    })
    
    // 同步更新inputValue
    const tags = fileEntries.map(e => `[FILE:${e.uid}:${e.name}]`).join(' ')
    setInputValue(prev => `${prev}${tags} `)
    
    // 异步读取文件内容并更新attachments
    fileEntries.forEach(({ uid, name, file }) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        const newAttachment = {
          uid,
          name,
          status: 'done' as const,
          url: base64,
          size: file.size,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          file,
          mimeType: file.type || 'application/octet-stream',
        }
        setAttachments(prev => [...prev, newAttachment])
      }
      reader.readAsDataURL(file)
    })
  }, [setAttachments, setInputValue])

   // OpenCode 交互处理函数
    const handlePermissionReply = async (reply: 'once' | 'always' | 'reject') => {
      if (!currentPermission) return
      try {
        const sessionId = currentPermission.sessionID
        if (!sessionId) {
          antMessage.error('权限请求缺少会话ID')
          return
        }
        const remember = reply === 'always'
        const response = await kotlinApi.setSessionPermission(sessionId, currentPermission.id, reply, remember)
         if (response.data) {
           antMessage.success('权限响应已发送')
           // 移除当前权限请求，并设置下一个请求为当前
           setPermissionRequests(prev => {
             const remaining = prev.filter(req => req.id !== currentPermission.id)
             // 如果有剩余的请求，设置第一个为当前
             if (remaining.length > 0 && remaining[0].id !== currentPermission.id) {
               setCurrentPermission(remaining[0])
               setPermissionMessage('')
             } else {
               setCurrentPermission(null)
               setPermissionMessage('')
             }
             return remaining
           })
        } else {
          antMessage.error('响应失败: ' + (response.error || '未知错误'))
        }
      } catch (error) {
        console.error('权限响应失败', error)
        antMessage.error('响应失败')
      }
    }

   const handleAnswerChange = (questionIdx: number, optionLabel: string, checked: boolean) => {
     const newAnswers = [...selectedAnswers]
     if (!newAnswers[questionIdx]) newAnswers[questionIdx] = []
     if (checked) {
       // 单选：用新选项替换
       newAnswers[questionIdx] = [optionLabel]
       // 清空该问题的自定义答案
       const newCustom = [...customAnswers]
       newCustom[questionIdx] = ''
       setCustomAnswers(newCustom)
     }
     // 忽略取消选中（单选不能取消）
     setSelectedAnswers(newAnswers)
   }

   const handleCustomAnswerChange = (questionIdx: number, value: string) => {
     const newCustom = [...customAnswers]
     newCustom[questionIdx] = value
     setCustomAnswers(newCustom)
     // 如果用户输入自定义答案，清空该问题的预设选项
     if (value.trim()) {
       const newAnswers = [...selectedAnswers]
       newAnswers[questionIdx] = []
       setSelectedAnswers(newAnswers)
     }
   }

   const handleQuestionReply = async () => {
     if (!currentQuestion) return
     try {
       // 校验所有问题都有答案
       for (let idx = 0; idx < currentQuestion.questions.length; idx++) {
         const selected = selectedAnswers[idx] || []
         const custom = customAnswers[idx]
         if ((!selected || selected.length === 0) && (!custom || !custom.trim())) {
           antMessage.error(`请回答问题 ${idx + 1}`)
           setCurrentQuestionIndex(idx)
           return
         }
       }
       
       // 合并选项选择和自定义输入
       const answers = currentQuestion.questions.map((_q: any, idx: number) => {
         const selected = selectedAnswers[idx] || []
         const custom = customAnswers[idx]
         if (custom && custom.trim()) {
           return [custom]
         }
         return selected
       })
       const response = await kotlinApi.replyQuestion(currentQuestion.id, answers)
       if (response.data) {
         antMessage.success('回答已发送')
         setQuestionRequests(prev => prev.filter(req => req.id !== currentQuestion.id))
         setShowQuestionModal(false)
         setCurrentQuestion(null)
         setSelectedAnswers([])
         setCustomAnswers([])
       } else {
         antMessage.error('回答失败: ' + (response.error || '未知错误'))
       }
     } catch (error) {
       console.error('问题回答失败', error)
       antMessage.error('回答失败')
     }
   }

  const handleQuestionReject = async () => {
    if (!currentQuestion) return
    try {
      const response = await kotlinApi.rejectQuestion(currentQuestion.id)
      if (response.data) {
        antMessage.success('已拒绝回答')
        setQuestionRequests(prev => prev.filter(req => req.id !== currentQuestion.id))
        setShowQuestionModal(false)
        setCurrentQuestion(null)
        setCurrentQuestionIndex(0)
        setSelectedAnswers([])
        setCustomAnswers([])
        // 如果有其他问询，设置下一个为当前问询
        const remaining = questionRequests.filter(req => req.id !== currentQuestion.id)
        if (remaining.length > 0) {
          setCurrentQuestion(remaining[0])
          setCurrentQuestionIndex(0)
          setSelectedAnswers([])
          setCustomAnswers([])
        }
      } else {
        antMessage.error('拒绝失败: ' + (response.error || '未知错误'))
      }
    } catch (error) {
      console.error('问题拒绝失败', error)
      antMessage.error('拒绝失败')
    }
  }

  // 问询导航函数
  const handleNextQuestion = () => {
    if (currentQuestion && currentQuestionIndex < currentQuestion.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }




  // 回滚确认Modal
  const revertConfirmModal = (
    <Modal
      title="确认回滚"
      centered
      open={revertModalVisible}
      onOk={() => {
        if (pendingRevertMessage) {
          executeRevert(pendingRevertMessage.id, pendingRevertMessage.partId, pendingRevertMessage.content)
        }
        setRevertModalVisible(false)
        setPendingRevertMessage(null)
      }}
      onCancel={() => {
        setRevertModalVisible(false)
        setPendingRevertMessage(null)
      }}
      okText="确认回滚"
      cancelText="取消"
      okType="danger"
    >
      <p>确认回滚到此消息？该操作不可撤销。</p>
      {pendingRevertMessage && (
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          backgroundColor: 'var(--bg-tertiary)', 
          borderRadius: 6,
          maxHeight: 200,
          overflow: 'auto'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>消息内容：</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{pendingRevertMessage.content || '(空内容)'}</div>
        </div>
      )}
    </Modal>
   )

    // 当前会话状态
    const currentSessionStatus = currentSessionId ? sessionStatuses[currentSessionId] || { type: 'idle' } : null
    // 发送按钮加载状态（包括消息发送中和会话忙碌/重试状态）
    const isSendLoading = isSending || (currentSessionStatus ? (currentSessionStatus.type === 'busy' || currentSessionStatus.type === 'retry') : false)

  // 监听会话状态变化，当会话变为非忙碌状态时清除发送状态
  React.useEffect(() => {
    if (!isSending) return
    const status = currentSessionId ? sessionStatuses[currentSessionId] : null
    if (status && status.type !== 'busy' && status.type !== 'retry') {
      setIsSending(false)
    }
  }, [sessionStatuses, currentSessionId, isSending])

   return (
    <>
      {revertConfirmModal}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-secondary)',
          position: 'relative',
        }}
      >

      {/* Toolbar */}
      <TopToolbar
        serverStatus={serverStatus}
        serverStatusData={serverStatusData || undefined}
        onServiceRestart={async () => {
          setSseReconnectKey(k => k + 1)
          try {
            await kotlinApi.restartService()
            antMessage.success('服务重启成功')
          } catch (error) {
            antMessage.error('重启服务失败')
          }
        }}
        isDark={isDark}
        onThemeChange={onThemeChange}
        handleRefresh={handleRefresh}
        tokenUsage={tokenUsage}
        contextUsage={contextUsage}
        setTokenUsage={setTokenUsage}
        setContextUsage={setContextUsage}
        permissionRequests={permissionRequests}
        questionRequests={questionRequests}
        setCurrentPermission={setCurrentPermission}
        setCurrentQuestion={setCurrentQuestion}
        setShowQuestionModal={setShowQuestionModal}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        setShowSettings={setShowSettings}
        handleCreateSession={handleCreateSession}
        sessions={sessions}
         currentSessionId={currentSessionId}
         currentSessionStatus={currentSessionStatus}
         editingSessionTitle={editingSessionTitle}
        sessionTitleInput={sessionTitleInput}
        setSessionTitleInput={setSessionTitleInput}
        setEditingSessionTitle={setEditingSessionTitle}
         handleSaveSessionTitle={handleSaveSessionTitle}
       />
       
       {/* 返回父会话按钮（当处于子会话时） */}
       {parentSessionId && (
         <div style={{
           display: 'flex',
           alignItems: 'center',
           padding: '8px 12px',
           borderBottom: '1px solid var(--border-color)',
           backgroundColor: 'var(--bg-tertiary)'
         }}>
           <Button
             type="text"
             icon={<ArrowLeftOutlined />}
             onClick={handleBackToParentSession}
             style={{ color: 'var(--text-secondary)' }}
           >
             返回父会话
           </Button>
           <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
             当前为子智能体会话
           </span>
         </div>
       )}
       
        {/* 历史会话面板 */}
       <SessionHistoryPanel
         showHistory={showHistory}
         sessions={sessions.filter(s => !s.parentID)}
         currentSessionId={currentSessionId}
         activeSessions={activeSessions}
         sessionStatuses={sessionStatuses}
         onSessionChange={setCurrentSessionId}
         onClose={() => setShowHistory(false)}
         onDeleteSession={handleDeleteSession}
         onRevertedMessageIdReset={() => setRevertedMessageId(null)}
       />

       {/* Chat Area */}
       <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatArea
              ref={chatAreaRef}
              messages={messages}
              revertedMessageId={revertedMessageId}
              hasMoreMessages={hasMoreMessages}
              loadingMoreMessages={loadingMoreMessages}
              isDark={isDark}
              scrollRef={scrollRef}
              loadMoreMessages={loadMoreMessages}
              onRevertMessage={handleRevertMessage}
              onForkSession={handleForkSession}
              onGoToSession={handleGoToSession}
              skills={skills}
              mcpServers={settings.mcpServers}
              currentSessionId={currentSessionId}
              currentSessionStatus={currentSessionStatus || undefined}
            />
         
          {/* 向下箭头按钮 - 右下角，半透明 */}
          {showScrollToBottom && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                zIndex: 10,
              }}
            >
              <Button
                type="primary"
                shape="circle"
                icon={<DownCircleOutlined />}
                size="large"
                 onClick={scrollToBottom}
                style={{
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  opacity: 0.5,
                  transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
             />
           </div>
         )}
       </div>

      {/* Input Area */}
      <div
        className="chat-input-area"
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '12px',
          position: 'relative',
        }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files?.length) {
            handlePasteFile(e.dataTransfer.files)
          }
        }}
      >
        {/* 权限请求面板 */}
        {currentPermission && (
          <PermissionPanel
            permission={currentPermission}
            onPermissionReply={handlePermissionReply}
          />
        )}

        {/* 问询面板 - 只有存在当前会话的问询时显示 */}
        <QuestionPanel
          currentQuestion={currentQuestion}
          currentQuestionIndex={currentQuestionIndex}
          selectedAnswers={selectedAnswers}
          customAnswers={customAnswers}
          currentSessionId={currentSessionId}
          onAnswerChange={handleAnswerChange}
          onCustomAnswerChange={handleCustomAnswerChange}
          onQuestionReject={handleQuestionReject}
          onPrevQuestion={handlePrevQuestion}
          onNextQuestion={handleNextQuestion}
          onQuestionReply={handleQuestionReply}
        />

        {/* 待办事项面板 - 只有待办事项存在且未全部完成时显示 */}
        <TodoPanel
          todos={todos}
          todoCollapsed={todoCollapsed}
          setTodoCollapsed={setTodoCollapsed}
        />









        <FileAttachmentPanel 
          attachments={attachments} 
          onChange={handleAttachmentChange}
          onFilePaste={handlePasteFile}
        />

        {/* 如果没有问询和权限请求，显示输入区域 */}
        {!(currentQuestion || currentPermission) ? (
          <>
             {/* MessageInput 组件 */}
             {currentSessionStatus?.type === 'retry' && (
               <div style={{
                 padding: '8px 12px',
                 marginBottom: '8px',
                 backgroundColor: 'var(--warning-bg)',
                 border: '1px solid var(--warning-border)',
                 borderRadius: '6px',
                 fontSize: '12px',
                 color: 'var(--warning-text)'
               }}>
                 <div style={{ fontWeight: 'bold' }}>重连 LLM 中...</div>
                 <div>尝试次数: {currentSessionStatus.attempt}</div>
                 <div>原因: {currentSessionStatus.message}</div>
                 <div>下次重试: {currentSessionStatus.next} 秒后</div>
               </div>
             )}
             <MessageInput
              // 输入状态
              inputValue={inputValue}
               isSending={isSendLoading}
        currentSessionId={currentSessionId}
              senderRef={senderRef}
              
              // 选择器状态
              showSkillPicker={showSkillPicker}
              showMCPPicker={showMCPPicker}
              showFilePicker={showFilePicker}
              recording={recording}
              
              // 文件搜索状态
              fileSearchQuery={fileSearchQuery}
              fileSearchResults={fileSearchResults}
              fileSearchType={fileSearchType}
              fileFuzzyMatch={fileFuzzyMatch}
              fileExactMatch={fileExactMatch}
              fileExtension={fileExtension}
              fileCaseSensitive={fileCaseSensitive}
              
              // 配置状态
              chatMode={chatMode}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              autoConfirm={autoConfirm}
              // 思考强度
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={setReasoningEffort}
              modelReasoningCapable={modelReasoningCapable}
              
              // 数据源
              skills={skills}
            mcpServers={settings.mcpServers}
              selectedFiles={selectedFiles}
              selectedSkills={selectedSkills}
              selectedMCPServers={selectedMCPServers}
              providers={providers}
              
              // 回调函数
              onInputChange={handleInputChange}
              onSendMessage={handleSendMessage}
              onCancel={handleCancel}
               onPasteFile={handlePasteFile}
               onPasteText={handlePasteText}
               onRecordingChange={setRecording}
              onChatModeChange={setChatMode}
                onProviderModelChange={handleProviderModelChange}
               onAutoConfirmChange={setAutoConfirm}
               // 特殊字符按钮回调
               onSkillButtonClick={handleSkillButtonClick}
               onMCPButtonClick={handleMCPButtonClick}
               onFileButtonClick={handleFileButtonClick}
               
               // 文件搜索回调
              onFileSearch={handleFileSearch}
              onFileSearchTypeChange={handleFileSearchTypeChange}
              onFileFuzzyMatchChange={handleFileFuzzyMatchChange}
              onFileExactMatchChange={handleFileExactMatchChange}
              onFileExtensionChange={handleFileExtensionChange}
              onFileCaseSensitiveChange={handleFileCaseSensitiveChange}
              
              // 选择器回调
              onSelectSkill={handleSelectSkill}
              onSelectMCPServer={handleSelectMCP}
              onSelectFile={handleSelectFile}
               // 标签移除回调
               onRemoveSkill={handleRemoveSkill}
               onRemoveMCPServer={handleRemoveMCPServer}
               onRemoveFile={handleRemoveFile}
                 onRemoveRightClickFileInfo={handleRemoveRightClickFileInfo}
               
               // 条件显示
               hasQuestionOrPermission={!!(currentQuestion || currentPermission)}
               questionMessage={questionMessage}
               permissionMessage={permissionMessage}
               rightClickFileInfo={rightClickFileInfo}
               
               // 弹窗显示回调
               onShowLongTextModal={(_id, content) => {
                 setLongTextContent(content)
                 setLongTextModalVisible(true)
               }}
               onShowSkillInfoModal={(name, description, type) => {
                 setSkillInfoName(name)
                 setSkillInfoDescription(description)
                 setSkillInfoType(type)
                 setSkillInfoVisible(true)
               }}
               onShowImagePreviewModal={(url, name) => {
                 setImagePreviewUrl(url)
                 setImagePreviewName(name)
                 setImagePreviewVisible(true)
               }}
               onShowFileInfoModal={(name, mime, _url) => {
                 setFileInfoName(name)
                 setFileInfoMime(mime)
                 setFileInfoVisible(true)
               }}
               // longTextMap数据
               longTextMap={longTextMap}
               longTextMapRef={longTextMapRef}
               
              // 语音识别
              speechRecognitionRef={speechRecognitionRef}
            />
          </>
         ) : (
           <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
             {currentQuestion ? '请先回答问题以继续对话' : '请先处理权限请求以继续对话'}
           </div>
         )}
      </div>

      {/* Settings Dialog */}
       <SettingsDialog
         open={showSettings}
         settings={settings}
         onSettingsChange={setSettings}
         isDark={isDark}
         onThemeChange={onThemeChange}
         onClose={() => {
           setShowSettings(false)
           // 关闭设置对话框时重新加载提供商，确保模型列表最新
           loadProviders()
         }}
          onServiceRestart={async () => {
            // 重启服务后强制重连SSE
            setSseReconnectKey(k => k + 1)
            // 刷新所有数据
            await loadProviders()
            await loadSkills()
            await loadMCPServers()
          }}
         onProvidersChange={(updatedProviders) => {
           // 实时更新providers状态
           setProviders(updatedProviders)
         }}
       />

       {/* 长文本详情弹窗 */}
        <Modal
          title="详情"
          centered
          open={longTextModalVisible}
         onCancel={() => setLongTextModalVisible(false)}
         footer={[
           <Button key="copy" onClick={() => {
             navigator.clipboard.writeText(longTextContent).then(() => {
               antMessage.success('已复制到剪贴板')
             })
           }}>复制</Button>,
           <Button key="close" onClick={() => setLongTextModalVisible(false)}>关闭</Button>
         ]}
       >
         <div style={{ 
           whiteSpace: 'pre-wrap', 
           wordBreak: 'break-word',
           maxHeight: 'calc(90vh - 120px)',
           overflow: 'auto',
           fontFamily: "'SF Mono', 'Fira Code', 'Menlo', 'Monaco', monospace",
           fontSize: '14px',
           padding: 'var(--spacing-md)',
           backgroundColor: 'var(--bg-code)',
           color: 'var(--text-code)',
           borderRadius: 'var(--radius-md)',
           border: '1px solid var(--border-color)',
           lineHeight: 1.6,
         }}>
           {longTextContent}
         </div>
       </Modal>

       {/* 图片预览弹窗 */}
        <Modal
          title={imagePreviewName || '图片预览'}
          centered
          open={imagePreviewVisible}
         onCancel={() => setImagePreviewVisible(false)}
         footer={[
           <Button key="close" onClick={() => setImagePreviewVisible(false)}>关闭</Button>
         ]}
       >
         <div style={{ textAlign: 'center', padding: '16px 0' }}>
           {imagePreviewUrl ? (
             <img src={imagePreviewUrl} alt={imagePreviewName} style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 160px)', objectFit: 'contain' }} />
           ) : (
             <div style={{ padding: '40px 0', color: 'var(--text-secondary)' }}>图片数据暂不可用</div>
           )}
         </div>
       </Modal>

       {/* 文件信息弹窗 */}
        <Modal
          title="文件信息"
          centered
          open={fileInfoVisible}
         onCancel={() => setFileInfoVisible(false)}
         footer={[
           <Button key="close" onClick={() => setFileInfoVisible(false)}>关闭</Button>
         ]}
       >
         <div style={{ padding: '16px 0' }}>
           <div style={{ marginBottom: 12 }}>
             <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>文件名：</span>
             <span style={{ fontWeight: 500 }}>{fileInfoName}</span>
           </div>
           {fileInfoMime && (
             <div style={{ marginBottom: 12 }}>
               <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>类型：</span>
               <span style={{ fontWeight: 500 }}>{fileInfoMime}</span>
             </div>
           )}
         </div>
       </Modal>

       {/* 技能/MCP信息弹窗 */}
        <Modal
          title={skillInfoType === 'skill' ? '技能信息' : 'MCP 服务器信息'}
          centered
          open={skillInfoVisible}
         onCancel={() => setSkillInfoVisible(false)}
         footer={[
           <Button key="close" onClick={() => setSkillInfoVisible(false)}>关闭</Button>
         ]}
       >
         <div style={{ padding: '16px 0' }}>
           <div style={{ marginBottom: 12 }}>
             <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>名称：</span>
             <span style={{ fontWeight: 500 }}>{skillInfoType === 'skill' ? '@' : '#'}{skillInfoName}</span>
           </div>
           {skillInfoDescription && (
             <div>
               <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>{skillInfoType === 'skill' ? '描述：' : 'URL：'}</span>
               <span style={{ wordBreak: 'break-all', lineHeight: 1.6 }}>{skillInfoDescription}</span>
             </div>
           )}
         </div>
        </Modal>

        {/* 翻译弹窗 */}
        <TranslationModal
          open={translateModalVisible}
          text={translateText}
          onClose={() => setTranslateModalVisible(false)}
        />

        {/* 选中文本右键菜单 */}
        <SelectionContextMenu
          onTranslate={handleTranslate}
          onAddToChat={handleAddSelectionToChat}
          onSelectSkill={() => { setShowSkillPicker(true); setShowMCPPicker(false); setShowFilePicker(false) }}
          onSelectMCP={() => { setShowMCPPicker(true); setShowSkillPicker(false); setShowFilePicker(false) }}
          onFileSelect={(files) => handlePasteFile(files)}
          onPasteText={handlePasteText}
        />

    </div>
  </>
)
}

export default AIAssistantPanel