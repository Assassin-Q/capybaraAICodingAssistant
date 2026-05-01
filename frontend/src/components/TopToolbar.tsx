import React from 'react'
import { Button, Tooltip, Flex, Badge, Dropdown, Input, Progress, Typography, Tag, message as antMessage } from 'antd'
import {
  PlusOutlined,
  HistoryOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  ReloadOutlined,
  ApiOutlined,
  AppstoreOutlined,
  BulbOutlined,
  SafetyOutlined,
  BgColorsOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { PermissionRequest, QuestionRequest, TokenUsage, ContextUsage, SessionStatus, UpdateInfo } from '../types'
import type { ServerStatus, Session } from '../utils/kotlinApi'

const { Text } = Typography

interface TopToolbarProps {
  serverStatus: 'loading' | 'not_installed' | 'installed' | 'running'
  serverStatusData?: ServerStatus | null
  onServiceRestart?: () => Promise<void>
  currentSessionStatus?: SessionStatus | null
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
  handleRefresh: () => void
  tokenUsage: TokenUsage | null
  contextUsage: ContextUsage | null
  setTokenUsage: (usage: TokenUsage | null) => void
  setContextUsage: (usage: ContextUsage | null) => void
  permissionRequests: PermissionRequest[]
  questionRequests: QuestionRequest[]
  setCurrentPermission: (req: PermissionRequest | null) => void
  setCurrentQuestion: (req: QuestionRequest | null) => void
  setShowQuestionModal: (show: boolean) => void
  showHistory: boolean
  setShowHistory: (show: boolean) => void
  onOpenSettings: (section: string) => void
  handleCreateSession: () => void
  sessions: Session[]
  currentSessionId: string | null
  editingSessionTitle: boolean
  sessionTitleInput: string
  setSessionTitleInput: (input: string) => void
  setEditingSessionTitle: (editing: boolean) => void
  handleSaveSessionTitle: () => void
  appVersion: string
  updateInfo: UpdateInfo
  onCheckUpdate: () => Promise<{ hasUpdate: boolean; latestVersion: string; downloadUrl: string }>
}

const TopToolbar: React.FC<TopToolbarProps> = (props) => {
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
    showHistory,
    setShowHistory,
    onOpenSettings,
    handleCreateSession,
    sessions,
    currentSessionId,
    editingSessionTitle,
    sessionTitleInput,
    setSessionTitleInput,
    setEditingSessionTitle,
    handleSaveSessionTitle,
    appVersion,
    updateInfo,
    onCheckUpdate,
  } = props

  const getStatusIconSrc = () => {
    if (!currentSessionStatus) return '/user.jpg'
    switch (currentSessionStatus.type) {
      case 'busy': return '/busy.jpg'
      case 'retry': return '/retry.jpg'
      case 'idle': return '/user.jpg'
      default: return '/user.jpg'
    }
  }

  const getStatusTooltip = () => {
    if (!currentSessionStatus) return '空闲'
    switch (currentSessionStatus.type) {
      case 'busy': return '疯狂Coding中...'
      case 'retry': return 'LLM已失联，正在疯狂抢救...'
      case 'idle': return '偷偷摸鱼中zzZ...'
      default: return '正在与世界建立时空隧道...'
    }
  }

  const getServerStatusTooltip = () => {
    switch (serverStatus) {
      case 'running':
        return (
          <div>
            <div>OpenCode 服务运行中</div>
            {serverStatusData?.version && <div>版本: {serverStatusData.version}</div>}
            {serverStatusData?.servicePort && <div>OpenCode 端口: {serverStatusData.servicePort}</div>}
          </div>
        )
      case 'not_installed':
        return (
          <div>
            <div>OpenCode AI 服务未安装</div>
            <div>请使用以下命令安装：npm install -g opencode-ai</div>
            <div>或访问官方网站查看安装方法：</div>
            <a href="https://opencode.ai/docs/zh-cn/#%E5%AE%89%E8%A3%85" target="_blank" rel="noopener noreferrer">
              https://opencode.ai/docs/zh-cn/#安装
            </a>
            <div style={{ marginTop: 4 }}>安装完成后重启 IDEA 即可</div>
          </div>
        )
      case 'installed':
        return (
          <div>
            <div>OpenCode 服务已安装但未运行</div>
            {serverStatusData?.version && <div>版本: {serverStatusData.version}</div>}
            <div style={{ marginTop: 4 }}>服务可能已崩溃，请尝试重启</div>
          </div>
        )
      case 'loading':
        return <div>正在检查服务状态...</div>
      default:
        return null
    }
  }

  const statusIconSrc = getStatusIconSrc()
  const statusTooltip = getStatusTooltip()
  const serverStatusTooltip = getServerStatusTooltip()

  const currentSession = sessions.find(s => s.id === currentSessionId!)

  return (
    <Flex
      justify="space-between"
      align="center"
      style={{
        height: 40,
        padding: '0 10px',
        flexShrink: 0,
        // background: 'var(--glass-bg-heavy)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderRadius: 12,
        border: '1px solid var(--glass-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        gap: 8,
      }}
      >
      {/* 左侧：Logo + 状态 + 操作按钮 */}
      <Flex align="center" gap={4} style={{ flexShrink: 0 }}>
        <Tooltip title={statusTooltip}>
          <img
            src={statusIconSrc}
            alt="AI Coding"
            style={{ width: 22, height: 22, borderRadius: 4, cursor: 'pointer' }}
          />
        </Tooltip>
        <Tooltip title={serverStatusTooltip}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4, cursor: 'pointer' }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: serverStatus === 'running' ? 'var(--success-color)'
                : serverStatus === 'installed' ? 'var(--warning-color)'
                : serverStatus === 'loading' ? 'var(--text-secondary)'
                : 'var(--error-color)',
              flexShrink: 0,
              ...(serverStatus === 'running' ? { animation: 'pulse-dot 2s infinite' } : {}),
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {serverStatus === 'running' ? `在线${serverStatusData?.version ? ` (${serverStatusData.version})` : ''}`
                : serverStatus === 'installed' ? '已停止'
                : serverStatus === 'loading' ? '检查中'
                : '未安装'}
            </span>
          </div>
        </Tooltip>

        {/* 分隔线 */}
        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-color)', margin: '0 2px' }} />

        {/* 主题切换 */}
        <Tooltip title={isDark ? '浅色主题' : '深色主题'}>
          <Button
            type="text"
            size="small"
            icon={isDark ? <SunOutlined style={{ fontSize: 13 }} /> : <MoonOutlined style={{ fontSize: 13 }} />}
            onClick={() => onThemeChange(!isDark)}
            style={{ color: 'var(--text-secondary)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}
          />
        </Tooltip>

        {/* 刷新 */}
        <Tooltip title="刷新">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined style={{ fontSize: 13 }} />}
            onClick={handleRefresh}
            style={{ color: 'var(--text-secondary)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}
          />
        </Tooltip>
      </Flex>

      {/* 右侧：工具栏按钮 */}
      <Flex align="center" gap={2} style={{ flexShrink: 0 }}>
        {/* 会话标题 */}
        {currentSessionId && (
          <Tooltip title="点击重命名">
            {editingSessionTitle ? (
              <Input
                size="small"
                value={sessionTitleInput}
                onChange={e => setSessionTitleInput(e.target.value)}
                onBlur={() => handleSaveSessionTitle()}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveSessionTitle()
                  else if (e.key === 'Escape') { setEditingSessionTitle(false); setSessionTitleInput('') }
                }}
                autoFocus
                style={{ width: 140, fontSize: 11, borderRadius: 2 }}
              />
            ) : (
              <div
                onClick={() => {
                  const cs = sessions.find(s => s.id === currentSessionId!)
                  setSessionTitleInput(cs?.title || '新对话')
                  setEditingSessionTitle(true)
                }}
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: 2,
                  border: '1px solid var(--border-light)',
                  maxWidth: 120,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginRight: 8,
                }}
              >
                {currentSession?.title || '新对话'}
              </div>
            )}
          </Tooltip>
        )}

        {/* Token 使用统计 */}
        {(tokenUsage || contextUsage) && (
          <Dropdown
            popupRender={() => (
              <div style={{
                padding: 10,
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                width: 260,
              }}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>Token 使用统计</Text>
                </div>
                {contextUsage && (
                  <div style={{ marginBottom: 10 }}>
                    <Flex justify="space-between" style={{ marginBottom: 2 }}>
                      <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>上下文使用率</Text>
                      <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
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
                {tokenUsage && (
                  <div style={{ marginBottom: 8 }}>
                    <Flex vertical gap={2}>
                      <Flex justify="space-between">
                        <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>提示词</Text>
                        <Text style={{ color: 'var(--text-primary)', fontSize: 10 }}>{tokenUsage.prompt.toLocaleString()}</Text>
                      </Flex>
                      <Flex justify="space-between">
                        <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>完成</Text>
                        <Text style={{ color: 'var(--text-primary)', fontSize: 10 }}>{tokenUsage.completion.toLocaleString()}</Text>
                      </Flex>
                      <Flex justify="space-between">
                        <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>总计</Text>
                        <Text strong style={{ color: 'var(--text-primary)', fontSize: 10 }}>{tokenUsage.total.toLocaleString()}</Text>
                      </Flex>
                      {tokenUsage.cost !== undefined && tokenUsage.cost > 0 && (
                        <Flex justify="space-between">
                          <Text style={{ color: 'var(--text-secondary)', fontSize: 10 }}>费用</Text>
                          <Text style={{ color: 'var(--error-color)', fontSize: 10 }}>${tokenUsage.cost.toFixed(4)}</Text>
                        </Flex>
                      )}
                    </Flex>
                  </div>
                )}
                <Button type="link" size="small" onClick={() => { setTokenUsage(null); setContextUsage(null) }}
                  style={{ color: 'var(--text-secondary)', fontSize: 10, padding: 0 }}>
                  清除统计
                </Button>
              </div>
            )}
            trigger={['click']}
          >
            <Badge count={tokenUsage?.total || 0} style={{ backgroundColor: 'var(--accent-color)', fontSize: 9 }}>
              <Button type="text" size="small" style={{ color: 'var(--text-secondary)', fontSize: 11, padding: '2px 6px' }}>Token</Button>
            </Badge>
          </Dropdown>
        )}

        {/* 新建对话按钮 */}
        <Tooltip title={serverStatus !== 'running' ? '服务未运行' : '新建对话'}>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined style={{ fontSize: 13 }} />}
            onClick={handleCreateSession}
            disabled={serverStatus !== 'running'}
            style={{ color: 'var(--accent-color)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}
          />
        </Tooltip>

        {/* 历史会话按钮 */}
        <Tooltip title={serverStatus !== 'running' ? '服务未运行' : '历史会话'}>
          <Button
            type="text"
            size="small"
            icon={<HistoryOutlined style={{ fontSize: 13 }} />}
            onClick={() => setShowHistory(!showHistory)}
            disabled={serverStatus !== 'running'}
            style={{ color: 'var(--text-secondary)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}
          />
        </Tooltip>

        {/* 分隔线 */}
        <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

        {/* 设置齿轮 + 下拉菜单 */}
        <Dropdown
          popupRender={() => (
            <div style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              width: 220,
              padding: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}>
              <div style={{ padding: '6px 10px', marginBottom: 2 }}>
                <Text style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>AI 助手设置</Text>
                <Tag style={{ marginLeft: 6, fontSize: 9, lineHeight: '16px', padding: '0 4px', border: 'none', color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)' }}>v{appVersion}</Tag>
              </div>

              <div
                onClick={() => onOpenSettings('model')}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <BulbOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>模型配置</span>
              </div>
              <div
                onClick={() => onOpenSettings('mcp')}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <ApiOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>MCP 服务器</span>
              </div>
              <div
                onClick={() => onOpenSettings('skills')}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <AppstoreOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>技能管理</span>
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--border-light)', margin: '2px 8px' }} />

              <div
                onClick={() => { onThemeChange(!isDark) }}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <BgColorsOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>外观主题</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-secondary)' }}>
                  {isDark ? '深色' : '浅色'}
                </span>
              </div>
              <div
                onClick={() => onOpenSettings('permissions')}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <SafetyOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>权限管理</span>
              </div>
              <div
                onClick={handleRefresh}
                className="settings-menu-item"
                style={menuItemStyle}
              >
                <ReloadOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>刷新</span>
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--border-light)', margin: '2px 8px' }} />

              <div
                onClick={async () => {
                  const result = await onCheckUpdate()
                  if (result.hasUpdate) {
                    window.open(result.downloadUrl, '_blank')
                  } else {
                    antMessage.success('当前已是最新版本')
                  }
                }}
                className="settings-menu-item"
                style={{ ...menuItemStyle, color: updateInfo.checked && updateInfo.hasUpdate ? 'var(--accent-color)' : 'var(--text-primary)' }}
              >
                <DownloadOutlined style={{ fontSize: 12, marginRight: 6 }} />
                <span>{updateInfo.checked && updateInfo.hasUpdate ? `新版本 v${updateInfo.latestVersion} 可下载` : '版本检查'}</span>
                {updateInfo.checked && updateInfo.hasUpdate && (
                  <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--error-color)' }} />
                )}
              </div>

              {serverStatus === 'installed' && onServiceRestart && (
                <div style={{ height: 1, backgroundColor: 'var(--border-light)', margin: '2px 8px' }} />
              )}
              {serverStatus === 'installed' && onServiceRestart && (
                <div
                  onClick={onServiceRestart}
                  className="settings-menu-item"
                  style={{ ...menuItemStyle, color: 'var(--error-color)' }}
                >
                  <ReloadOutlined style={{ fontSize: 12, marginRight: 6 }} />
                  <span>重启服务</span>
                </div>
              )}
            </div>
          )}
          trigger={['hover']}
        >
          <Badge dot={updateInfo.checked && updateInfo.hasUpdate} color="var(--error-color)" offset={[-3, 3]}>
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined style={{ fontSize: 13 }} />}
            disabled={serverStatus !== 'running'}
            style={{ color: 'var(--text-secondary)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}
          />
          </Badge>
        </Dropdown>
      </Flex>
    </Flex>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 10px',
  fontSize: 11,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  borderRadius: 2,
  transition: 'background-color 0.15s',
}

export default TopToolbar
