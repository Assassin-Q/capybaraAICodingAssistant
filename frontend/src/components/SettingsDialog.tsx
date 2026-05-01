import React, { useState, useEffect, useRef } from 'react'
import { Modal, message } from 'antd'

import JSZip from 'jszip'
import { Settings, SkillConfig, MCPServer, Provider } from '../types'
import { kotlinApi } from '../utils/kotlinApi'
import SkillsTab from './settings/SkillsTab'
import MCPTab from './settings/MCPTab'
import ThemeTab from './settings/ThemeTab'
import ModelTab from './settings/ModelTab'
import PermissionsTab from './settings/PermissionsTab'
import { useLocale } from '../locales/LocaleContext'

interface SettingsDialogProps {
  open: boolean
  activeTab: string
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
  onClose: () => void
  onServiceRestart?: () => Promise<void>
  onProvidersChange?: (providers: Provider[]) => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  activeTab,
  settings,
  onSettingsChange,
  isDark,
  onThemeChange,
  onClose,
  onServiceRestart,
  onProvidersChange,
}) => {
  const { t } = useLocale()
  const [providers, setProviders] = useState<Provider[]>([])
  const [allProviders, setAllProviders] = useState<Provider[]>([])
  const [_loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModel, setShowAddModel] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [systemProviders, setSystemProviders] = useState<any[]>([])
  const configProvidersRef = useRef<Record<string, any>>({})
  
  // Skills 管理
  const [showAddSkill, setShowAddSkill] = useState(false)
  const [isEditingSkill, setIsEditingSkill] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string>('')
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillContent, setNewSkillContent] = useState('')
  const [skillScope, setSkillScope] = useState<'project' | 'global'>('project')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillVersion, setSkillVersion] = useState('1.0.0')
  const [skillTemplates, setSkillTemplates] = useState<Array<{filename: string, content: string}>>([{filename: 'default.md', content: ''}])
  const [skillGoodExamples, setSkillGoodExamples] = useState<Array<{filename: string, content: string}>>([{filename: 'good.md', content: ''}])
  const [skillAntiPatterns, setSkillAntiPatterns] = useState<Array<{filename: string, content: string}>>([{filename: 'anti-pattern.md', content: ''}])
  const [skillRules, setSkillRules] = useState<Array<{filename: string, content: string}>>([{filename: 'rules.md', content: ''}])
  const [skillScripts, setSkillScripts] = useState<Array<{filename: string, content: string}>>([{filename: 'install.sh', content: ''}])
  const [skillActiveTab, setSkillActiveTab] = useState<string>('basic')
  const [loadingSkillFiles, setLoadingSkillFiles] = useState(false)
  const [originalSkillScope, setOriginalSkillScope] = useState<'project' | 'global'>('project')
  // 使用 ref 保存原始 scope，避免异步闭包问题
  const originalSkillScopeRef = useRef<'project' | 'global'>('project')
  
  // 规范化技能名称（转换为目录名）
  const normalizeSkillName = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }
  
  // MCP 管理
  const [showAddMCP, setShowAddMCP] = useState(false)
  const [newMCPName, setNewMCPName] = useState('')
  const [newMCPConfig, setNewMCPConfig] = useState('')
  const [editingMCPId, setEditingMCPId] = useState<string | null>(null)
  const [savingSkill, setSavingSkill] = useState(false)
  // 迁移确认弹窗状态
  const [showMigrationModal, setShowMigrationModal] = useState(false)
  const [migrationSkillId, setMigrationSkillId] = useState('')
  const [migrationOriginalScope, setMigrationOriginalScope] = useState<'project' | 'global'>('project')
  const [migrationNewScope, setMigrationNewScope] = useState<'project' | 'global'>('project')
  

  
  // 自定义模型管理
  const [showAddCustomModel, setShowAddCustomModel] = useState(false)
  const [customProviderName, setCustomProviderName] = useState('')
  const [customProviderId, setCustomProviderId] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customNpm, setCustomNpm] = useState('@ai-sdk/openai-compatible')
  const [customModels, setCustomModels] = useState<Array<{
    id: string
    name: string
    options: {
      reasoning: boolean
      modalities: string[]
      attachment: boolean
      toolcall: boolean
      contextSize: number
    }
  }>>([{
    id: '',
    name: '',
    options: {
      reasoning: true,
      modalities: ['text'],
      attachment: false,
      toolcall: true,
      contextSize: 128000
    }
  }])
  const [customHeaders, setCustomHeaders] = useState<Array<{name: string, value: string}>>([{name: '', value: ''}])
  
  // 厂商编辑
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [isEditingModel, setIsEditingModel] = useState(false)

   useEffect(() => {
     if (open) {
       fetchProviders()
       loadConfig()
       fetchSkills()
       fetchMCPServers()
     }
   }, [open])

  // 当显示添加模型密钥弹窗时，重置编辑状态（修复自定义模型编辑后无法正常选择厂商的问题）
  useEffect(() => {
    if (showAddModel && !isEditingModel) {
      // 如果不是编辑模式，清空编辑相关的状态
      setEditingProvider(null)
      setSelectedProvider('')
      setApiKey('')
    }
  }, [showAddModel, isEditingModel])

  const fetchProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. 从 auth.json 加载已认证的供应商（列表数据源）
      const authResponse = await kotlinApi.getProvidersFromFiles()
      let allList: any[] = []
      let opencodeAllMap: Record<string, any> = {}
      
      // 2. 从 /provider 获取所有系统供应商（含模型列表）
      let systemProviders: any[] = []
      try {
        const providerResponse = await kotlinApi.getProviders()
        if (providerResponse.data?.all && Array.isArray(providerResponse.data.all)) {
          systemProviders = providerResponse.data.all
          providerResponse.data.all.forEach((p: any) => {
            opencodeAllMap[p.id] = p.models || {}
          })
        }
      } catch { /* ignore */ }
      
      // 3. 从 opencode.jsonc 的 provider 键判断自定义厂商，获取 options.baseURL
      let configProviderIds = new Set<string>()
      const configProvidersMap: Record<string, any> = {}
      try {
        const configResponse = await kotlinApi.getConfig()
        if (configResponse.data?.provider && typeof configResponse.data.provider === 'object') {
          Object.entries(configResponse.data.provider as Record<string, any>).forEach(([id, cfg]) => {
            configProviderIds.add(id)
            configProvidersMap[id] = cfg
          })
        }
      } catch { /* ignore */ }
      configProvidersRef.current = configProvidersMap
      
      // 4. 构建列表：以 auth.json 数据为主
      if (authResponse.data?.providers && Array.isArray(authResponse.data.providers)) {
        allList = authResponse.data.providers.map((p: any) => ({
          ...p,
          models: opencodeAllMap[p.id] || p.models || {},
          isConnected: true,
          isCustom: configProviderIds.has(p.id),
          source: configProviderIds.has(p.id) ? 'config' : p.source,
        }))
      }
      
      setAllProviders(allList)
      setProviders(allList)
      setSystemProviders(systemProviders)
      onProvidersChange?.(allList)
    } catch (error) {
      setError(t('model.fetchProvidersFailed'))
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  // 生成随机8位小写字符串
  const generateProviderId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // 添加自定义模型
  const handleAddCustomModel = async () => {
    if (!customProviderName || !customBaseUrl) {
       message.warning(t('settings.fillNameAndUrl'))
      return
    }

    // 验证提供商ID格式
    const providerId = editingProvider ? editingProvider.id : (customProviderId || generateProviderId())
    if (!/^[a-z0-9_-]+$/.test(providerId)) {
       message.warning(t('settings.invalidProviderId'))
      return
    }

    // 验证模型列表
    const validModels = customModels.filter(m => m.id && m.name)
    if (validModels.length === 0) {
       message.warning(t('settings.addAtLeastOneModel'))
      return
    }

    try {
      // 构建包含完整选项的模型配置
      const modelsConfig: any = {}
      validModels.forEach(model => {
        modelsConfig[model.id] = {
          name: model.name,
          ...(model.options.reasoning && { reasoning: true }),
          ...(model.options.attachment && { attachment: true }),
          ...(model.options.toolcall !== undefined && { tool_call: model.options.toolcall }),
          ...(model.options.contextSize > 0 && {
            limit: { context: model.options.contextSize, output: model.options.contextSize }
          }),
          ...(model.options.modalities.length > 0 && {
            modalities: { input: model.options.modalities, output: model.options.modalities }
          }),
        }
      })

      const headersConfig: any = {}
      customHeaders.filter(h => h.name && h.value).forEach(header => {
        headersConfig[header.name] = header.value
      })

      // 构建提供商配置
      const providerConfig = {
        npm: customNpm,
        name: customProviderName,
        options: {
          baseURL: customBaseUrl,
          ...(Object.keys(headersConfig).length > 0 && { headers: headersConfig })
        },
        models: modelsConfig
      }

      // 1. 如果有API密钥，通过直接Kotlin端点保存认证信息
      if (customApiKey) {
        const authResponse = await kotlinApi.saveModelAuth(providerId, customApiKey)
        if (authResponse.error) {
          setError(`${t('settings.customModelSaveFailed')}: ${authResponse.error}`)
          return
        }
      }

      // 2. 通过直接Kotlin端点保存模型配置到opencode.jsonc
      const configResponse = await kotlinApi.saveModelConfig(providerId, providerConfig)
      if (configResponse.error) {
        setError(`${t('settings.customModelSaveFailed')}: ${configResponse.error}`)
      } else {
         message.success(t('settings.customModelUpdateSuccess'))
        setShowAddCustomModel(false)
        setIsEditingModel(false)
        setEditingProvider(null)
        resetCustomModelForm()
        fetchProviders()
      }
    } catch (error) {
      setError(t('settings.customModelSaveFailed'))
      console.error(error)
    }
  }

  const resetCustomModelForm = () => {
    setCustomProviderName('')
    setCustomProviderId('')
    setCustomBaseUrl('')
    setCustomApiKey('')
    setCustomNpm('@ai-sdk/openai-compatible')
    setCustomModels([{
      id: '',
      name: '',
      options: {
        reasoning: true,
        modalities: ['text'],
        attachment: false,
        toolcall: true,
        contextSize: 128000
      }
    }])
    setCustomHeaders([{name: '', value: ''}])
    // 重置编辑状态，避免影响标准模型密钥模态框
    setEditingProvider(null)
    setIsEditingModel(false)
  }

  // 编辑厂商密钥
  const handleEditProvider = (provider: Provider) => {
    if (provider.id.toLowerCase() === 'opencode') {
      message.warning(t('settings.openCodeNotEditable'))
      return
    }

    // 从 config 数据中获取完整配置（含 options.baseURL、models 等）
    const configData = configProvidersRef.current[provider.id]
    const isCustomProvider = !!configData
    
    if (isCustomProvider) {
      setIsEditingModel(false)
      setSelectedProvider('')
      setApiKey('')
      
      // 优先使用 config 数据中的完整配置
      const cfg = configData || provider
      setCustomProviderName(cfg.name || provider.name)
      setCustomProviderId(provider.id)
      setCustomBaseUrl(cfg.options?.baseURL || '')
      setCustomApiKey(provider.key || '')
      setCustomNpm(cfg.npm || provider.npm || '@ai-sdk/openai-compatible')
      setEditingProvider(provider)

      // 转换模型数据 - 优先使用 config 中的 models
      const sourceModels = cfg.models || provider.models
      const modelsArray = sourceModels ? Object.entries(sourceModels).map(([modelId, model]: [string, any]) => ({
        id: modelId,
        name: model.name || modelId,
        options: {
          reasoning: model.reasoning || model.capabilities?.reasoning || false,
          // 兼容两种模态格式：modalities.input (string[]) 或 capabilities.input ({text:bool, image:bool})
          modalities: model.modalities?.input || (() => {
            const cap = model.capabilities?.input
            if (!cap || typeof cap !== 'object') return ['text']
            const types: string[] = ['text']
            if (cap.image) types.push('image')
            if (cap.audio) types.push('audio')
            if (cap.video) types.push('video')
            if (cap.pdf) types.push('pdf')
            return types
          })(),
          attachment: model.attachment || model.capabilities?.attachment || false,
          toolcall: model.tool_call !== undefined ? model.tool_call : (model.capabilities?.toolcall ?? true),
          contextSize: model.limit?.context || 128000
        }
      })) : [{
        id: '',
        name: '',
        options: {
          reasoning: false,
          modalities: ['text'],
          attachment: false,
          toolcall: true,
          contextSize: 128000
        }
      }]
      setCustomModels(modelsArray)
      
      // 转换请求头数据
      const headersArray = (cfg.options?.headers || provider.options?.headers)
        ? Object.entries(cfg.options?.headers || provider.options?.headers || {}).map(([name, value]) => ({
          name,
          value: String(value)
        }))
        : [{name: '', value: ''}]
      setCustomHeaders(headersArray)
      
      setShowAddCustomModel(true)
    } else {
      // 打开编辑密钥弹窗（标准厂商）
      setIsEditingModel(true)
      setEditingProvider(provider)
      setSelectedProvider(provider.id)
      setApiKey(provider.key || '')
      setShowAddModel(true)
    }
  }

  // 删除厂商
  const handleDeleteProvider = async (providerId: string) => {
    if (providerId === 'opencode') {
      message.warning(t('settings.openCodeNotRemovable'))
      return
    }
    
    const provider = allProviders.find(p => p.id === providerId)
    const providerName = provider?.name || providerId
    
    Modal.confirm({
      title: t('model.deleteProviderConfirmTitle'),
      content: `${t('model.deleteProviderConfirmContent', { name: providerName })}${provider?.source === 'config' ? t('model.deleteProviderCustomHint') : t('model.deleteProviderStandardHint')}`,
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      centered: true,
      async onOk() {
        try {
          console.log('开始删除厂商:', providerId)
          // 1. 删除opencode.jsonc中的模型配置
          const configResponse = await kotlinApi.deleteModelConfig(providerId)
          if (configResponse.error) {
            console.warn(`删除厂商 ${providerId} 的模型配置失败: ${configResponse.error}`)
          }
          
          // 2. 删除auth.json中的认证信息
          const authResponse = await kotlinApi.deleteModelAuth(providerId)
          if (authResponse.error) {
            console.warn(`删除厂商 ${providerId} 的认证信息失败: ${authResponse.error}`)
          }
          
          message.success(t('model.deleteSuccess'))
          fetchProviders()
        } catch (error) {
          setError(t('model.deleteFailed'))
          console.error(error)
        }
      }
    })
  }

  // 添加模型行
  const addModelRow = () => {
    setCustomModels([...customModels, {
      id: '',
      name: '',
      options: {
        reasoning: false,
        modalities: ['text'],
        attachment: false,
        toolcall: true,
        contextSize: 128000
      }
    }])
  }

  // 移除模型行
  const removeModelRow = (index: number) => {
    const newModels = [...customModels]
    newModels.splice(index, 1)
    setCustomModels(newModels)
  }

  // 更新模型字段
  const updateModelField = (index: number, field: 'id' | 'name', value: string) => {
    const newModels = [...customModels]
    newModels[index][field] = value
    setCustomModels(newModels)
  }

  // 更新模型选项
  const updateModelOptions = (index: number, options: any) => {
    const newModels = [...customModels]
    newModels[index].options = options
    setCustomModels(newModels)
  }

  // 添加请求头行
  const addHeaderRow = () => {
    setCustomHeaders([...customHeaders, {name: '', value: ''}])
  }

  // 移除请求头行
  const removeHeaderRow = (index: number) => {
    const newHeaders = [...customHeaders]
    newHeaders.splice(index, 1)
    setCustomHeaders(newHeaders)
  }

  // 更新请求头字段
  const updateHeaderField = (index: number, field: 'name' | 'value', value: string) => {
    const newHeaders = [...customHeaders]
    newHeaders[index][field] = value
    setCustomHeaders(newHeaders)
  }

   const loadConfig = async () => {
     const response = await kotlinApi.getConfig()
     if (response.data) {

     }
   }

   // 从后端加载技能列表
   const fetchSkills = async () => {
     try {
        const response = await kotlinApi.getAllSkills()
       if (response.data && Array.isArray(response.data.skills)) {
         const backendSkills = response.data.skills
         // 合并现有设置中的启用状态
          const mergedSkills = backendSkills.map((skill: SkillConfig) => {
           const existingSkill = settings.skills.find(s => s.id === skill.id)
           return {
             ...skill,
             enabled: existingSkill ? existingSkill.enabled : true
           }
         })
         onSettingsChange({ ...settings, skills: mergedSkills })
       }
     } catch (error) {
       console.error('加载技能列表失败:', error)
     }
   }

   const fetchMCPServers = async () => {
     try {
       // 从opencode.jsonc读取MCP配置
       const configResponse = await kotlinApi.getMCPConfig()
       // 从OpenCode的/mcp接口获取MCP服务器状态
       const statusResponse = await kotlinApi.getMCPServers()
       
       if (configResponse.data?.servers && Array.isArray(configResponse.data.servers)) {
         const configServers = configResponse.data.servers
         // 获取状态信息
         const statusMap: Record<string, any> = {}
         if (statusResponse.data && typeof statusResponse.data === 'object') {
           Object.entries(statusResponse.data).forEach(([name, status]: [string, any]) => {
             statusMap[name] = status
           })
         }
         
         const backendServers = configServers.map((server: any) => {
           const status = statusMap[server.name] || {}
           return {
             id: server.id || server.name || `mcp-${Date.now()}`,
             name: server.name || server.id,
             url: server.url || '',
             enabled: server.enabled ?? true,
             type: server.type || 'remote',
             command: server.command,
             environment: server.environment,
             headers: server.headers,
             oauth: server.oauth,
             timeout: server.timeout,
             // 状态信息
             status: status.status || 'unknown',
             error: status.error,
           }
         })
         onSettingsChange({ ...settings, mcpServers: backendServers })
       }
     } catch (error) {
       console.error('加载MCP服务器列表失败:', error)
     }
   }

  const handleAddModel = async () => {
    if (!selectedProvider || !apiKey) {
      return
    }

    try {
      // 使用新的API保存到auth.json
      const response = await kotlinApi.saveModelAuth(selectedProvider, apiKey)

      if (response.error) {
        setError(`${t('model.saveModelFailed')} ${response.error}`)
      } else {
        message.success(t('model.saveModelSuccess'))
        setShowAddModel(false)
        setIsEditingModel(false)
        setEditingProvider(null)
        setSelectedProvider('')
        setApiKey('')
        fetchProviders()
      }
    } catch (err) {
      setError(t('model.saveModelFailed'))
    }
  }

  // 文件数组操作函数
  const addFile = (fileArray: Array<{filename: string, content: string}>, setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, defaultFilename: string = '') => {
    setFileArray([...fileArray, {filename: defaultFilename || `file-${fileArray.length + 1}.md`, content: ''}])
  }

  const removeFile = (fileArray: Array<{filename: string, content: string}>, setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, index: number) => {
    const newArray = [...fileArray]
    newArray.splice(index, 1)
    setFileArray(newArray)
  }

  const updateFileName = (fileArray: Array<{filename: string, content: string}>, setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, index: number, filename: string) => {
    const newArray = [...fileArray]
    newArray[index] = {...newArray[index], filename}
    setFileArray(newArray)
  }

  const updateFileContent = (fileArray: Array<{filename: string, content: string}>, setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, index: number, content: string) => {
    const newArray = [...fileArray]
    newArray[index] = {...newArray[index], content}
    setFileArray(newArray)
  }

  const resetSkillForm = () => {
    setNewSkillName('')
    setNewSkillContent('')
    setSkillScope('project')
    setSkillDescription('')
    setSkillVersion('1.0.0')
    setSkillTemplates([{filename: 'default.md', content: ''}])
    setSkillGoodExamples([{filename: 'good.md', content: ''}])
    setSkillAntiPatterns([{filename: 'anti-pattern.md', content: ''}])
    setSkillRules([{filename: 'rules.md', content: ''}])
    setSkillScripts([{filename: 'install.sh', content: ''}])
    setSkillActiveTab('basic')
    setIsEditingSkill(false)
    setEditingSkillId('')
  }

  // 添加自定义模型
  const handleAddSkill = () => {
    if (!newSkillName) {
      message.warning(t('skills.fillName'))
      return
    }

    // 捕获当前值用于 scope 迁移判断
    const currentEditingSkill = isEditingSkill
    const currentSkillScope = skillScope
    const currentOriginalScope = originalSkillScopeRef.current
    
    doSaveSkill().then((skillId) => {
      if (!skillId) return
      
      const scopeChanged = currentEditingSkill && currentSkillScope !== currentOriginalScope
      if (scopeChanged) {
        message.success(t('skills.saveSuccess'))
        setMigrationSkillId(skillId)
        setMigrationOriginalScope(currentOriginalScope)
        setMigrationNewScope(currentSkillScope)
        setShowMigrationModal(true)
      } else {
        message.success(t('skills.updateSuccess') + skillId)
        finishSkillSave(skillId)
        fetchSkills() // 重新从后端加载技能列表
      }
    })
  }

  const doSaveSkill = async (): Promise<string | null> => {
    setSavingSkill(true)

    // 生成技能文件夹名称（小写，连字符）
    const skillId = newSkillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    
    // 构建 SKILL.md 内容（包含 YAML frontmatter）
    const skillMdContent = `---
name: ${skillId}
version: ${skillVersion}
description: ${skillDescription || ''}
---

${newSkillContent}`

    // 构建技能数据对象
    const skillData = {
      id: skillId, // 使用规范化名称作为ID（目录名）
      name: newSkillName,
      version: skillVersion,
      description: skillDescription,
      scope: skillScope,
      files: {
        'SKILL.md': skillMdContent,
        // 转换模板文件数组
        ...skillTemplates.reduce((acc, file) => {
          if (file.filename && file.content.trim()) {
            acc[`templates/${file.filename}`] = file.content
          }
          return acc
        }, {} as Record<string, string>),
        // 转换示例文件数组
        ...skillGoodExamples.reduce((acc, file) => {
          if (file.filename && file.content.trim()) {
            acc[`examples/${file.filename}`] = file.content
          }
          return acc
        }, {} as Record<string, string>),
        // 转换反模式文件数组
        ...skillAntiPatterns.reduce((acc, file) => {
          if (file.filename && file.content.trim()) {
            acc[`examples/${file.filename}`] = file.content
          }
          return acc
        }, {} as Record<string, string>),
        // 转换规则文件数组
        ...skillRules.reduce((acc, file) => {
          if (file.filename && file.content.trim()) {
            acc[`references/${file.filename}`] = file.content
          }
          return acc
        }, {} as Record<string, string>),
        // 转换脚本文件数组
        ...skillScripts.reduce((acc, file) => {
          if (file.filename && file.content.trim()) {
            acc[`scripts/${file.filename}`] = file.content
          }
          return acc
        }, {} as Record<string, string>),
      }
    }

    try {
      // 尝试使用新的技能创建接口
      let response = await kotlinApi.createSkill(skillData)
      
      // 如果新接口失败（404等），回退到旧的配置方式
      if (response.error && response.error.includes('404')) {
        console.warn('新技能接口未实现，回退到旧配置方式')
        response = await kotlinApi.updateConfig({
          skills: {
            [newSkillName]: {
              content: newSkillContent,
              description: skillDescription,
              enabled: true,
            }
          }
        })
      }

      if (response.error) {
        setError(`${t('skills.saveFailed')} ${response.error}`)
      } else {
        // 保存成功，返回 skillId 给 handleAddSkill 处理 scope 迁移逻辑
        setSavingSkill(false)
        return skillId
      }
    } catch (err) {
      setError(t('skills.saveFailed'))
      console.error(err)
    } finally {
      setSavingSkill(false)
    }
    return null
  }

  // 完成技能保存的辅助函数
  const finishSkillSave = (skillId: string) => {
    const updatedSkill: SkillConfig = {
      id: isEditingSkill ? editingSkillId : `skill-${skillId}`, // 编辑时保持原ID，新建时生成新ID
      name: newSkillName,
      description: skillDescription || newSkillContent.substring(0, 50),
      content: newSkillContent,
      enabled: true,
      scope: skillScope,
    }
    
    if (isEditingSkill) {
      // 更新现有技能
      const updatedSkills = settings.skills.map(skill => 
        skill.id === editingSkillId ? updatedSkill : skill
      )
      onSettingsChange({
        ...settings,
        skills: updatedSkills,
      })
    } else {
      // 添加新技能
      onSettingsChange({
        ...settings,
        skills: [...settings.skills, updatedSkill],
      })
    }
    
    // 重置所有表单状态
    setShowAddSkill(false)
    setIsEditingSkill(false)
    setEditingSkillId('')
    resetSkillForm()
  }

  const handleImportSkill = (info: any) => {
    const file = info.file.originFileObj
    const fileName = file.name
    
    // 检查文件类型
    if (fileName.endsWith('.zip')) {
      // 处理ZIP包
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const zip = await JSZip.loadAsync(arrayBuffer)
          
          // 查找SKILL.md文件
          const skillMdFile = zip.file(/^SKILL\.md$/i)[0]
          if (!skillMdFile) {
            message.error(t('skills.importNoSkillMd'))
            return
          }
          
          // 读取SKILL.md内容
          const skillMdContent = await skillMdFile.async('text')
          
          // 解析YAML frontmatter
          const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/
          const match = skillMdContent.match(frontmatterRegex)
          
          let metadata: Record<string, string> = {}
          let bodyContent = skillMdContent
          
          if (match) {
            const frontmatterText = match[1]
            bodyContent = match[2]
            
            // 简单解析YAML frontmatter（基本键值对）
            frontmatterText.split('\n').forEach(line => {
              const trimmed = line.trim()
              if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':')
                const value = valueParts.join(':').trim()
                
                // 移除引号
                let cleanValue = value
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                  cleanValue = value.substring(1, value.length - 1)
                }
                
                metadata[key.trim()] = cleanValue
              }
            })
          } else {
            // 没有frontmatter，尝试从第一行提取名称
            const firstLine = skillMdContent.split('\n')[0]?.trim() || ''
            if (firstLine.startsWith('# ')) {
              const potentialName = firstLine.substring(2).trim()
              if (potentialName) {
                metadata.name = potentialName.toLowerCase().replace(/\s+/g, '-')
              }
            }
          }
          
          // 填充表单字段
          if (metadata.name) {
            setNewSkillName(metadata.name)
          }
          if (metadata.version) {
            setSkillVersion(metadata.version)
          }
          if (metadata.description) {
            setSkillDescription(metadata.description)
          }
          
          // 设置主内容
          setNewSkillContent(bodyContent.trim())
          
          // 初始化文件数组
          const templates: Array<{filename: string, content: string}> = []
          const goodExamples: Array<{filename: string, content: string}> = []
          const antiPatterns: Array<{filename: string, content: string}> = []
          const rules: Array<{filename: string, content: string}> = []
          const scripts: Array<{filename: string, content: string}> = []
          
          // 遍历ZIP中的文件，按目录分类
          zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return // 跳过目录
            
            // 获取文件名（不含路径）
            const filename = relativePath.split('/').pop() || ''
            if (!filename) return
            
            // 按目录分类
            if (relativePath.startsWith('templates/')) {
              templates.push({ filename, content: '' })
            } else if (relativePath.startsWith('examples/')) {
              // 区分优秀示例和反模式
              if (filename.includes('anti-pattern') || filename.includes('bad')) {
                antiPatterns.push({ filename, content: '' })
              } else {
                goodExamples.push({ filename, content: '' })
              }
            } else if (relativePath.startsWith('references/')) {
              rules.push({ filename, content: '' })
            } else if (relativePath.startsWith('scripts/')) {
              scripts.push({ filename, content: '' })
            }
            // 忽略其他文件
          })
          
          // 设置文件数组（内容稍后异步加载）
          setSkillTemplates(templates.length > 0 ? templates : [{filename: 'default.md', content: ''}])
          setSkillGoodExamples(goodExamples.length > 0 ? goodExamples : [{filename: 'good.md', content: ''}])
          setSkillAntiPatterns(antiPatterns.length > 0 ? antiPatterns : [{filename: 'anti-pattern.md', content: ''}])
          setSkillRules(rules.length > 0 ? rules : [{filename: 'rules.md', content: ''}])
          setSkillScripts(scripts.length > 0 ? scripts : [{filename: 'install.sh', content: ''}])
          
          // 异步加载文件内容
          const loadFileContent = async (relativePath: string, zipEntry: JSZip.JSZipObject) => {
            if (zipEntry.dir) return
            const content = await zipEntry.async('text')
            const filename = relativePath.split('/').pop() || ''
            
            if (relativePath.startsWith('templates/')) {
              setSkillTemplates(prev => prev.map(item => 
                item.filename === filename ? { ...item, content } : item
              ))
            } else if (relativePath.startsWith('examples/')) {
              if (filename.includes('anti-pattern') || filename.includes('bad')) {
                setSkillAntiPatterns(prev => prev.map(item => 
                  item.filename === filename ? { ...item, content } : item
                ))
              } else {
                setSkillGoodExamples(prev => prev.map(item => 
                  item.filename === filename ? { ...item, content } : item
                ))
              }
            } else if (relativePath.startsWith('references/')) {
              setSkillRules(prev => prev.map(item => 
                item.filename === filename ? { ...item, content } : item
              ))
            } else if (relativePath.startsWith('scripts/')) {
              setSkillScripts(prev => prev.map(item => 
                item.filename === filename ? { ...item, content } : item
              ))
            }
          }
          
          // 加载所有文件内容
          zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
              loadFileContent(relativePath, zipEntry)
            }
          })
          
          // 切换到基础信息标签页
          setSkillActiveTab('basic')
          
          message.success(t('skills.importSuccess'))
        } catch (error) {
          console.error('parse ZIP failed:', error)
          message.error(t('skills.importParseFailed'))
        }
      }
      reader.readAsArrayBuffer(file)
      return false
    } else if (fileName.endsWith('.md') || fileName === 'SKILL.md') {
      // 解析SKILL.md文件
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        try {
          // 解析YAML frontmatter
          const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/
          const match = content.match(frontmatterRegex)
          
          if (match) {
            const frontmatterText = match[1]
            const bodyContent = match[2]
            
            // 简单解析YAML frontmatter（基本键值对）
            const metadata: Record<string, string> = {}
            frontmatterText.split('\n').forEach(line => {
              const trimmed = line.trim()
              if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':')
                const value = valueParts.join(':').trim()
                
                // 移除引号
                let cleanValue = value
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                  cleanValue = value.substring(1, value.length - 1)
                }
                
                metadata[key.trim()] = cleanValue
              }
            })
            
            // 填充表单字段
            if (metadata.name) {
              setNewSkillName(metadata.name)
            }
            if (metadata.version) {
              setSkillVersion(metadata.version)
            }
            if (metadata.description) {
              setSkillDescription(metadata.description)
            }
            
            // 设置主内容
            setNewSkillContent(bodyContent.trim())
            
            // 切换到基础信息标签页
            setSkillActiveTab('basic')
            
            message.success(t('skills.importSuccess'))
          } else {
            // 没有frontmatter，直接使用内容
            setNewSkillContent(content.trim())
            
            // 尝试从第一行提取名称
            const firstLine = content.split('\n')[0]?.trim() || ''
            if (firstLine.startsWith('# ')) {
              const potentialName = firstLine.substring(2).trim()
              if (potentialName) {
                setNewSkillName(potentialName.toLowerCase().replace(/\s+/g, '-'))
              }
            }
            
            message.success(t('skills.importSuccess'))
          }
        } catch (error) {
          console.error('parse skill file failed:', error)
          message.error(t('skills.importParseFailed'))
        }
      }
      reader.readAsText(file)
      return false
    } else {
      message.warning(t('skills.importNoSkillMd'))
      return false
    }
  }

  const handleExportSkill = async (skill: SkillConfig) => {
    try {
      // Extract skill ID from skill object (remove 'skill-' prefix if present)
      const skillId = skill.id.startsWith('skill-') ? skill.id.substring(6) : skill.id
      
      // Call backend API to export skill as ZIP
      const zipBlob = await kotlinApi.exportSkill(skillId)
      
      // 创建下载链接
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${skillId}.zip`
      document.body.appendChild(link)
      
      // 在IntelliJ插件环境中，可能需要触发文件保存对话框
      // 添加一个提示，告诉用户文件下载位置
      message.success(t('skills.exportSuccess'))
      
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('导出技能失败:', error)
      message.error(t('skills.exportFailed'))
    }
  }

  const handleUseTemplate = () => {
    // 使用模板填充示例内容
    setNewSkillContent(`---
name: ${newSkillName || 'my-skill'}
version: ${skillVersion}
description: ${skillDescription || '技能描述'}
---

# 🎯 技能定位

> **核心定位**：简要描述技能的核心功能

## 目录导航

- [🚀 快速开始](#-快速开始)
- [🧩 核心概念](#-核心概念)
- [🔧 核心功能详解](#-核心功能详解)

# 🚀 快速开始

## 1. 安装与配置

\`\`\`bash
# 安装依赖
npm install @example/sdk
\`\`\`

## 2. 基础使用

\`\`\`typescript
import { Example } from '@example/sdk'

const example = new Example()
\`\`\`

# 🧩 核心概念

## 技术栈架构

...

# 🔧 核心功能详解

...
`)
    setSkillTemplates([{filename: 'template.md', content: `# 常用模板

## 模板1：基础组件

\`\`\`typescript
import React from 'react'

export const MyComponent: React.FC = () => {
  return <div>Hello World</div>
}
\`\`\`

## 模板2：API 请求

\`\`\`typescript
async function fetchData(url: string) {
  const response = await fetch(url)
  return response.json()
}
\`\`\`
`}])
    setSkillGoodExamples([{filename: 'good.md', content: `# 优秀示例

## 示例1：正确的组件结构

\`\`\`typescript
// 良好：使用 TypeScript，明确的类型定义
interface Props {
  title: string
}

const GoodComponent: React.FC<Props> = ({ title }) => {
  return <h1>{title}</h1>
}
\`\`\`

## 示例2：错误处理完善

\`\`\`typescript
async function safeFetch(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Network error')
    return await response.json()
  } catch (error) {
    console.error('Fetch failed:', error)
    return null
  }
}
\`\`\`
`}])
    setSkillAntiPatterns([{filename: 'anti-pattern.md', content: `# 反模式示例

## 反模式1：魔法字符串

\`\`\`typescript
// 不好：硬编码字符串难以维护
function badExample() {
  return 'some value'
}

// 好：使用常量
const CONSTANTS = {
  VALUE: 'some value'
}

function goodExample() {
  return CONSTANTS.VALUE
}
\`\`\`

## 反模式2：忽略错误处理

\`\`\`typescript
// 不好：忽略可能的错误
async function badFetch(url: string) {
  const response = await fetch(url)
  return response.json() // 如果 response.ok 为 false 会抛出错误
}

// 好：正确处理错误
async function goodFetch(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('请求失败')
    return await response.json()
  } catch (error) {
    console.error('请求失败:', error)
    return null
  }
}
\`\`\`
`}])
    setSkillRules([{filename: 'rules.md', content: `# 技能规范

## 开发规则

1. **类型安全**：必须使用 TypeScript，禁止使用 any 类型
2. **错误处理**：所有异步操作必须有错误处理
3. **代码风格**：遵循项目现有的代码风格

## 禁用词表

- 避免使用 "TODO"、"FIXME" 等注释
- 禁止硬编码敏感信息
- 避免过长的函数（超过 50 行）

## 参考规范

- [Ant Design 编码规范](https://github.com/ant-design/ant-design/wiki/编码规范)
- [TypeScript 最佳实践](https://github.com/microsoft/TypeScript/wiki/最佳实践)
`}])
    setSkillScripts([{filename: 'install.sh', content: `#!/bin/bash
# 可执行脚本示例

echo "安装依赖..."
npm install

echo "运行测试..."
npm test

echo "构建项目..."
npm run build

# 更多脚本...
`}])
    message.success(t('skills.templateFilled'))
  }

  const handleAddMCP = async () => {
    if (!newMCPName || !newMCPConfig) {
      message.warning(t('mcp.fillServerNameAndConfig'))
      return
    }

    try {
      const config = JSON.parse(newMCPConfig)
      const response = await kotlinApi.addMCPServer(newMCPName, config)

      if (response.error) {
        setError(`${t('mcp.saveFailed')}: ${response.error}`)
      } else {
        message.success(editingMCPId ? t('mcp.updateSuccess') : t('mcp.saveSuccess'))
        const serverId = editingMCPId || `mcp-${Date.now()}`
        const newServer: MCPServer = {
          id: serverId,
          name: newMCPName,
          url: config.url || '',
          enabled: config.enabled ?? true,
          type: config.type,
          command: config.command,
          environment: config.environment,
          headers: config.headers,
          oauth: config.oauth,
          timeout: config.timeout,
        }
        let updatedServers: MCPServer[]
        if (editingMCPId) {
          // 更新现有服务器
          updatedServers = settings.mcpServers.map(server =>
            server.id === editingMCPId ? newServer : server
          )
        } else {
          // 添加新服务器
          updatedServers = [...settings.mcpServers, newServer]
        }
        onSettingsChange({
          ...settings,
          mcpServers: updatedServers,
        })
        setShowAddMCP(false)
        setNewMCPName('')
        setNewMCPConfig('')
        setEditingMCPId(null)
      }
    } catch (err) {
      setError(t('mcp.jsonError'))
    }
  }


  

   // 加载技能文件
   const loadSkillFiles = async (skillName: string, scope: 'project' | 'global', skillPath?: string) => {
     setLoadingSkillFiles(true)
     try {
       let skillDir: string
       if (skillPath) {
         // 使用提供的技能路径
         skillDir = skillPath.endsWith('/') ? skillPath : `${skillPath}/`
       } else {
         // 获取路径配置并构建路径
         const pathsResponse = await kotlinApi.getPaths()
         if (!pathsResponse.data) {
           throw new Error('无法获取路径配置')
         }
         
         const basePath = scope === 'global' ? pathsResponse.data.config : pathsResponse.data.directory
         const normalizedSkillName = normalizeSkillName(skillName)
         // 对于项目范围，需要添加 .opencode 目录
         const skillBasePath = scope === 'global' ? basePath : `${basePath}/.opencode`
         skillDir = `${skillBasePath}/skills/${normalizedSkillName}/`
       }
      
      // 初始化文件数组
      const templates: Array<{filename: string, content: string}> = []
      const goodExamples: Array<{filename: string, content: string}> = []
      const antiPatterns: Array<{filename: string, content: string}> = []
      const rules: Array<{filename: string, content: string}> = []
      const scripts: Array<{filename: string, content: string}> = []
      
       // 辅助函数：加载目录下的所有文件
      const loadFilesFromDir = async (dirPath: string): Promise<Array<{filename: string, content: string}>> => {
        const files: Array<{filename: string, content: string}> = []
        try {
          console.log(`请求目录列表: ${dirPath}`)
          // 列出目录内容
          const dirResponse = await kotlinApi.listDirectory(dirPath)
          console.log(`目录响应:`, dirResponse)
          if (dirResponse.data && Array.isArray(dirResponse.data)) {
            console.log(`目录项数量: ${dirResponse.data.length}`, dirResponse.data)
            // 过滤出文件（非目录）
            const fileItems = dirResponse.data.filter(item => item.type === 'file')
            console.log(`文件数量: ${fileItems.length}`)
            
            // 读取每个文件内容
            for (const fileItem of fileItems) {
              try {
                console.log(`读取文件: ${fileItem.path} (${fileItem.name})`)
                const contentResponse = await kotlinApi.readFile(fileItem.path)
                if (contentResponse.data && contentResponse.data.content !== undefined) {
                  files.push({
                    filename: fileItem.name,
                    content: contentResponse.data.content
                  })
                  console.log(`文件 ${fileItem.name} 加载成功，长度: ${contentResponse.data.content.length}`)
                }
              } catch (error) {
                console.warn(`无法读取文件 ${fileItem.path}:`, error)
              }
            }
          }
        } catch (error) {
          // 目录可能不存在，忽略错误
          console.log(`目录 ${dirPath} 不存在或无法访问:`, error)
        }
        return files
      }
      
      // 加载 templates/ 目录
      const templateFiles = await loadFilesFromDir(`${skillDir}templates/`)
      console.log('Loaded template files:', templateFiles)
      templates.push(...templateFiles)
      
      // 加载 examples/ 目录并分类
      const exampleFiles = await loadFilesFromDir(`${skillDir}examples/`)
      console.log('Loaded example files:', exampleFiles)
      exampleFiles.forEach(file => {
        if (file.filename.includes('anti-pattern') || file.filename.includes('bad')) {
          antiPatterns.push(file)
        } else {
          goodExamples.push(file)
        }
      })
      
      // 加载 references/ 目录
      const ruleFiles = await loadFilesFromDir(`${skillDir}references/`)
      console.log('Loaded reference files:', ruleFiles)
      rules.push(...ruleFiles)
      
      // 加载 scripts/ 目录
      const scriptFiles = await loadFilesFromDir(`${skillDir}scripts/`)
      console.log('Loaded script files:', scriptFiles)
      scripts.push(...scriptFiles)
      
      // 设置状态，如果目录为空则使用默认值
      setSkillTemplates(templates.length > 0 ? templates : [{filename: 'default.md', content: ''}])
      setSkillGoodExamples(goodExamples.length > 0 ? goodExamples : [{filename: 'good.md', content: ''}])
      setSkillAntiPatterns(antiPatterns.length > 0 ? antiPatterns : [{filename: 'anti-pattern.md', content: ''}])
      setSkillRules(rules.length > 0 ? rules : [{filename: 'rules.md', content: ''}])
      setSkillScripts(scripts.length > 0 ? scripts : [{filename: 'install.sh', content: ''}])
      
    } catch (error) {
      console.error('加载技能文件失败:', error)
      // 使用默认值
      setSkillTemplates([{filename: 'default.md', content: ''}])
      setSkillGoodExamples([{filename: 'good.md', content: ''}])
      setSkillAntiPatterns([{filename: 'anti-pattern.md', content: ''}])
      setSkillRules([{filename: 'rules.md', content: ''}])
      setSkillScripts([{filename: 'install.sh', content: ''}])
    } finally {
      setLoadingSkillFiles(false)
    }
  }

  // 编辑技能
  const handleEditSkill = (skill: SkillConfig) => {
    setIsEditingSkill(true)
    setEditingSkillId(skill.id)
    setNewSkillName(skill.name)
    setSkillDescription(skill.description)
    setSkillScope(skill.scope || 'project')
    setOriginalSkillScope(skill.scope || 'project')
    originalSkillScopeRef.current = skill.scope || 'project'
    
    // 尝试解析技能内容中的YAML frontmatter
    const content = skill.content || ''
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/
    const match = content.match(frontmatterRegex)
    
    if (match) {
      const frontmatterText = match[1]
      const bodyContent = match[2]
      
      // 简单解析YAML frontmatter
      const metadata: Record<string, string> = {}
      frontmatterText.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':')
          const value = valueParts.join(':').trim()
          
          // 移除引号
          let cleanValue = value
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            cleanValue = value.substring(1, value.length - 1)
          }
          
          metadata[key.trim()] = cleanValue
        }
      })
      
      if (metadata.version) {
        setSkillVersion(metadata.version)
      }
      
      setNewSkillContent(bodyContent.trim())
    } else {
      // 没有frontmatter，直接使用内容
      setNewSkillContent(content.trim())
      setSkillVersion('1.0.0')
    }
    
     // 加载技能文件，使用技能的实际路径
     loadSkillFiles(skill.name, skill.scope || 'project', skill.path)
    
    setSkillActiveTab('basic')
    setShowAddSkill(true)
  }





  const getTitle = () => {
    switch (activeTab) {
      case 'skills': return t('settings.title.skills')
      case 'mcp': return t('settings.title.mcp')
      case 'model': return t('settings.title.model')
      case 'permissions': return t('settings.title.permissions')
      case 'theme': return t('settings.title.theme')
      default: return t('settings.title.default')
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'skills':
        return (
          <SkillsTab
            settings={settings}
            onSettingsChange={onSettingsChange}
            isDark={isDark}
            onServiceRestart={onServiceRestart}
            showAddSkill={showAddSkill}
            setShowAddSkill={setShowAddSkill}
            isEditingSkill={isEditingSkill}
            setIsEditingSkill={setIsEditingSkill}
            setEditingSkillId={setEditingSkillId}
            editingSkillId={editingSkillId}
            newSkillName={newSkillName}
            setNewSkillName={setNewSkillName}
            newSkillContent={newSkillContent}
            setNewSkillContent={setNewSkillContent}
            skillScope={skillScope}
            setSkillScope={setSkillScope}
            skillDescription={skillDescription}
            setSkillDescription={setSkillDescription}
            skillVersion={skillVersion}
            setSkillVersion={setSkillVersion}
            skillTemplates={skillTemplates}
            setSkillTemplates={setSkillTemplates}
            skillGoodExamples={skillGoodExamples}
            setSkillGoodExamples={setSkillGoodExamples}
            skillAntiPatterns={skillAntiPatterns}
            setSkillAntiPatterns={setSkillAntiPatterns}
            skillRules={skillRules}
            setSkillRules={setSkillRules}
            skillScripts={skillScripts}
            setSkillScripts={setSkillScripts}
            skillActiveTab={skillActiveTab}
            setSkillActiveTab={setSkillActiveTab}
            loadingSkillFiles={loadingSkillFiles}
            savingSkill={savingSkill}
            originalSkillScope={originalSkillScope}
            handleAddSkill={handleAddSkill}
            handleImportSkill={handleImportSkill}
            handleUseTemplate={handleUseTemplate}
            resetSkillForm={resetSkillForm}
            addFile={addFile}
            removeFile={removeFile}
            updateFileName={updateFileName}
            updateFileContent={updateFileContent}
            handleEditSkill={handleEditSkill}
            handleExportSkill={handleExportSkill}
            fetchSkills={fetchSkills}
          />
        )
      case 'mcp':
        return (
          <MCPTab
            settings={settings}
            onSettingsChange={onSettingsChange}
            isDark={isDark}
            onServiceRestart={onServiceRestart}
            showAddMCP={showAddMCP}
            setShowAddMCP={setShowAddMCP}
            newMCPName={newMCPName}
            setNewMCPName={setNewMCPName}
            newMCPConfig={newMCPConfig}
            setNewMCPConfig={setNewMCPConfig}
            editingMCPId={editingMCPId}
            setEditingMCPId={setEditingMCPId}
            handleAddMCP={handleAddMCP}
            fetchMCPServers={fetchMCPServers}
          />
        )
      case 'model':
        return (
          <ModelTab
            error={error}
            setError={setError}
            providers={providers}
            allProviders={allProviders}
            systemProviders={systemProviders}
            showAddModel={showAddModel}
            setShowAddModel={setShowAddModel}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            apiKey={apiKey}
            setApiKey={setApiKey}
            editingProvider={editingProvider}
            setEditingProvider={setEditingProvider}
            isEditingModel={isEditingModel}
            setIsEditingModel={setIsEditingModel}
            showAddCustomModel={showAddCustomModel}
            setShowAddCustomModel={setShowAddCustomModel}
            customProviderName={customProviderName}
            setCustomProviderName={setCustomProviderName}
            customProviderId={customProviderId}
            setCustomProviderId={setCustomProviderId}
            customBaseUrl={customBaseUrl}
            setCustomBaseUrl={setCustomBaseUrl}
            customApiKey={customApiKey}
            setCustomApiKey={setCustomApiKey}
            customNpm={customNpm}
            setCustomNpm={setCustomNpm}
            customModels={customModels}
            customHeaders={customHeaders}
            handleAddModel={handleAddModel}
            handleEditProvider={handleEditProvider}
            handleDeleteProvider={handleDeleteProvider}
            handleAddCustomModel={handleAddCustomModel}
            resetCustomModelForm={resetCustomModelForm}
            addModelRow={addModelRow}
            removeModelRow={removeModelRow}
            updateModelField={updateModelField}
            updateModelOptions={updateModelOptions}
            addHeaderRow={addHeaderRow}
            removeHeaderRow={removeHeaderRow}
            updateHeaderField={updateHeaderField}
          />
        )
      case 'permissions':
        return (
          <PermissionsTab
            settings={settings}
            onSettingsChange={onSettingsChange}
            onServiceRestart={onServiceRestart}
          />
        )
      case 'theme':
        return (
          <ThemeTab
            isDark={isDark}
            onThemeChange={onThemeChange}
          />
        )
      default:
        return null
    }
  }

  return (
    <Modal
      title={getTitle()}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      mask={{ closable: false }}
      className="settings-modal"
      styles={{
        body: {
          overflow: 'auto',
          padding: '12px 16px',
        },
      }}
    >
      {renderContent()}

      <div style={{
        padding: '10px 0',
        borderTop: '1px solid var(--border-color)',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-secondary)',
        marginTop: 4,
      }}>
         {t('settings.footerAuthor')}<a href="https://gitee.com/qianguanshui" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>Assassin-Q</a>，
         {t('settings.footerHomepage')}<a href="https://gitee.com/qianguanshui" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>https://gitee.com/qianguanshui</a>
      </div>

      {/* 迁移技能文件确认弹窗 */}
      <Modal
        title="迁移技能文件"
        centered
        mask={{ closable: false }}
        open={showMigrationModal}
        onOk={async () => {
          try {
            const moveSkillId = editingSkillId.startsWith('skill-') ? editingSkillId.substring(6) : editingSkillId
            await kotlinApi.moveSkill(moveSkillId, migrationOriginalScope, migrationNewScope, true)
            message.success('技能文件已移动到新位置')
          } catch (error) {
            console.error('移动技能文件失败:', error)
            message.error(`移动技能文件失败: ${(error as Error).message}`)
          }
          setShowMigrationModal(false)
          finishSkillSave(migrationSkillId)
          fetchSkills()
        }}
        okText="移动文件"
        cancelText="仅复制"
        onCancel={async () => {
          try {
            const moveSkillId = editingSkillId.startsWith('skill-') ? editingSkillId.substring(6) : editingSkillId
            await kotlinApi.moveSkill(moveSkillId, migrationOriginalScope, migrationNewScope, false)
            message.success('技能文件已复制到新位置')
          } catch (error) {
            console.error('复制技能文件失败:', error)
            message.error(`复制技能文件失败: ${(error as Error).message}`)
          }
          setShowMigrationModal(false)
          finishSkillSave(migrationSkillId)
          fetchSkills()
        }}
      >
        <p>检测到您将技能范围从{migrationOriginalScope === 'project' ? '项目级' : '全局'}切换到了{migrationNewScope === 'project' ? '项目级' : '全局'}，是否需要将文件也迁移过去？</p>
      </Modal>
    </Modal>
  )
}

export default SettingsDialog
