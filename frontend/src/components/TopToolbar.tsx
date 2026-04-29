import React from 'react'
import { Button, Space, Tooltip, Flex, Badge, Dropdown, Input, Progress, Typography } from 'antd'
import {
  SettingOutlined,
  PlusOutlined,
  ReloadOutlined,
  HistoryOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons'
import type { PermissionRequest, QuestionRequest, TokenUsage, ContextUsage, SessionStatus } from '../types'
import type { ServerStatus, Session } from '../utils/kotlinApi'

const { Text } = Typography

interface TopToolbarProps {
  // Server status
  serverStatus: 'loading' | 'not_installed' | 'installed' | 'running'
  serverStatusData?: ServerStatus | null
  onServiceRestart?: () => Promise<void>
  // Current session status
  currentSessionStatus?: SessionStatus | null
  // Theme
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
  // Refresh
  handleRefresh: () => void
  // Token usage
  tokenUsage: TokenUsage | null
  contextUsage: ContextUsage | null
  setTokenUsage: (usage: TokenUsage | null) => void
  setContextUsage: (usage: ContextUsage | null) => void
  // Requests
  permissionRequests: PermissionRequest[]
  questionRequests: QuestionRequest[]
  setCurrentPermission: (req: PermissionRequest | null) => void
  setCurrentQuestion: (req: QuestionRequest | null) => void
  setShowQuestionModal: (show: boolean) => void
  // History
  showHistory: boolean
  setShowHistory: (show: boolean) => void
  // Settings
  setShowSettings: (show: boolean) => void
  // Session
  handleCreateSession: () => void
  sessions: Session[]
  currentSessionId: string | null
  editingSessionTitle: boolean
  sessionTitleInput: string
  setSessionTitleInput: (input: string) => void
  setEditingSessionTitle: (editing: boolean) => void
  handleSaveSessionTitle: () => void
}

const TopToolbar: React.FC<TopToolbarProps> = (props) => {
   // Destructure all props
  const {
    serverStatus,
    serverStatusData,
    onServiceRestart,
    currentSessionStatus,
    isDark,
    onThemeChange,
    handleRefresh,
    tokenUsage,
    contextUsage,
    setTokenUsage,
    setContextUsage,
    // 以下变量不再使用（待处理请求显示已移除）
    // permissionRequests,
    // questionRequests,
    // setCurrentPermission,
    // setCurrentQuestion,
    // setShowQuestionModal,
    showHistory,
    setShowHistory,
    setShowSettings,
    handleCreateSession,
    sessions,
    currentSessionId,
    editingSessionTitle,
    sessionTitleInput,
    setSessionTitleInput,
    setEditingSessionTitle,
    handleSaveSessionTitle,
   } = props

   // 根据会话状态获取图标
  const getStatusIconSrc = () => {
    if (!currentSessionStatus) return '/user.jpg'
    switch (currentSessionStatus.type) {
      case 'busy': return '/busy.jpg'
      case 'retry': return '/retry.jpg'
      case 'idle': return '/user.jpg'
      default: return '/user.jpg'
    }
  }
  
  // 根据会话状态获取tooltip文本
  const getStatusTooltip = () => {
    if (!currentSessionStatus) return '空闲'
    switch (currentSessionStatus.type) {
      case 'busy': return '疯狂Coding中...'
      case 'retry': return 'LLM已失联，正在疯狂抢救...'
      case 'idle': return '偷偷摸鱼中zzZ...'
      default: return '正在与世界建立时空隧道...'
    }
  }
  const statusIconSrc = getStatusIconSrc()
  const statusTooltip = getStatusTooltip()

  // The toolbar JSX will be placed here
  return (
  <Flex
    justify="space-between"
    align="center"
    style={{
      height: 48,
      padding: '0 12px',
      borderBottom: '1px solid var(--border-color)',
    }}
  >
    <Space>
            <Tooltip title={statusTooltip}>
              <img src={statusIconSrc} alt="AI Coding" style={{ width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }} />
            </Tooltip>
     {/* 服务器状态指示器 */}
     {serverStatus === 'loading' ? (
       <Tooltip title="正在检查服务状态...">
         <Badge
           status="processing"
           text="检查中"
         />
       </Tooltip>
     ) : serverStatus === 'not_installed' ? (
       <Tooltip title={
         <div>
           <div>OpenCode AI 服务未安装</div>
           <div>请使用以下命令安装：npm install -g opencode-ai</div>
           <div>或访问官方网站查看安装方法：</div>
           <a href="https://opencode.ai/docs/zh-cn/#%E5%AE%89%E8%A3%85" target="_blank" rel="noopener noreferrer">
             https://opencode.ai/docs/zh-cn/#安装
           </a>
           <div style={{ marginTop: 4 }}>安装完成后重启 IDEA 即可</div>
         </div>
       }>
         <Badge
           status="error"
           text="未安装"
         />
       </Tooltip>
     ) : serverStatus === 'installed' ? (
       <Flex gap={8} align="center">
         <Tooltip title={
           <div>
             <div>OpenCode 服务已安装但未运行</div>
             {serverStatusData?.version && <div>版本: {serverStatusData.version}</div>}
             <div style={{ marginTop: 4 }}>服务可能已崩溃，请尝试重启</div>
           </div>
         }>
           <Badge
             status="warning"
             text={`已停止${serverStatusData?.version ? ` (${serverStatusData.version})` : ''}`}
           />
         </Tooltip>
         {onServiceRestart && (
           <Button size="small" type="primary" onClick={onServiceRestart}>
             重启服务
           </Button>
         )}
       </Flex>
      ) : (
       <Tooltip title={
         <div>
           <div>OpenCode 服务运行中</div>
           {serverStatusData?.version && <div>版本: {serverStatusData.version}</div>}
            {serverStatusData?.servicePort && <div>OpenCode 端口: {serverStatusData.servicePort}</div>}
         </div>
       }>
         <Badge
           status="success"
           text={`在线${serverStatusData?.version ? ` (${serverStatusData.version})` : ''}`}
         />
       </Tooltip>
     )}
       <Tooltip title={isDark ? '切换到浅色主题' : '切换到深色主题'}>
         <Button
             type="text"
             icon={isDark ? <SunOutlined /> : <MoonOutlined />}
             onClick={() => onThemeChange(!isDark)}
             style={{ color: 'var(--text-secondary)' }}
         />
       </Tooltip>
       <Tooltip title="刷新">
         <Button
             type="text"
             icon={<ReloadOutlined />}
             onClick={handleRefresh}
             style={{ color: 'var(--text-secondary)' }}
         />
       </Tooltip>
   </Space>
   <Space>
     {/* Token 使用统计 */}
     {(tokenUsage || contextUsage) && (
       <Dropdown
         dropdownRender={() => (
           <div style={{
             padding: 12,
             backgroundColor: 'var(--bg-primary)',
             border: '1px solid var(--border-color)',
             borderRadius: 8,
             width: 300,
           }}>
             <div style={{ marginBottom: 8 }}>
               <Text strong style={{ color: 'var(--text-primary)' }}>Token 使用统计</Text>
             </div>
             
             {/* 上下文使用率进度条 */}
             {contextUsage && (
               <div style={{ marginBottom: 12 }}>
                 <Flex justify="space-between" style={{ marginBottom: 4 }}>
                   <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>上下文使用率</Text>
                   <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                     {contextUsage.used.toLocaleString()}/{contextUsage.total.toLocaleString()} tokens
                     ({contextUsage.percentage.toFixed(1)}%)
                   </Text>
                 </Flex>
                 <Progress 
                   percent={contextUsage.percentage} 
                   size="small" 
                   strokeColor="var(--accent-color)"
                   trailColor="var(--bg-tertiary)"
                 />
               </div>
             )}
             
             {/* Token 使用明细 */}
             {tokenUsage && (
               <div style={{ marginBottom: 12 }}>
                 <div style={{ marginBottom: 4 }}>
                   <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Token 使用明细</Text>
                 </div>
                 <Flex vertical gap={4}>
                   <Flex justify="space-between">
                     <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>提示词 Tokens:</Text>
                     <Text style={{ color: 'var(--text-primary)', fontSize: 12 }}>
                       {tokenUsage.prompt.toLocaleString()}
                     </Text>
                   </Flex>
                   <Flex justify="space-between">
                     <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>完成 Tokens:</Text>
                     <Text style={{ color: 'var(--text-primary)', fontSize: 12 }}>
                       {tokenUsage.completion.toLocaleString()}
                     </Text>
                   </Flex>
                   <Flex justify="space-between">
                     <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>总计 Tokens:</Text>
                     <Text strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>
                       {tokenUsage.total.toLocaleString()}
                     </Text>
                   </Flex>
                   {tokenUsage.cost !== undefined && tokenUsage.cost > 0 && (
                     <Flex justify="space-between">
                       <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>估算花费:</Text>
                       <Text strong style={{ color: tokenUsage.cost > 0.1 ? 'var(--error-color)' : 'var(--success-color)', fontSize: 12 }}>
                         ${tokenUsage.cost.toFixed(4)}
                       </Text>
                     </Flex>
                   )}
                 </Flex>
               </div>
             )}
             
             <Button 
               type="link" 
               size="small" 
               onClick={() => {
                 setTokenUsage(null)
                 setContextUsage(null)
               }}
               style={{ color: 'var(--text-secondary)', fontSize: 12 }}
             >
               清除统计
             </Button>
           </div>
         )}
         trigger={['click']}
       >
         <Badge
           count={tokenUsage?.total || 0}
           style={{ 
             backgroundColor: tokenUsage?.total ? 'var(--accent-color)' : 'var(--text-secondary)',
             cursor: 'pointer'
           }}
         >
           <Button 
             type="text" 
             size="small"
             style={{ color: 'var(--text-secondary)', padding: '4px 8px' }}
           >
             Token
           </Button>
         </Badge>
       </Dropdown>
     )}
     
      {/* 待处理请求 - 已移除，改为逐个显示 */}
     
     {/* 当前会话标题 */}
     {currentSessionId && (
       <Space style={{ marginRight: 16 }}>
         {editingSessionTitle ? (
           <Input
             size="small"
             value={sessionTitleInput}
             onChange={e => setSessionTitleInput(e.target.value)}
             onBlur={() => handleSaveSessionTitle()}
             onKeyDown={e => {
               if (e.key === 'Enter') {
                 handleSaveSessionTitle()
               } else if (e.key === 'Escape') {
                 setEditingSessionTitle(false)
                 setSessionTitleInput('')
               }
             }}
             autoFocus
             style={{ width: 200 }}
           />
         ) : (
           <Text
             style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
             onClick={() => {
               const currentSession = sessions.find(s => s.id === currentSessionId!)
               setSessionTitleInput(currentSession?.title || '新对话')
               setEditingSessionTitle(true)
             }}
           >
             {(() => {
               const currentSession = sessions.find(s => s.id === currentSessionId!)
               return currentSession?.title || '新对话'
             })()}
           </Text>
         )}
       </Space>
     )}
     
      <Tooltip title={serverStatus !== 'running' ? '服务未运行，无法使用此功能' : '新建对话'}>
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={handleCreateSession}
          disabled={serverStatus !== 'running'}
          style={{ color: serverStatus !== 'running' ? 'var(--text-disabled)' : 'var(--text-secondary)' }}
        />
      </Tooltip>
      <Tooltip title={serverStatus !== 'running' ? '服务未运行，无法使用此功能' : '历史会话'}>
        <Button
          type="text"
          icon={<HistoryOutlined />}
          onClick={() => setShowHistory(!showHistory)}
          disabled={serverStatus !== 'running'}
          style={{ color: serverStatus !== 'running' ? 'var(--text-disabled)' : 'var(--text-secondary)' }}
        />
      </Tooltip>
      <Tooltip title={serverStatus !== 'running' ? '服务未运行，无法使用此功能' : '设置'}>
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={() => setShowSettings(true)}
          disabled={serverStatus !== 'running'}
          style={{ color: serverStatus !== 'running' ? 'var(--text-disabled)' : 'var(--text-secondary)' }}
        />
      </Tooltip>

   </Space>
 </Flex>
  )
}

export default TopToolbar