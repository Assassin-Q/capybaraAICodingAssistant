import type { Message, MessagePart } from '../types'

/**
 * 检查消息是否为会话压缩消息
 * 包括特定系统消息和带有压缩标记的消息
 */
export function isSessionCompactionMessage(message: Message): boolean {
  // 检查是否为特定系统消息：Continue if you have next steps...
  const isContinueMessage = message.role === 'user' && 
    message.content && 
    message.content.trim() === 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.'

  // 检查消息中是否有会话压缩标记
  const hasCompactionMarker = message.role === 'user' && 
    message.parts?.some((part: MessagePart) => part.type === 'compaction') || false

  return isContinueMessage || hasCompactionMarker
}

/**
 * 获取会话压缩标签文本
 */
export function getCompactionLabel(message: Message): string {
  const isContinueMessage = message.role === 'user' && 
    message.content && 
    message.content.trim() === 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.'
    
  return isContinueMessage ? '会话压缩完毕，继续处理' : '会话压缩'
}