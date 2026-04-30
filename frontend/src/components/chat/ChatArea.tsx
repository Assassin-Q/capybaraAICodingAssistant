import React, { useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button, Tooltip, Popconfirm, Spin } from 'antd'
import { RollbackOutlined, ForkOutlined, LoadingOutlined } from '@ant-design/icons'
import type { Message, SkillConfig, MCPServer, SessionStatus } from '../../types'
import MessageContent from './MessageContent'
import SessionCompaction from './SessionCompaction'
import { useMessageCompaction } from '../../hooks/useMessageCompaction'
import { isSessionCompactionMessage } from '../../utils/messageUtils'

interface ChatAreaProps {
  messages: Message[]
  revertedMessageId: string | null
  hasMoreMessages: boolean
  loadingMoreMessages: boolean
  isDark: boolean
  scrollRef: React.RefObject<HTMLElement>
  loadMoreMessages: () => Promise<void>
  onRevertMessage: (messageId: string, partId?: string) => Promise<void>
  onForkSession: (messageId?: string) => Promise<void>
  onGoToSession?: (sessionId: string) => void
  skills: SkillConfig[]
  mcpServers: MCPServer[]
  currentSessionStatus?: SessionStatus
  currentSessionId?: string | null
  bottomSpacerHeight?: number
}

export interface ChatAreaHandle {
  scrollToBottom: () => void
}

const ChatArea = forwardRef<ChatAreaHandle, ChatAreaProps>(({
  messages,
  revertedMessageId,
  hasMoreMessages,
  loadingMoreMessages,
  isDark,
  scrollRef,
  loadMoreMessages,
  onRevertMessage,
  onForkSession,
  onGoToSession,
  skills,
  mcpServers,
  currentSessionId,
  currentSessionStatus,
  bottomSpacerHeight = 120,
}, ref) => {

   useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
      }
    }
  }), [scrollRef])

  const { processedMessages, lastAIMessageId } = useMessageCompaction(messages, revertedMessageId)
  const isSessionBusy = currentSessionStatus?.type === 'busy'

  const renderMessageItem = useCallback((index: number) => {
    const msg = processedMessages[index]

    if (isSessionCompactionMessage(msg)) {
      return <SessionCompaction key={msg.id} message={msg} />
    }

    const isAssistant = msg.role === 'assistant'
    const showFooter = msg.role === 'user' && msg.status === 'success'
    const isShowingThinkingPlaceholder = msg.status === 'loading' && isAssistant && !msg.content && (!msg.parts || msg.parts.length === 0)
    const showLoading = isSessionBusy &&
      msg.id === lastAIMessageId &&
      (msg.content || '').trim() !== '思考中...' &&
      !isShowingThinkingPlaceholder &&
      isAssistant &&
      !msg.errorInfo

    return (
      <div
        key={msg.id}
        style={{
          display: 'flex',
          justifyContent: isAssistant ? 'flex-start' : 'flex-end',
          padding: '0 12px 16px 12px',
        }}
      >
        <div style={{ width: '100%', minWidth: 0 }}>
          <div
            style={{
              color: 'var(--text-primary)',
              fontSize: 14,
              lineHeight: 1.6,
              wordBreak: 'break-word',
              overflow: 'hidden',
            }}
          >
            <MessageContent
              msg={msg}
              skills={skills}
              mcpServers={mcpServers}
              sessionId={currentSessionId || undefined}
              onGoToSession={onGoToSession}
              isDark={isDark}
            />
          </div>

          {/* Footer 操作按钮 */}
          {showFooter && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <Tooltip title="回滚到该消息">
                <Popconfirm
                  title="您确认需要回滚到该消息节点吗？该消息之后的修改内容将自动回滚，回滚后无法撤回！"
                  onConfirm={() => onRevertMessage(msg.id, msg.parts?.[0]?.id)}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<RollbackOutlined />}
                    style={{ color: 'var(--text-secondary)', fontSize: 11 }}
                  />
                </Popconfirm>
              </Tooltip>
              <Tooltip title="分叉会话">
                <Popconfirm
                  title="您确认需要分叉到新消息中吗？"
                  onConfirm={() => onForkSession(msg.id)}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<ForkOutlined />}
                    style={{ color: 'var(--text-secondary)', fontSize: 11 }}
                  />
                </Popconfirm>
              </Tooltip>
            </div>
          )}

          {showLoading && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 6,
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
            }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />
              <span style={{ marginLeft: 6 }}>疯狂 Coding 中...</span>
            </div>
          )}
        </div>
      </div>
    )
  }, [processedMessages, skills, mcpServers, onGoToSession, onRevertMessage, onForkSession, isSessionBusy, lastAIMessageId])

  const listHeader = hasMoreMessages ? (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <Button
        type="link"
        loading={loadingMoreMessages}
        onClick={loadMoreMessages}
        style={{ color: 'var(--text-secondary)', fontSize: 12 }}
      >
        {loadingMoreMessages ? '加载中...' : '加载更早的消息'}
      </Button>
    </div>
  ) : null

  const containerStyle = useMemo(() => ({
    flex: 1,
    backgroundColor: 'var(--bg-primary)',
    overflowX: 'hidden' as React.CSSProperties['overflowX'],
    maxWidth: '100%',
    overflowY: 'scroll' as React.CSSProperties['overflowY'],
    scrollbarWidth: 'none' as any,
  }), [])

  return (
    <div
      ref={scrollRef as React.Ref<HTMLDivElement>}
      style={containerStyle}
      className="chat-scroll-area"
    >
      {/* 顶部占位，留出工具栏高度 */}
      <div style={{ height: 48, flexShrink: 0 }} />
      {listHeader}
      {processedMessages.map((_, index) => renderMessageItem(index))}
      <div style={{ height: bottomSpacerHeight, flexShrink: 0 }} />
    </div>
  )
})

export default ChatArea;