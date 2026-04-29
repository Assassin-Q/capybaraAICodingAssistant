import type { Todo, SessionStatus } from '../types'

// 目录列表响应类型
interface DirectoryEntry {
  name: string
  path: string
  type: string // file, directory
  size?: number
}

interface DirectoryListResponse {
  success: boolean
  path: string
  entries: DirectoryEntry[]
  error?: string
}

// 统一使用相对路径，让代理/服务器处理路由
const API_BASE = '/api'

// OpenCode 服务直接访问配置
let OPENCODE_BASE_URL: string | null = null

// 项目路径缓存
let PROJECT_PATH_CACHE: string | null = null

// 获取OpenCode服务基础URL
async function getOpenCodeBaseUrl(): Promise<string> {
  if (OPENCODE_BASE_URL) {
    return OPENCODE_BASE_URL
  }
  
  // 尝试从服务器信息获取端口
  try {
    const response = await fetchApi<{port: number, opencodePort: number, opencodeRunning: boolean}>('/server-info')
    if (response.data && response.data.opencodePort) {
      OPENCODE_BASE_URL = `http://localhost:${response.data.opencodePort}`
      return OPENCODE_BASE_URL
    }
  } catch (error) {
    console.warn('无法获取OpenCode服务端口，使用默认端口50001', error)
  }
  
  // 默认端口 (OpenCode 端口范围: 50001-99999)
  OPENCODE_BASE_URL = 'http://localhost:50001'
  return OPENCODE_BASE_URL
}

// 获取项目路径并缓存
async function getProjectPathHeader(): Promise<Record<string, string>> {
  if (PROJECT_PATH_CACHE) {
    // 对目录路径进行编码，确保只包含ISO-8859-1字符
    const encoded = PROJECT_PATH_CACHE === '.' ? '.' : encodeURIComponent(PROJECT_PATH_CACHE)
    console.log('Project path header (cached):', { 
      original: PROJECT_PATH_CACHE, 
      encoded,
      isAscii: /^[\x00-\x7F]*$/.test(PROJECT_PATH_CACHE)
    })
    return { 'X-Opencode-Directory': encoded }
  }
  
  try {
    const response = await fetchApi<{ path: string }>('/project-path')
    if (response.data?.path) {
      PROJECT_PATH_CACHE = response.data.path
      // 对目录路径进行编码，确保只包含ISO-8859-1字符
      const encoded = PROJECT_PATH_CACHE === '.' ? '.' : encodeURIComponent(PROJECT_PATH_CACHE)
      console.log('Project path header (fetched):', { 
        original: PROJECT_PATH_CACHE, 
        encoded,
        isAscii: /^[\x00-\x7F]*$/.test(PROJECT_PATH_CACHE)
      })
      return { 'X-Opencode-Directory': encoded }
    }
  } catch (error) {
    console.warn('无法获取项目路径，使用空目录', error)
  }
  
  // 回退到当前目录（当前目录不需要编码）
  PROJECT_PATH_CACHE = '.'
  console.log('Project path header (fallback):', { original: '.', encoded: '.' })
  return { 'X-Opencode-Directory': '.' }
}

// 直接请求OpenCode服务（绕过Java代理，解决PATCH请求问题）
async function directOpenCode<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const baseUrl = await getOpenCodeBaseUrl()
    const url = `${baseUrl}${endpoint}`
    console.log(`直接请求OpenCode: ${url}`)
    
    // 添加项目路径头部
    const headers = await getProjectPathHeader()
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...options?.headers,
    }
    console.log('Direct OpenCode request headers:', {
      url,
      headers: finalHeaders,
      hasNonAscii: Object.entries(finalHeaders).some(([k, v]) => 
        !/^[\x00-\x7F]*$/.test(k) || !/^[\x00-\x7F]*$/.test(String(v))
      )
    })
    const response = await fetch(url, {
      ...options,
      headers: finalHeaders,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: errorText || `HTTP ${response.status}` }
    }

    // 204 No Content 响应
    if (response.status === 204) {
      return { data: undefined }
    }

    // 尝试解析 JSON 响应
    try {
      const text = await response.text()
      if (!text) {
        return { data: undefined }
      }
      const data = JSON.parse(text)
      return { data }
    } catch (error) {
      // 如果不是 JSON，返回原始文本
      return { error: '响应不是有效的 JSON' }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '网络请求失败',
    }
  }
}

// 类型定义
export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface ServerStatus {
  installed: boolean
  running: boolean
  serviceUrl: string
  servicePort: number
  installationGuide: {
    command: string
    website: string
    message: string
  }
  version?: string
}

export interface Session {
  id: string
  title: string
  parentID?: string
  createdAt: number
  updatedAt: number
  directory?: string
}

export interface Provider {
  id: string
  name: string
  models: { [key: string]: ModelInfo }
  key?: string
  source?: string
  env?: string[]
  options?: {
    baseURL?: string
    headers?: Record<string, string>
    [key: string]: any
  }
}

export interface ModelInfo {
  id: string
  providerID: string
  name: string
  isFree?: boolean
  status: string
  cost?: {
    input: number
    output: number
    cache?: {
      read: number
      write: number
    }
  }
  capabilities?: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
  }
}

export interface ProvidersResponse {
  all: Provider[]
  default: { [key: string]: string }
  connected: string[]
}

export interface PathsResponse {
  home: string
  state: string
  config: string
  worktree: string
  directory: string
}

export interface ChatMessage {
  id: number
  type: string
  content: string
  fileName?: string
  lineRange?: { start: number, end: number }
  timestamp: number
  status: string
}

export interface PermissionConfig {
  [tool: string]: string | { [pattern: string]: string }
}



// API 基础函数
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint}`
    console.log(`API请求: ${url}`)
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: errorText || `HTTP ${response.status}` }
    }

    // 204 No Content 响应
    if (response.status === 204) {
      return { data: undefined }
    }

    // 尝试解析 JSON 响应
    try {
      const text = await response.text()
      if (!text) {
        return { data: undefined }
      }
      const data = JSON.parse(text)
      return { data }
    } catch (error) {
      // 如果不是 JSON，返回原始文本
      return { error: '响应不是有效的 JSON' }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '网络请求失败',
    }
  }
}

export async function proxyOpenCode<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  // 对于PATCH和DELETE请求，直接请求OpenCode服务（解决Java代理转发问题）
  if (options?.method === 'PATCH' || options?.method === 'DELETE') {
    console.log(`${options.method}请求使用直接OpenCode访问: ${endpoint}`)
    return directOpenCode<T>(endpoint, options)
  }
  
  // 其他请求仍然通过代理，添加项目路径头部
  const headers = await getProjectPathHeader()
  const mergedHeaders = {
    ...headers,
    ...options?.headers,
  }
  console.log('Proxy OpenCode request headers:', {
    endpoint,
    headers: mergedHeaders,
    hasNonAscii: Object.entries(mergedHeaders).some(([k, v]) => 
      !/^[\x00-\x7F]*$/.test(k) || !/^[\x00-\x7F]*$/.test(String(v))
    )
  })
  const mergedOptions = {
    ...options,
    headers: mergedHeaders
  }
  return fetchApi<T>(`/opencode${endpoint}`, mergedOptions)
}

// 导出 API
export const kotlinApi = {
  // 服务器状态
  async getStatus(): Promise<ApiResponse<ServerStatus>> {
    return fetchApi<ServerStatus>('/opencode/status')
  },

  async startService(): Promise<ApiResponse<{ success: boolean, message: string }>> {
    return fetchApi('/opencode/start', { method: 'POST' })
  },

  async stopService(): Promise<ApiResponse<{ success: boolean }>> {
    return fetchApi('/opencode/stop', { method: 'POST' })
  },

  // 会话管理
  async getSessions(): Promise<ApiResponse<Session[]>> {
    let endpoint = '/session'
    return proxyOpenCode(endpoint)
  },

  async createSession(title?: string): Promise<ApiResponse<Session>> {
    return proxyOpenCode('/session', {
      method: 'POST',
      body: JSON.stringify({ title })
    })
  },

  async getSession(id: string): Promise<ApiResponse<Session>> {
    return proxyOpenCode(`/session/${id}`)
  },

  async deleteSession(id: string): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/session/${id}`, { method: 'DELETE' })
  },

  async updateSession(id: string, title: string, directory?: string): Promise<ApiResponse<Session>> {
    let endpoint = `/session/${id}`
    const dir = directory || '.'
    endpoint += `?directory=${encodeURIComponent(dir)}`
    return proxyOpenCode(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    })
  },

  async getSessionStatus(): Promise<ApiResponse<Record<string, SessionStatus>>> {
    return proxyOpenCode('/session/status')
  },

  // 消息管理
  async getMessages(sessionId: string, limit?: number): Promise<ApiResponse<any[]>> {
    const query = limit ? `?limit=${limit}` : ''
    return proxyOpenCode(`/session/${sessionId}/message${query}`)
  },

  async getMessage(sessionId: string, messageId: string): Promise<ApiResponse<any>> {
    return proxyOpenCode(`/session/${sessionId}/message/${messageId}`)
  },

  async sendMessage(sessionId: string, parts: any[], model?: string, agent?: string, reasoningEffort?: string): Promise<ApiResponse<any>> {
    console.log('sendMessage called', { sessionId, parts, model, agent, reasoningEffort })
    
    // 转换 model 字符串为对象格式（如 "deepseek/deepseek-reasoner" -> { providerID: "deepseek", modelID: "deepseek-reasoner" }）
    let modelObj = undefined
    if (model && model.includes('/')) {
      const [provider, modelId] = model.split('/')
      modelObj = { providerID: provider, modelID: modelId }
      console.log('Model string converted to object:', modelObj)
    } else if (model) {
      console.log('Model string not in provider/model format:', model)
      // 如果不是 provider/model 格式，直接使用字符串
      modelObj = model
    }
    
    // 转换 parts 格式：将 content 字段改为 text 字段，不添加ID（由后端生成）
    const convertedParts = parts.map(part => {
      const converted: any = { ...part }
      
      // 对于text类型的part，将content字段改为text字段
      if (converted.type === 'text' && converted.content !== undefined) {
        converted.text = converted.content
        delete converted.content
      }
      
      // 不生成part.id，由后端生成
      return converted
    })
    
    const requestBody: any = { 
      parts: convertedParts, 
      model: modelObj, 
      agent 
    }
    
    // 添加思考强度
    if (reasoningEffort) {
      requestBody.reasoningEffort = reasoningEffort
    }
    
    console.log('Sending request to OpenCode (async):', {
      endpoint: `/session/${sessionId}/prompt_async`,
      method: 'POST',
      body: requestBody
    })
    
    return proxyOpenCode(`/session/${sessionId}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    })
  },

  async abortSession(sessionId: string): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/session/${sessionId}/abort`, { method: 'POST' })
  },

  // 提供商和模型
  async getProviders(): Promise<ApiResponse<ProvidersResponse>> {
    return proxyOpenCode('/provider')
  },

  async getConfigProviders(): Promise<ApiResponse<any>> {
    return proxyOpenCode('/config/providers')
  },

  // 配置管理
  async getConfig(): Promise<ApiResponse<any>> {
    return proxyOpenCode('/config')
  },

  async updateConfig(config: any): Promise<ApiResponse<any>> {
    return proxyOpenCode('/config', {
      method: 'PATCH',
      body: JSON.stringify(config)
    })
  },

  async updateProviderAuth(providerId: string, apiKey: string): Promise<ApiResponse<any>> {
    return proxyOpenCode(`/auth/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'api', key: apiKey })
    })
  },

  async deleteAuth(providerId: string): Promise<ApiResponse<any>> {
    return proxyOpenCode(`/auth/${providerId}`, {
      method: 'DELETE'
    })
  },

  // 模型管理（直接操作文件）
  async saveModelAuth(providerId: string, apiKey: string): Promise<ApiResponse<any>> {
    return fetchApi('/model/auth', {
      method: 'PUT',
      body: JSON.stringify({ providerId, apiKey })
    })
  },

  async deleteModelAuth(providerId: string): Promise<ApiResponse<any>> {
    return fetchApi('/model/auth', {
      method: 'DELETE',
      body: JSON.stringify({ providerId })
    })
  },

  async saveModelConfig(providerId: string, config: any): Promise<ApiResponse<any>> {
    return fetchApi('/model/config', {
      method: 'PUT',
      body: JSON.stringify({ providerId, config })
    })
  },

  async deleteModelConfig(providerId: string): Promise<ApiResponse<any>> {
    return fetchApi('/model/config', {
      method: 'DELETE',
      body: JSON.stringify({ providerId })
    })
  },

  async getProvidersFromFiles(): Promise<ApiResponse<any>> {
    return fetchApi('/model/providers', {
      method: 'GET'
    })
  },

  async getModelAuth(providerId: string): Promise<ApiResponse<any>> {
    return fetchApi(`/model/auth?providerId=${encodeURIComponent(providerId)}`, {
      method: 'GET'
    })
  },

  // 文件搜索
  async findFiles(query: string): Promise<ApiResponse<string[]>> {
    return proxyOpenCode(`/find/file?query=${encodeURIComponent(query)}`)
  },

  async findInFiles(pattern: string): Promise<ApiResponse<any[]>> {
    return proxyOpenCode(`/find?pattern=${encodeURIComponent(pattern)}`)
  },

  // 代理和技能
  async getAgents(): Promise<ApiResponse<any[]>> {
    return proxyOpenCode('/agent')
  },

  // MCP 服务器
  async getMCPServers(): Promise<ApiResponse<any>> {
    return proxyOpenCode('/mcp')
  },

  // 从opencode.jsonc读取MCP配置
  async getMCPConfig(): Promise<ApiResponse<any>> {
    return fetchApi('/opencode/mcp')
  },

  async addMCPServer(name: string, config: any): Promise<ApiResponse<any>> {
    return proxyOpenCode('/mcp', {
      method: 'POST',
      body: JSON.stringify({ name, config })
    })
  },

  async deleteMCPServer(name: string): Promise<ApiResponse<any>> {
    return proxyOpenCode('/mcp', {
      method: 'DELETE',
      body: JSON.stringify({ name })
    })
  },

  // 权限
  async setSessionPermission(sessionId: string, permissionId: string, response: string, remember?: boolean): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/session/${sessionId}/permissions/${permissionId}`, {
      method: 'POST',
      body: JSON.stringify({ response, remember })
    })
  },

  // 聊天消息（右键菜单）
  async getChatMessages(): Promise<ApiResponse<ChatMessage[]>> {
    return fetchApi('/chat/messages')
  },

  async sendChatMessage(type: string, content: string, fileName?: string, lineStart?: number, lineEnd?: number): Promise<ApiResponse<{ success: boolean, messageId: number }>> {
    const body: any = { type, content }
    if (fileName) body.fileName = fileName
    if (lineStart !== undefined) body.lineStart = lineStart
    if (lineEnd !== undefined) body.lineEnd = lineEnd
    return fetchApi('/chat/message', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },

  async deleteChatMessage(id: number): Promise<ApiResponse<{ success: boolean }>> {
    return fetchApi(`/chat/messages/${id}`, { method: 'DELETE' })
  },

   // Todo 相关 API
  async getSessionTodos(sessionId: string): Promise<ApiResponse<Todo[]>> {
    return proxyOpenCode(`/session/${sessionId}/todo`)
  },

  async updateTodo(sessionId: string, todoId: string, status: string): Promise<ApiResponse<Todo>> {
    return proxyOpenCode(`/session/${sessionId}/todo/${todoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
  },

  // 清空会话消息
  async clearSessionMessages(sessionId: string): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/session/${sessionId}/message`, {
      method: 'DELETE'
    })
  },

  // 文件搜索
  async searchFiles(params: {
    query: string
    searchType?: string
    caseSensitive?: boolean
    exactMatch?: boolean
    fuzzyMatch?: boolean
    extension?: string
    limit?: number
  }): Promise<ApiResponse<{
    success: boolean
    results: Array<{
      path: string
      name: string
      relativePath: string
      type: string
      matches?: Array<{
        line: number
        column: number
        text: string
        highlightStart: number
        highlightEnd: number
      }>
    }>
    total: number
    query: string
  }>> {
    return fetchApi('/files/search', {
      method: 'POST',
      body: JSON.stringify(params)
    })
  },

  // 代理请求 OpenCode API
  async proxyOpenCodeRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return proxyOpenCode(endpoint, options)
  },

  // 更新全局配置
  async updateGlobalConfig(config: any): Promise<ApiResponse<any>> {
    return proxyOpenCode('/global/config', {
      method: 'PATCH',
      body: JSON.stringify(config)
    })
  },

  // 创建技能（文件夹结构）
  async createSkill(skillData: any): Promise<ApiResponse<any>> {
    return fetchApi('/skill', {
      method: 'POST',
      body: JSON.stringify(skillData)
    })
  },

  // 获取命令和技能列表（OpenCode /command 端点）
  async getCommands(): Promise<ApiResponse<any>> {
    return proxyOpenCode('/command')
  },

  // 获取所有技能（全局+项目）
  async getAllSkills(): Promise<ApiResponse<any>> {
    return fetchApi('/skills')
  },
  
  // 导出技能为ZIP文件
  async exportSkill(skillId: string): Promise<Blob> {
    const response = await fetch(`/api/skill/export/${encodeURIComponent(skillId)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/zip',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to export skill: ${response.status} ${response.statusText}`)
    }
    
    return await response.blob()
  },
  
   // 移动技能（改变范围）
   async moveSkill(skillId: string, fromScope: string, toScope: string, moveFiles: boolean): Promise<ApiResponse<any>> {
     return fetchApi('/skill/move', {
       method: 'POST',
       body: JSON.stringify({
         skillId,
         fromScope,
         toScope,
         moveFiles
       })
     })
   },
   
   // 删除技能
   async deleteSkill(skillId: string): Promise<ApiResponse<any>> {
     return fetchApi(`/skill/${skillId}`, {
       method: 'DELETE'
     })
   },
   
   // 重启服务
  async restartService(): Promise<ApiResponse<any>> {
    return fetchApi('/service/restart', {
      method: 'POST',
      body: JSON.stringify({})
    })
  },

  // 获取服务器信息（前端端口和OpenCode端口）
  async getServerInfo(): Promise<ApiResponse<{port: number, opencodePort: number, opencodeRunning: boolean}>> {
    return fetchApi('/server-info')
  },

  // 获取路径配置（OpenCode路径）
  async getPaths(): Promise<ApiResponse<PathsResponse>> {
    return proxyOpenCode('/path')
  },

  // 读取文件内容
  async readFile(path: string): Promise<ApiResponse<{ content: string, path: string }>> {
    return fetchApi(`/files/content?path=${encodeURIComponent(path)}`)
  },

  // 保存文件（用于JCEF环境下载）
  async saveFile(fileName: string, content: string, mimeType?: string, savePath?: string): Promise<ApiResponse<{ success: boolean, message: string, path?: string }>> {
    return fetchApi('/files/save', {
      method: 'POST',
      body: JSON.stringify({ fileName, content, mimeType, savePath })
    })
  },

  // 选择保存路径（弹出原生文件选择对话框）
  async chooseSavePath(fileName: string): Promise<ApiResponse<{ success: boolean, path: string }>> {
    return fetchApi('/files/choose-save-path', {
      method: 'POST',
      body: JSON.stringify({ fileName })
    })
  },

  // 刷新文件系统（AI 完成操作后重新从磁盘加载）
  async reloadFileSystem(): Promise<ApiResponse<{ success: boolean }>> {
    return fetchApi('/reload', { method: 'POST' })
  },

  // 列出目录内容
  async listDirectory(path: string): Promise<ApiResponse<Array<{ name: string, type: 'file' | 'directory', path: string }>>> {
    // 直接调用Kotlin后端的新端点，而不是通过opencode代理
    const response = await fetchApi<DirectoryListResponse>(`/files/directory?path=${encodeURIComponent(path)}`)
    if (response.error) {
      return { error: response.error }
    }
    if (!response.data?.success) {
      return { error: response.data?.error || 'Failed to list directory' }
    }
    // 转换响应格式以匹配前端期望的类型
    const entries = response.data.entries.map(entry => ({
      name: entry.name,
      type: entry.type as 'file' | 'directory',
      path: entry.path
    }))
    return { data: entries }
  },

  // OpenCode 交互 API
  async replyPermission(requestID: string, reply: 'once' | 'always' | 'reject', message?: string): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/permission/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply, message })
    })
  },

  async getQuestions(): Promise<ApiResponse<any[]>> {
    return proxyOpenCode('/question')
  },

  async replyQuestion(requestID: string, answers: string[][]): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/question/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    })
  },

  async rejectQuestion(requestID: string): Promise<ApiResponse<boolean>> {
    return proxyOpenCode(`/question/${requestID}/reject`, {
      method: 'POST'
    })
  },

  // 会话回滚和分叉
  async revertMessage(sessionId: string, messageId: string, partId?: string): Promise<ApiResponse<any>> {
    const body: any = { messageID: messageId }
    if (partId) {
      body.partID = partId
    }
    return proxyOpenCode(`/session/${sessionId}/revert`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },

  async forkSession(sessionId: string, messageId?: string): Promise<ApiResponse<any>> {
    const body: any = {}
    if (messageId) {
      body.messageID = messageId
    }
    return proxyOpenCode(`/session/${sessionId}/fork`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },



   // 获取权限请求列表
   async getPermissions(directory: string): Promise<ApiResponse<any[]>> {
     return proxyOpenCode(`/permission?directory=${encodeURIComponent(directory)}`)
   },



   // 获取项目路径
   async getProjectPath(): Promise<ApiResponse<{ path: string }>> {
     return fetchApi('/project-path')
   }
}

// 导出获取服务器 URL 的函数
export async function getServerUrl(): Promise<string> {
  // 返回空字符串，使用相对路径
  return ''
}