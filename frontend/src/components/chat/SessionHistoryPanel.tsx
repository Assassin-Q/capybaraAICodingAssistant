import React, { useEffect, useRef } from 'react'
import { Badge, Typography, Tooltip, Popconfirm } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import type { SessionStatus } from '../../types'

const { Text } = Typography

interface SessionHistoryPanelProps {
  showHistory: boolean
  sessions: any[]
  currentSessionId: string | null
  activeSessions: Set<string>
  sessionStatuses: Record<string, SessionStatus>
  onSessionChange: (sessionId: string | null) => void
  onClose: () => void
  onDeleteSession?: (sessionId: string) => void
  onRevertedMessageIdReset?: () => void
}

const SessionHistoryPanel: React.FC<SessionHistoryPanelProps> = ({
  showHistory,
  sessions,
  currentSessionId,
  activeSessions,
  sessionStatuses,
  onSessionChange,
  onClose,
  onDeleteSession,
  onRevertedMessageIdReset
}) => {
  const historyPanelRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭历史会话面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showHistory && 
          historyPanelRef.current && 
          !historyPanelRef.current.contains(event.target as Node)) {
        // 忽略点击 antd 弹出层（Popconfirm、Popover等）
        const target = event.target as HTMLElement
        if (target.closest('.ant-popover') || target.closest('.ant-modal')) return
        onClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showHistory, onClose])

  // 会话列表
  const conversationItems = sessions.map(session => {
    const isActive = activeSessions.has(session.id)
    const status = sessionStatuses[session.id] || 'idle'
    
    // 获取状态类型字符串
    const getStatusType = (): string => {
      if (typeof status === 'string') return status
      return status.type
    }
    const statusType = getStatusType()
    
    // 根据状态类型获取tooltip文本
    const getStatusTooltip = (type: string): string => {
      switch (type) {
        case 'busy': return '疯狂Coding中...'
        case 'retry': return 'LLM已失联，正在疯狂抢救...'
        case 'idle': return '偷偷摸鱼中zzZ...'
        case 'completed': return '已完成'
        case 'error': return '错误'
        default: return '正在与世界建立时空隧道...'
      }
    }
    
    let statusIcon = null
    if (isActive) {
      statusIcon = (
        <Tooltip title="会话活跃中">
          <Badge status="processing" style={{ marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else if (statusType === 'busy') {
      statusIcon = (
        <Tooltip title={getStatusTooltip(statusType)}>
          <img src="/busy.jpg" alt="busy" style={{ width: 16, height: 16, marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else if (statusType === 'retry') {
      statusIcon = (
        <Tooltip title={getStatusTooltip(statusType)}>
          <img src="/retry.jpg" alt="retry" style={{ width: 16, height: 16, marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else if (statusType === 'idle') {
      statusIcon = (
        <Tooltip title={getStatusTooltip(statusType)}>
          <img src="/user.jpg" alt="idle" style={{ width: 16, height: 16, marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else if (statusType === 'completed') {
      statusIcon = (
        <Tooltip title={getStatusTooltip(statusType)}>
          <Badge status="success" style={{ marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else if (statusType === 'error') {
      statusIcon = (
        <Tooltip title={getStatusTooltip(statusType)}>
          <Badge status="error" style={{ marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    } else {
      // 其他未知状态，默认显示idle图标
      statusIcon = (
        <Tooltip title={getStatusTooltip('idle')}>
          <img src="/user.jpg" alt="idle" style={{ width: 16, height: 16, marginRight: 8, cursor: 'pointer' }} />
        </Tooltip>
      )
    }
    
    const titleText = session.title || '新会话'
    return {
      key: session.id,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
          {statusIcon}
          <Tooltip title={titleText}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleText}</span>
          </Tooltip>
          {onDeleteSession && (
            <Popconfirm
              title="确认删除此会话？"
              onConfirm={(e) => { e?.stopPropagation(); e?.preventDefault(); onDeleteSession(session.id) }}
              onCancel={(e) => { e?.stopPropagation(); e?.preventDefault() }}
              overlayStyle={{ zIndex: 200 }}
            >
              <DeleteOutlined 
                style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault() }}
              />
            </Popconfirm>
          )}
        </div>
      ),
    }
  })

  if (!showHistory) return null

  const handleActiveChange = (key: string | null) => {
    onSessionChange(key)
    onClose()
    if (onRevertedMessageIdReset) {
      onRevertedMessageIdReset()
    }
  }

  return (
    <div
      ref={historyPanelRef}
      style={{
        position: 'absolute',
        top: 48,
        right: 0,
        width: 300,
        height: 'calc(100% - 48px)',
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-color)',
        zIndex: 100,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: 16 }}>
        <Text strong style={{ color: 'var(--text-primary)' }}>历史会话</Text>
      </div>
      <Conversations
        items={conversationItems}
        activeKey={currentSessionId || undefined}
        onActiveChange={handleActiveChange}
        style={{ padding: '0 16px 16px' }}
      />
    </div>
  )
}

export default SessionHistoryPanel