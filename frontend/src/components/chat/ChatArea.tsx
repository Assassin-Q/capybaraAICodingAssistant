import React, { useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button, Space, Tooltip, Popconfirm, Spin } from 'antd'
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
  currentSessionStatus
}, ref) => {
  
   useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
      }
    }
  }), [scrollRef])
  

  // 使用消息压缩钩子处理会话压缩
  const { processedMessages, lastAIMessageId } = useMessageCompaction(messages, revertedMessageId)
  
  // 检查当前会话是否忙碌
  const isSessionBusy = currentSessionStatus?.type === 'busy'
  
   // 渲染单个消息项
  const renderMessageItem = useCallback((index: number) => {
    const msg = processedMessages[index]
    
    // 检查是否为会话压缩消息，使用单独的SessionCompaction组件渲染
    if (isSessionCompactionMessage(msg)) {
      return <SessionCompaction key={msg.id} message={msg} />
    }
    
    const isAssistant = msg.role === 'assistant'
    const isLoading = msg.status === 'loading' && isAssistant
    const showFooter = msg.role === 'user' && msg.status === 'success'
    // 判断是否显示"思考中..."占位符（MessageContent组件中的逻辑）
    const isShowingThinkingPlaceholder = msg.status === 'loading' && isAssistant && !msg.content && (!msg.parts || msg.parts.length === 0)
    // 显示loading指示器：会话忙碌、是最后一条AI消息、不是思考中占位文本、且是助手消息
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
          padding: '0 12px 15px 12px',
        }}
      >

        
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '80%',
            width: '100%',
            boxSizing: 'border-box',
            alignItems: isAssistant ? 'flex-start' : 'flex-end',
          }}
        >
          {/* 消息内容 */}
          <div
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              padding: '12px 16px',
              borderRadius: 18,
              borderTopLeftRadius: isAssistant ? 4 : 18,
              borderTopRightRadius: isAssistant ? 18 : 4,
              wordBreak: 'break-word',
              position: 'relative',
              boxShadow: 'var(--shadow-sm)',
              fontSize: '14px',
              lineHeight: 1.6,
              maxWidth: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
              transition: 'box-shadow 0.2s ease',
            }}
          >
            {isLoading ? (
              <span style={{ color: 'var(--text-secondary)' }}>思考中...</span>
            ) : (
               <MessageContent 
                 msg={msg} 
                 skills={skills} 
                 mcpServers={mcpServers} 
                 sessionId={currentSessionId || undefined}
                 onGoToSession={onGoToSession}
                 isDark={isDark}
               />

            )}
          </div>
          
          {/* Footer (回滚和分叉按钮) */}
          {showFooter && (
            <Space size="small" style={{ marginTop: 4, marginRight: isAssistant ? 0 : 8 }}>
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
                    style={{ color: 'var(--text-secondary)' }}
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
                    style={{ color: 'var(--text-secondary)' }}
                  />
                </Popconfirm>
              </Tooltip>
            </Space>
           )}
          
          {/* Loading指示器（当会话忙碌且当前消息是最后一条AI消息时） */}
          {showLoading && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center',
              marginTop: 4,
              color: 'var(--text-secondary)',
              fontSize: '12px'
            }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />
              <span style={{ marginLeft: '6px' }}>疯狂Coding中...</span>
            </div>
          )}
        </div>
        

      </div>
    )
  }, [processedMessages, skills, mcpServers, onGoToSession, onRevertMessage, onForkSession, isSessionBusy, lastAIMessageId])
  
  // 加载更多消息的header
  const listHeader = hasMoreMessages ? (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <Button 
        type="link" 
        loading={loadingMoreMessages}
        onClick={loadMoreMessages}
        style={{ color: 'var(--text-secondary)' }}
      >
        {loadingMoreMessages ? '加载中...' : '加载更早的消息'}
      </Button>
    </div>
  ) : null

  // 容器样式
  const containerStyle = useMemo(() => ({
    flex: 1,
    padding: '16px 0 32px 0',
    backgroundColor: isDark ? 'transparent' : '#FFF',
    overflowX: 'hidden' as React.CSSProperties['overflowX'],
    maxWidth: '100%',
    overflowY: 'auto' as React.CSSProperties['overflowY'],
  }), [isDark])

  return (
    <div
       ref={scrollRef as React.Ref<HTMLDivElement>}
      style={containerStyle}
    >
      {listHeader}
       {processedMessages.map((_, index) => renderMessageItem(index))}
    </div>
  )
})

export default ChatArea;