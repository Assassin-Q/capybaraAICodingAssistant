export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: number
  status?: 'loading' | 'success' | 'error'
  thoughtChain?: ThoughtChain
  // AI消息关联
  parentID?: string // 用于关联同一条对话链的消息
  // 消息部分（用于存储多个reasoning和text部分）
  parts?: MessagePart[]
  // 错误信息（例如消息被中断）
  errorInfo?: {
    name: string
    data?: any
  }
}

export interface MessagePart {
  id: string
  type: 'reasoning' | 'text' | 'tool' | 'step-start' | 'step-finish' | 'compaction' | 'file'
  content: string
  time?: {
    start: number
    end?: number
  }
  // tool类型特有字段
  callID?: string
  tool?: string
  state?: {
    status: string
     input?: {
       command?: string
       description?: string
       // read工具字段
       filePath?: string
       offset?: number
       limit?: number
       // edit工具字段
       oldString?: string
       newString?: string
       // task工具字段
       subagent_type?: string
       prompt?: string
     }
    output?: string
    title?: string
     metadata?: {
       output?: string
       exit?: number
       description?: string
       truncated?: boolean
       // read工具字段
       preview?: string
       loaded?: string[]
       // edit工具字段
       diagnostics?: any
       diff?: string
       filediff?: {
         file: string
         additions?: number
         deletions?: number
       }
       // task工具字段
       sessionId?: string
       model?: {
         modelID: string
         providerID: string
       }
     }
    time?: {
      start: number
      end?: number
    }
  }
  // step-start类型特有字段
  snapshot?: string
  // step-finish类型特有字段
  reason?: string
  cost?: number
  tokens?: {
    total: number
    input: number
    output: number
    reasoning: number
    cache?: {
      read: number
      write: number
    }
  }
  // patch类型特有字段
  hash?: string
  files?: string[]
  // compaction类型特有字段
  auto?: boolean
  overflow?: boolean
}

export interface ThoughtChain {
  steps: ThoughtStep[]
  expanded: boolean
}

export interface ThoughtStep {
  id: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  // 关联的AI消息ID
  messageId?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  model: string
}

export interface ModelConfig {
  id: string
  name: string
  provider: string
  isFree?: boolean
}

export interface Provider {
  id: string
  name: string
  models: { [key: string]: ModelInfo }
  key?: string
  auth?: ProviderAuthMethod[]
  isConnected?: boolean
  source?: string
  env?: string[]
  npm?: string
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
  reasoning?: boolean
  attachment?: boolean
  tool_call?: boolean
  modalities?: {
    input: string[]
    output: string[]
  }
  cost?: {
    input: number
    output: number
    cache?: {
      read: number
      write: number
    }
  }
  limit?: {
    context: number
    output?: number
  }
  capabilities?: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input?: { text?: boolean; audio?: boolean; image?: boolean; video?: boolean; pdf?: boolean }
    output?: { text?: boolean; audio?: boolean; image?: boolean; video?: boolean; pdf?: boolean }
  }
}

export interface ProviderAuthMethod {
  id: string
  name: string
  type: 'api_key' | 'oauth' | 'custom'
  description?: string
}

export interface ProviderAuth {
  providerId: string
  apiKey?: string
  [key: string]: unknown
}

export interface SkillConfig {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  scope: 'project' | 'global'
  path?: string
}

export interface MCPServer {
  id: string
  name: string
  url: string
  enabled: boolean
  // 扩展字段以支持OpenCode MCP配置规范
  type?: 'local' | 'remote'
  command?: string[]
  environment?: Record<string, string>
  headers?: Record<string, string>
  oauth?: boolean | {
    clientId?: string
    clientSecret?: string
    scope?: string
  }
  timeout?: number
  // 状态信息
  status?: string
  error?: string
}

export interface PromptTemplate {
  id: string
  name: string
  description: string
  content: string
}

export interface Todo {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  session_id: string
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
  cost?: number
}

export interface ContextUsage {
  used: number
  total: number
  percentage: number
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  tool?: string
  metadata: {
    filepath?: string
  }
  always?: string[]
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: Array<{
    question: string
    header: string
    options: Array<{
      label: string
      description: string
    }>
    multiple?: boolean
  }>
}

export interface PermissionRule {
  pattern: string
  level: 'allow' | 'ask' | 'deny'
}

export interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string
  downloadUrl: string
  checked: boolean
}

export interface PermissionCategory {
  category: string
  rules: PermissionRule[]
}

export interface Settings {
  theme: 'dark' | 'light'
  model: string
  providerId?: string
  promptEnhancementEnabled: boolean
  enhancementLevel: 'low' | 'medium' | 'high'
  autoContextEnabled: boolean
  skills: SkillConfig[]
  mcpServers: MCPServer[]
  promptTemplates: PromptTemplate[]
  permissions: PermissionCategory[]
}

export type SessionStatus =
  | {
      type: "idle"
    }
  | {
      type: "retry"
      attempt: number
      message: string
      next: number
    }
  | {
      type: "busy"
    }

export interface EventSessionStatus {
  type: "session.status"
  properties: {
    sessionID: string
    status: SessionStatus
  }
}