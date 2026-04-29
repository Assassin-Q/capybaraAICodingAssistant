import { useMemo } from 'react'
import type { Message } from '../types'

export interface UseMessageCompactionResult {
  processedMessages: Message[]
  lastAIMessageId: string | null
}

export function useMessageCompaction(
  messages: Message[], 
  revertedMessageId?: string | null
): UseMessageCompactionResult {
  
  const processedMessages = useMemo(() => {
    // 如果设置了回滚的消息ID，过滤掉该消息之后的所有消息
    if (revertedMessageId) {
      const revertIndex = messages.findIndex(msg => msg.id === revertedMessageId)
      if (revertIndex !== -1) {
        return messages.slice(0, revertIndex)
      }
    }
    return messages
  }, [messages, revertedMessageId])

  const lastAIMessageId = useMemo(() => {
    const aiMessages = processedMessages.filter(msg => msg.role === 'assistant')
    return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].id : null
  }, [processedMessages])

  return {
    processedMessages,
    lastAIMessageId
  }
}
