import { useEffect, useRef } from 'react'
import { XStream } from '@ant-design/x-sdk'
import { getServerUrl, kotlinApi } from '../utils/kotlinApi'
import { evaluatePermission, mapDecisionToReply } from '../utils/permissionUtils'
import type { Message, MessagePart, Todo, ThoughtStep, PermissionRequest, QuestionRequest, SessionStatus, Settings } from '../types'
import type { ChatMessage } from '../utils/kotlinApi'

interface UseSSEHandlerProps {
  currentSessionId: string | null
  serverStatus: string
  sseReconnectKey?: number
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setPermissionRequests: React.Dispatch<React.SetStateAction<PermissionRequest[]>>
  setQuestionRequests: React.Dispatch<React.SetStateAction<QuestionRequest[]>>
  setCurrentPermission: React.Dispatch<React.SetStateAction<PermissionRequest | null>>
  setCurrentQuestion: React.Dispatch<React.SetStateAction<QuestionRequest | null>>
  setCurrentQuestionIndex: React.Dispatch<React.SetStateAction<number>>
  setSelectedAnswers: React.Dispatch<React.SetStateAction<string[][]>>
  setCustomAnswers: React.Dispatch<React.SetStateAction<string[]>>
  setPermissionMessage: React.Dispatch<React.SetStateAction<string>>
  loadProviders: () => void
  setAttachments: React.Dispatch<React.SetStateAction<any[]>>
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  setProcessedMessageIds: React.Dispatch<React.SetStateAction<Set<string>>>
  processedMessageIds: Set<string>
  setTodos: React.Dispatch<React.SetStateAction<Todo[]>>
  generateTodoId: (content: string) => string
   currentPermission: PermissionRequest | null
   currentQuestion: QuestionRequest | null
    setSessionStatuses: React.Dispatch<React.SetStateAction<Record<string, SessionStatus>>>
  autoConfirm: boolean
  settings: Settings
  setRightClickFileInfo?: React.Dispatch<React.SetStateAction<{
    fileName: string
    lineRange?: { start: number; end: number }
    type: string
  } | undefined>>
 }

// 格式化右键菜单消息 - 使用标签格式
const formatRightClickMessage = (chatMsg: ChatMessage): string => {
  const { type, content, fileName, lineRange } = chatMsg
  
  if (type === 'file') {
    // 文件引用格式: 【文件路径 行1~20行】
    const lineStr = lineRange ? ` ${lineRange.start}行~${lineRange.end}行` : ''
    return `【${fileName || 'unknown'}${lineStr}】`
  } else if (type === 'add_to_chat') {
    // 添加到对话的代码：只包含文件名和行范围信息，不添加标注
    // 检查是否只有文件路径（没有选中文本）
    const hasCode = content !== fileName
    if (hasCode) {
      // 有选中的代码
      const language = fileName?.split('.').pop() || ''
      const codeBlock = `\`\`\`${language}\n${content}\n\`\`\``
      const fileInfo = fileName ? `文件: ${fileName}` + (lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : '') : ''
      const prompt = fileInfo ? `【${fileInfo}】\n` : ''
      return `${prompt}${codeBlock}`
    } else {
      // 只有文件路径，没有选中文本
      return `文件: ${fileName || 'unknown'}`
    }
  } else if (type === 'optimize_code' || type === 'code') {
    // 优化代码：添加【优化代码】标注
    const hasCode = content !== fileName
    if (hasCode) {
      const language = fileName?.split('.').pop() || ''
      const codeBlock = `\`\`\`${language}\n${content}\n\`\`\``
      const fileInfo = fileName ? `文件: ${fileName}` + (lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : '') : ''
      const prompt = fileInfo ? `【优化代码】${fileInfo}\n` : `【优化代码】\n`
      return `${prompt}${codeBlock}`
    } else {
      // 只有文件路径
      return `【优化代码】文件: ${fileName || 'unknown'}`
    }
  } else if (type === 'explain_code' || type === 'explain') {
    // 解释代码：添加【解释代码】标注
    const hasCode = content !== fileName
    if (hasCode) {
      const language = fileName?.split('.').pop() || ''
      const codeBlock = `\`\`\`${language}\n${content}\n\`\`\``
      const fileInfo = fileName ? `文件: ${fileName}` + (lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : '') : ''
      const prompt = fileInfo ? `【解释代码】${fileInfo}\n` : `【解释代码】\n`
      return `${prompt}${codeBlock}`
    } else {
      // 只有文件路径
      return `【解释代码】文件: ${fileName || 'unknown'}`
    }
  } else if (type === 'generate_test' || type === 'test') {
    // 生成单元测试：添加【单元测试】标注
    const hasCode = content !== fileName
    if (hasCode) {
      const language = fileName?.split('.').pop() || ''
      const codeBlock = `\`\`\`${language}\n${content}\n\`\`\``
      const fileInfo = fileName ? `文件: ${fileName}` + (lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : '') : ''
      const prompt = fileInfo ? `【单元测试】${fileInfo}\n` : `【单元测试】\n`
      return `${prompt}${codeBlock}`
    } else {
      // 只有文件路径
      return `【单元测试】文件: ${fileName || 'unknown'}`
    }
  } else if (type === 'fix') {
    // 修复代码
    const hasCode = content !== fileName
    if (hasCode) {
      const language = fileName?.split('.').pop() || ''
      const codeBlock = `\`\`\`${language}\n${content}\n\`\`\``
      const fileInfo = fileName ? `文件: ${fileName}` + (lineRange ? ` (${lineRange.start}-${lineRange.end}行)` : '') : ''
      const prompt = fileInfo ? `【修复代码】${fileInfo}\n` : `【修复代码】\n`
      return `${prompt}${codeBlock}`
    } else {
      // 只有文件路径
      return `【修复代码】文件: ${fileName || 'unknown'}`
    }
  } else {
    // 文本内容直接返回
    return content
  }
}

export function useSSEHandler(props: UseSSEHandlerProps) {
  const propsRef = useRef<UseSSEHandlerProps>(props)
  // 每次渲染更新ref，确保事件处理器能访问最新的props
  useEffect(() => {
    propsRef.current = props
  })
  
  // 解构props以便在effect依赖中使用
  const {
    currentSessionId,
    serverStatus,
    sseReconnectKey,
    setMessages,
    setPermissionRequests,
    setQuestionRequests,
    setCurrentPermission,
    setCurrentQuestion,
    setCurrentQuestionIndex,
    setSelectedAnswers,
    setCustomAnswers,
    setPermissionMessage: _setPermissionMessage,
    loadProviders,
    setAttachments,
    setInputValue,
    setProcessedMessageIds,
    setTodos,
    generateTodoId,
    setSessionStatuses,
    autoConfirm: _autoConfirm,
    setRightClickFileInfo,
  } = props
  
  const sseRef = useRef<{
    abortController?: AbortController
    reader?: ReadableStreamDefaultReader
  }>({})
  const isConnectingRef = useRef(false)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // SSE事件处理器
  const handleSSEEvent = (eventType: string, properties: any, _event?: string, _data?: any) => {


    if (eventType === 'chat_message') {
       // 右键菜单消息
       console.log('🟢 CHAT_MESSAGE HANDLER TRIGGERED:', properties)
       const chatMsg: ChatMessage = properties
       console.log('🟢 Right-click message details:', {
         id: chatMsg.id,
         type: chatMsg.type,
         fileName: chatMsg.fileName,
         lineRange: chatMsg.lineRange,
         content: chatMsg.content?.substring(0, 100) + '...'
       })
        if (!propsRef.current.processedMessageIds.has(String(chatMsg.id))) {
        // 设置右键文件信息（显示在标签区域）
        if (setRightClickFileInfo) {
          setRightClickFileInfo({
            fileName: chatMsg.fileName || 'unknown',
            lineRange: chatMsg.lineRange,
            type: chatMsg.type
          })
        }
        
        if (chatMsg.type === 'file') {
          // 文件引用作为附件添加
          const newAttachment = {
            uid: `file-${chatMsg.id}-${Date.now()}`,
            name: chatMsg.fileName || 'unknown',
            status: 'done',
            url: '',
            size: 0,
            type: 'file',
            lineRange: chatMsg.lineRange,
          }
          setAttachments(prev => [...prev, newAttachment])
        } else {
          // 代码/解释等消息格式化并插入输入框
          const formatted = formatRightClickMessage(chatMsg)
          setInputValue(prev => prev ? `${prev}\n${formatted}` : formatted)
        }
        // 标记为已处理
        setProcessedMessageIds(prev => new Set([...prev, String(chatMsg.id)]))
      }
    } else if (eventType === 'todo.updated') {
      // 待办事项更新
      const { sessionID, todos: updatedTodos } = properties
      if (sessionID === currentSessionId && Array.isArray(updatedTodos)) {
        const convertedTodos = updatedTodos.map((item: any, index: number) => ({
          id: item.id || generateTodoId(item.content) || `todo-${index}`,
          title: item.content || item.title || '',
          description: `优先级: ${item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}`,
          status: item.status || 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          session_id: currentSessionId || ''
        }))
        setTodos(convertedTodos)
      }
     } else if (eventType === 'message.part.updated') {
      // 消息部分内容更新（流式）
      const { part, delta } = properties
      if (part && part.sessionID === currentSessionId) {
        const messageId = part.messageID
        if (part.type === 'text') {
          // 更新文本内容
          setMessages(prev => {
            const existingIndex = prev.findIndex(m => m.id === messageId)
            if (existingIndex >= 0) {
              const updated = [...prev]
              const existing = updated[existingIndex]
              const existingParts = existing.parts || []
              
              // 检查是否已存在相同ID的text part
              const partIndex = existingParts.findIndex(p => p.id === part.id)
              let newParts: MessagePart[]
              let finalContent = ''
              
              if (partIndex >= 0) {
                // 更新现有part - 如果有time.end，使用完整的text；否则累加delta
                newParts = [...existingParts]
                if (part.time?.end && part.text) {
                  // 最终内容，使用完整的text
                  finalContent = part.text
                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    type: 'text',
                    content: part.text,
                    time: part.time
                  }
                } else {
                  // 流式内容，累加delta
                  finalContent = delta ? existing.content + delta : (part.text || '')
                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    type: 'text',
                    content: delta ? (newParts[partIndex].content || '') + delta : part.text,
                    time: part.time
                  }
                }
              } else {
                // 添加新part
                finalContent = part.text || delta || ''
                newParts = [...existingParts, {
                  id: part.id,
                  type: 'text',
                  content: finalContent,
                  time: part.time
                }]
              }
              
                 // 判断消息是否完成：有时间结束标记，或者有完整文本但没有delta和时间（用户消息）
                 // 如果是用户消息，直接设为成功状态
                 const isUserMessage = existing.role === 'user' || part.role === 'user'
                 const isComplete = part.time?.end || (part.text && !delta && !part.time) || isUserMessage
                 // 检查消息是否有step-start part，如果有则不允许出现loading状态
                 const hasStepStart = existing.parts?.some(p => p.type === 'step-start') || false
                 
                    // 更新消息内容
                    updated[existingIndex] = {
                      ...existing,
                      content: finalContent || existing.content,
                      // 用户消息总是成功状态，助手消息有text内容时去除loading状态
                      // 如果有step-start，强制保持success状态
                      // 如果消息有错误信息，保持错误状态
                      status: existing.errorInfo || existing.status === 'error' ? 'error' : (hasStepStart ? 'success' : (isUserMessage ? 'success' : 'success')),
                      parts: newParts
                    }
              console.log(`Updated message ${messageId} with text part ${part.id}, content: "${finalContent}", status: ${isComplete ? 'success' : 'loading'}`)
              return updated
              } else {
                 // 创建新消息（可能还没有收到message.updated事件）
                   // 检测用户消息：只有part.role明确为'user'才认为是用户消息
                    let detectedRole = part.role
                    // 不再根据text和delta自动检测，避免错误识别助手消息
                    // if (!detectedRole && part.type === 'text' && part.text && !delta) {
                    //   console.log(`Detected possible user message: text exists, no delta, messageId=${messageId}, time=${JSON.stringify(part.time)}`)
                    //   detectedRole = 'user'
                    // }
                  const isUserMessage = detectedRole === 'user'
                  
                   // 如果是用户消息，检查是否存在临时用户消息（ID以'temp-user-'开头且内容匹配）
                   if (isUserMessage) {
                     const tempUserMessageIndex = prev.findIndex(m => 
                       m.id.startsWith('temp-user-') && 
                       m.content === (part.text || delta || '')
                     )
                     
                      if (tempUserMessageIndex >= 0) {
                        // 替换临时用户消息的ID为真实ID，并更新其他字段
                        // 保留原有content（包含[FILE:][IMAGE:]等标签），因为SSE返回的user text部分不含文件标签
                        const updated = [...prev]
                        const tempMsg = updated[tempUserMessageIndex]
                        const oldTempUserId = tempMsg.id
                        updated[tempUserMessageIndex] = {
                          ...tempMsg,
                          id: messageId,
                          timestamp: part.time?.start || Date.now(),
                          status: 'success',
                          content: tempMsg.content || part.text || delta || '',
                          parts: [{
                            id: part.id,
                            type: 'text',
                            content: part.text || delta || '',
                            time: part.time
                          }]
                        }
                       
                       // 更新所有parentID为旧临时用户ID的助手消息，将parentID更新为真实用户ID
                       updated.forEach((msg, idx) => {
                         if (msg.role === 'assistant' && msg.parentID === oldTempUserId) {
                           updated[idx] = {
                             ...msg,
                             parentID: messageId
                           }
                         }
                       })
                       
                       console.log(`Replaced temp user message ${oldTempUserId} with real message ${messageId}`)
                       return updated
                     }
                    } else {
                      // 助手消息，检查是否存在临时助手消息（ID以'temp-assistant-'开头且status为loading）
                      // 首先查找临时助手消息，然后查找任何status为loading的助手消息
                      let tempAssistantMessageIndex = prev.findIndex(m => 
                        m.id.startsWith('temp-assistant-') && 
                        m.status === 'loading'
                      )
                      
                      // 如果没有找到临时助手消息，查找任何status为loading的助手消息
                      if (tempAssistantMessageIndex < 0) {
                        tempAssistantMessageIndex = prev.findIndex(m => 
                          m.role === 'assistant' && 
                          m.status === 'loading'
                        )
                      }
                     
                     if (tempAssistantMessageIndex >= 0) {
                       // 替换临时助手消息的ID为真实ID，并更新其他字段
                       const updated = [...prev]
                       const existingMsg = updated[tempAssistantMessageIndex]
                       const existingParts = existingMsg.parts || []
                       
                       // 检查是否已存在相同ID的text part
                       const partIndex = existingParts.findIndex(p => p.id === part.id)
                       let newParts: MessagePart[]
                       
                       if (partIndex >= 0) {
                         // 更新现有part
                         newParts = [...existingParts]
                         if (part.time?.end && part.text) {
                           newParts[partIndex] = {
                             ...newParts[partIndex],
                             type: 'text',
                             content: part.text,
                             time: part.time
                           }
                         } else {
                           newParts[partIndex] = {
                             ...newParts[partIndex],
                             type: 'text',
                             content: delta ? (newParts[partIndex].content || '') + delta : part.text,
                             time: part.time
                           }
                         }
                       } else {
                         // 添加新part
                         newParts = [...existingParts, {
                           id: part.id,
                           type: 'text',
                           content: part.text || delta || '',
                           time: part.time
                         }]
                       }
                       
                         updated[tempAssistantMessageIndex] = {
                           ...existingMsg,
                           id: messageId,
                           content: part.text || delta || existingMsg.content,
                           // 如果消息有错误信息，保持错误状态；否则为success
                           status: existingMsg.errorInfo || existingMsg.status === 'error' ? 'error' : 'success',
                           parts: newParts
                         }
                       
                       console.log(`Replaced temp assistant message with real message ${messageId} for text part`)
                       return updated
                     }
                   }
                   
                      // 否则创建新消息
                       const newMessage: Message = {
                         id: messageId,
                         content: part.text || delta || '',
                         role: detectedRole || 'assistant',
                         timestamp: part.time?.start || Date.now(),
                         // 用户消息总是成功状态，助手消息有text内容时为success
                         status: isUserMessage ? 'success' : 'success',  // 有text内容，去除loading状态
                       parts: [{
                         id: part.id,
                         type: 'text',
                         content: part.text || delta || '',
                         time: part.time
                       }]
                     }
                  console.log(`Created new message ${messageId} with text part ${part.id}, content: "${part.text || delta || ''}", role: ${newMessage.role}`)
                  return [...prev, newMessage]
              }
          })
        } else if (part.type === 'reasoning') {
          console.log(`Received reasoning event for message ${messageId}, part ${part.id}, text: "${part.text}", delta: "${delta}", time.end: ${part.time?.end}`)
          // 更新思考链内容
          setMessages(prev => {
            const existingIndex = prev.findIndex(m => m.id === messageId)
            if (existingIndex >= 0) {
              const updated = [...prev]
              const existing = updated[existingIndex]
              const existingSteps = existing.thoughtChain?.steps || []
              const existingParts = existing.parts || []
              
              // 检查是否已存在相同ID的reasoning part
              const partIndex = existingParts.findIndex(p => p.id === part.id)
              let newParts: MessagePart[]
              let newSteps: ThoughtStep[]
              
              if (partIndex >= 0) {
                // 更新现有part
                newParts = [...existingParts]
                const isCompleted = !!part.time?.end
                if (isCompleted && part.text) {
                  // 最终内容，使用完整的text
                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    type: 'reasoning',
                    content: part.text,
                    time: part.time
                  }
                } else {
                  // 流式内容，累加delta
                  newParts[partIndex] = {
                    ...newParts[partIndex],
                    type: 'reasoning',
                    content: delta ? (newParts[partIndex].content || '') + delta : part.text,
                    time: part.time
                  }
                }
                
                // 更新对应的thoughtChain step
                const stepIndex = existingSteps.findIndex(step => step.id === part.id)
                newSteps = [...existingSteps]
                 if (stepIndex >= 0) {
                   newSteps[stepIndex] = {
                     ...newSteps[stepIndex],
                     description: delta ? (newSteps[stepIndex].description || '') + delta : part.text,
                     status: isCompleted ? 'completed' : 'running'
                   }
                 } else {
                   // 添加新的step
                   newSteps.push({
                     id: part.id || `reason-${existingSteps.length}`,
                     description: delta || part.text,
                     status: isCompleted ? 'completed' : 'running',
                     messageId: messageId
                   })
                }
              } else {
                // 添加新part
                const isCompleted = !!part.time?.end
                newParts = [...existingParts, {
                  id: part.id,
                  type: 'reasoning',
                  content: part.text || delta || '',
                  time: part.time
                }]
                
                 // 添加新的step
                 newSteps = [...existingSteps, {
                   id: part.id || `reason-${existingSteps.length}`,
                   description: delta || part.text,
                   status: isCompleted ? 'completed' : 'running',
                   messageId: messageId
                 }]
              }
               
                   // 检查消息是否有step-start part，如果有则不允许出现loading状态
                   // const hasStepStart = existing.parts?.some(p => p.type === 'step-start') || false
                  // 检查消息是否已经有完成的text部分或内容
                  const hasCompletedTextPart = existing.parts?.some(p => p.type === 'text' && p.time?.end) || false
                  const hasContent = existing.content && existing.content.trim().length > 0
                  const shouldStaySuccess = hasCompletedTextPart || hasContent || existing.status === 'success'
                  updated[existingIndex] = {
                    ...existing,
                      thoughtChain: {
                        steps: newSteps,
                        expanded: !part.time?.end  // 未完成时展开，完成时折叠
                      },
                     parts: newParts,
                      // 如果reasoning部分完成（有时间结束标记）或者消息已经有内容/已完成text部分则设置为success，如果有错误则设置为error，否则为loading
                      status: existing.errorInfo || existing.status === 'error' ? 'error' : (part.time?.end || shouldStaySuccess ? 'success' : 'loading')
                  }
              console.log(`Updated message ${messageId} with reasoning part ${part.id}, content: "${part.text || delta || ''}", time.end: ${part.time?.end}`)
              return updated
             } else {
                // 创建新消息并添加reasoning
                 // reasoning 部分通常是助手消息，但检查role字段
                  let detectedRole = part.role
                  const isUserMessage = detectedRole === 'user'
                  
                   // 如果是助手消息，检查是否存在临时助手消息（ID以'temp-assistant-'开头）
                   if (!isUserMessage) {
                     let tempAssistantMessageIndex = prev.findIndex(m => 
                       m.id.startsWith('temp-assistant-') && 
                       m.status === 'loading'
                     )
                     
                     // 如果没有找到临时助手消息，查找任何status为loading的助手消息
                     if (tempAssistantMessageIndex < 0) {
                       tempAssistantMessageIndex = prev.findIndex(m => 
                         m.role === 'assistant' && 
                         m.status === 'loading'
                       )
                     }
                    
                    if (tempAssistantMessageIndex >= 0) {
                      // 替换临时助手消息的ID为真实ID，并更新其他字段
                      const updated = [...prev]
                      const existingMsg = updated[tempAssistantMessageIndex]
                      const existingParts = existingMsg.parts || []
                      
                      // 检查是否已存在相同ID的reasoning part
                      const partIndex = existingParts.findIndex(p => p.id === part.id)
                      let newParts: MessagePart[]
                      
                      if (partIndex >= 0) {
                        // 更新现有part
                        newParts = [...existingParts]
                        if (part.time?.end && part.text) {
                          newParts[partIndex] = {
                            ...newParts[partIndex],
                            type: 'reasoning',
                            content: part.text,
                            time: part.time
                          }
                        } else {
                          newParts[partIndex] = {
                            ...newParts[partIndex],
                            type: 'reasoning',
                            content: delta ? (newParts[partIndex].content || '') + delta : part.text,
                            time: part.time
                          }
                        }
                      } else {
                        // 添加新part
                        newParts = [...existingParts, {
                          id: part.id,
                          type: 'reasoning',
                          content: part.text || delta || '',
                          time: part.time
                        }]
                      }
                      
                       // 更新thoughtChain
                       const existingSteps = existingMsg.thoughtChain?.steps || []
                       const stepIndex = existingSteps.findIndex(step => step.id === part.id)
                       let newSteps: ThoughtStep[]
                       const isCompleted = !!part.time?.end
                       
                       if (stepIndex >= 0) {
                         newSteps = [...existingSteps]
                          newSteps[stepIndex] = {
                            ...newSteps[stepIndex],
                            description: delta ? (newSteps[stepIndex].description || '') + delta : part.text,
                            status: isCompleted ? 'completed' : 'running'
                          }
                       } else {
                          newSteps = [...existingSteps, {
                            id: part.id || `reason-${existingSteps.length}`,
                            description: delta || part.text,
                            status: isCompleted ? 'completed' : 'running',
                            messageId: messageId
                          }]
                       }
                       
                       updated[tempAssistantMessageIndex] = {
                          ...existingMsg,
                          id: messageId,
                            thoughtChain: {
                              steps: newSteps,
                              expanded: !part.time?.end
                            },
                          parts: newParts,
                           status: (part.time?.end || existingMsg.errorInfo) ? 'success' : 'loading'
                       }
                      
                      console.log(`Replaced temp assistant message with real message ${messageId}`)
                      return updated
                    }
                  }
                  
                    // 否则创建新消息
                     const newMessage: Message = {
                       id: messageId,
                       content: '',
                       role: detectedRole || 'assistant',
                       timestamp: part.time?.start || Date.now(),
                        status: isUserMessage ? 'success' : (part.time?.end ? 'success' : 'loading'),
                      thoughtChain: {
                       steps: [{
                         id: part.id || `reason-0`,
                         description: delta || part.text,
                         status: 'completed',
                         messageId: messageId
                       }],
                        expanded: false
                     },
                     parts: [{
                       id: part.id,
                       type: 'reasoning',
                       content: part.text || delta || '',
                       time: part.time
                     }]
                   }
                 return [...prev, newMessage]
             }
          })
          } else if (part.type === 'step-start') {
           console.log(`Received step-start event for message ${messageId}, snapshot: ${part.snapshot}`)
           // 步骤开始，添加step-start part
           setMessages(prev => {
             const existingIndex = prev.findIndex(m => m.id === messageId)
             if (existingIndex >= 0) {
               const updated = [...prev]
               const existing = updated[existingIndex]
               const existingParts = existing.parts || []
                const newPart: MessagePart = {
                  id: part.id,
                  type: 'step-start',
                  content: '',
                  time: part.time,
                  snapshot: part.snapshot
                }
                
                  // 检查消息是否已经有step-start部分
                 const hasExistingStepStart = existingParts.some(p => p.type === 'step-start')
                 // 决定状态：如果已经有step-start，保持原状态；如果没有，设置为loading
                 // 但根据用户需求：只要出现了一次step-start，气泡就不能再显示加载中
                 // 所以如果已经有step-start，不应该设置为loading
                 // 同时，如果消息已经有内容或已经是成功状态，保持成功状态，不显示加载中
                 // 如果消息有错误信息，保持错误状态
                 const hasError = existing.errorInfo || existing.status === 'error'
                 const hasContent = existing.content && existing.content.trim().length > 0
                 const shouldStaySuccess = existing.status === 'success' || hasContent
                 const newStatus = hasError ? 'error' : (shouldStaySuccess ? 'success' : (hasExistingStepStart ? existing.status : 'loading'))
                
                updated[existingIndex] = {
                  ...existing,
                  parts: [...existingParts, newPart],
                  status: newStatus
                }
               return updated
              } else {
                // 检查是否存在临时助手消息（ID以'temp-assistant-'开头且status为loading）
                let tempAssistantMessageIndex = prev.findIndex(m => 
                  m.id.startsWith('temp-assistant-') && 
                  m.status === 'loading'
                )
                
                // 如果没有找到临时助手消息，查找任何status为loading的助手消息
                if (tempAssistantMessageIndex < 0) {
                  tempAssistantMessageIndex = prev.findIndex(m => 
                    m.role === 'assistant' && 
                    m.status === 'loading'
                  )
                }
                
                if (tempAssistantMessageIndex >= 0) {
                 // 替换临时助手消息的ID为真实ID，并更新其他字段
                 const updated = [...prev]
                 const existingMsg = updated[tempAssistantMessageIndex]
                 const existingParts = existingMsg.parts || []
                  const newPart: MessagePart = {
                    id: part.id,
                    type: 'step-start',
                    content: '',
                    time: part.time,
                    snapshot: part.snapshot
                  }
                  
                   // 检查消息是否已经有step-start部分
                   const hasExistingStepStart = existingParts.some(p => p.type === 'step-start')
                   // 决定状态：如果已经有step-start，保持原状态；如果没有，设置为loading
                   // 同时，如果消息已经有内容或已经是成功状态，保持成功状态，不显示加载中
                   // 如果消息有错误信息，保持错误状态
                   const hasError = existingMsg.errorInfo || existingMsg.status === 'error'
                   const hasContent = existingMsg.content && existingMsg.content.trim().length > 0
                   const shouldStaySuccess = existingMsg.status === 'success' || hasContent
                   const newStatus = hasError ? 'error' : (shouldStaySuccess ? 'success' : (hasExistingStepStart ? existingMsg.status : 'loading'))
                  
                  updated[tempAssistantMessageIndex] = {
                    ...existingMsg,
                    id: messageId,
                    content: '思考中...',
                    status: newStatus,
                    parts: [...existingParts, newPart]
                  }
                 
                 console.log(`Replaced temp assistant message with real message ${messageId} for step-start`)
                 return updated
               }
               
               // 否则创建新消息
                 const newMessage: Message = {
                   id: messageId,
                   content: '思考中...',
                   role: part.role || 'assistant',
                   timestamp: part.time?.start || Date.now(),
                    status: 'loading',  // step-start表示思考开始，设置为loading状态
                  parts: [{
                    id: part.id,
                    type: 'step-start',
                    content: '',
                    time: part.time,
                    snapshot: part.snapshot
                  }]
                }
               return [...prev, newMessage]
             }
          })
         } else if (part.type === 'step-finish') {
           // 步骤完成，更新消息状态并添加step-finish part
           setMessages(prev => {
             const existingIndex = prev.findIndex(m => m.id === messageId)
             if (existingIndex >= 0) {
               const updated = [...prev]
               const existing = updated[existingIndex]
               const existingParts = existing.parts || []
               const newPart: MessagePart = {
                 id: part.id,
                 type: 'step-finish',
                 content: '',
                 time: part.time,
                 reason: part.reason,
                 cost: part.cost,
                 tokens: part.tokens
               }
                 updated[existingIndex] = {
                   ...existing,
                   parts: [...existingParts, newPart],
                   status: 'success',  // 步骤完成，去除loading状态
                   // 确保思考链折叠
                   thoughtChain: existing.thoughtChain ? {
                     ...existing.thoughtChain,
                     expanded: false
                   } : undefined
                }
               return updated
              } else {
                // 检查是否存在临时助手消息（ID以'temp-assistant-'开头且status为loading）
                let tempAssistantMessageIndex = prev.findIndex(m => 
                  m.id.startsWith('temp-assistant-') && 
                  m.status === 'loading'
                )
                
                // 如果没有找到临时助手消息，查找任何status为loading的助手消息
                if (tempAssistantMessageIndex < 0) {
                  tempAssistantMessageIndex = prev.findIndex(m => 
                    m.role === 'assistant' && 
                    m.status === 'loading'
                  )
                }
                
                if (tempAssistantMessageIndex >= 0) {
                 // 替换临时助手消息的ID为真实ID，并更新其他字段
                 const updated = [...prev]
                 const existingMsg = updated[tempAssistantMessageIndex]
                 const existingParts = existingMsg.parts || []
                 const newPart: MessagePart = {
                   id: part.id,
                   type: 'step-finish',
                   content: '',
                   time: part.time,
                   reason: part.reason,
                   cost: part.cost,
                   tokens: part.tokens
                 }
                 
                  updated[tempAssistantMessageIndex] = {
                    ...existingMsg,
                    id: messageId,
                    status: 'success',  // 步骤完成，去除loading状态
                    parts: [...existingParts, newPart],
                     // 确保思考链折叠
                     thoughtChain: existingMsg.thoughtChain ? {
                       ...existingMsg.thoughtChain,
                       expanded: false
                     } : undefined
                  }
                 
                 console.log(`Replaced temp assistant message with real message ${messageId} for step-finish`)
                 return updated
               }
               
               // 否则创建新消息
                const newMessage: Message = {
                  id: messageId,
                  content: '',
                  role: part.role || 'assistant',
                  timestamp: part.time?.start || Date.now(),
                  status: 'success',
                  parts: [{
                    id: part.id,
                    type: 'step-finish',
                    content: '',
                    time: part.time,
                    reason: part.reason,
                    cost: part.cost,
                    tokens: part.tokens
                  }],
                  // 思考链默认折叠
                  thoughtChain: undefined
                }
               return [...prev, newMessage]
             }
          })
         } else if (part.type === 'tool') {
           // 工具执行结果更新
           console.log(`Tool part updated: id=${part.id}, tool=${part.tool}, state=${JSON.stringify(part.state)}, time.end=${part.time?.end}`)
           setMessages(prev => {
             const existingIndex = prev.findIndex(m => m.id === messageId)
             if (existingIndex >= 0) {
               // 更新现有消息的tool部分
               const updated = [...prev]
               const existing = updated[existingIndex]
               const existingParts = existing.parts || []
               
               // 检查是否已存在相同ID的tool part
               const partIndex = existingParts.findIndex(p => p.id === part.id)
               
               // 构建新的tool part，合并state（如果已存在）
               let newState = part.state || {}
               if (partIndex >= 0) {
                 const existingPart = existingParts[partIndex]
                 console.log(`Existing tool part found: status=${existingPart.state?.status}`)
                 // 合并state：新state覆盖旧state，但保留新state中没有的字段
                 newState = {
                   status: part.state?.status || existingPart.state?.status || 'pending',
                  ...existingPart.state,
                  ...part.state,
                  // 深度合并input和metadata
                  input: part.state?.input ? {
                    ...existingPart.state?.input,
                    ...part.state.input
                  } : existingPart.state?.input,
                  metadata: part.state?.metadata ? {
                    ...existingPart.state?.metadata,
                    ...part.state.metadata
                  } : existingPart.state?.metadata
                 }
                 
                 // 如果工具执行完成（有时间结束标记），设置状态为completed
                 if (part.time?.end && newState.status !== 'completed') {
                   console.log(`Tool part completed (time.end exists), setting status to completed`)
                   newState.status = 'completed'
                 }
               } else {
                 // 确保新state有status字段
                 if (!newState.status) {
                   newState.status = 'pending'
                 }
                 
                 // 如果工具执行完成（有时间结束标记），设置状态为completed
                 if (part.time?.end && newState.status !== 'completed') {
                   console.log(`Tool part completed (time.end exists), setting status to completed`)
                   newState.status = 'completed'
                 }
               }
              
              const newPart: MessagePart = {
                id: part.id,
                type: 'tool',
                content: part.text || delta || '',
                time: part.time,
                tool: part.tool,
                state: newState
              }
              
              let updatedParts
              if (partIndex >= 0) {
                // 更新现有part
                updatedParts = [...existingParts]
                updatedParts[partIndex] = newPart
              } else {
                // 添加新part
                updatedParts = [...existingParts, newPart]
              }
              
                     const isUserMessage = existing.role === 'user' || part.role === 'user'
                   // 检查消息是否有step-start part，如果有则不允许出现loading状态
                   const hasStepStart = existing.parts?.some(p => p.type === 'step-start') || false
                     if (hasStepStart) console.log(`Message ${messageId} has step-start, forcing success status for tool part`)
                     updated[existingIndex] = {
                       ...existing,
                       parts: updatedParts,
                       // 如果有step-start，强制保持success状态
                       // 如果消息有错误信息，保持错误状态
                       status: existing.errorInfo || existing.status === 'error' ? 'error' : (hasStepStart ? 'success' : (isUserMessage ? 'success' : 'success'))  // 有tool内容，去除loading状态
                     }
               return updated
              } else {
                // 检查是否存在临时助手消息（ID以'temp-assistant-'开头且status为loading）
                let tempAssistantMessageIndex = prev.findIndex(m => 
                  m.id.startsWith('temp-assistant-') && 
                  m.status === 'loading'
                )
                
                // 如果没有找到临时助手消息，查找任何status为loading的助手消息
                if (tempAssistantMessageIndex < 0) {
                  tempAssistantMessageIndex = prev.findIndex(m => 
                    m.role === 'assistant' && 
                    m.status === 'loading'
                  )
                }
                
                if (tempAssistantMessageIndex >= 0) {
                 // 替换临时助手消息的ID为真实ID，并更新其他字段
                 const updated = [...prev]
                 const existingMsg = updated[tempAssistantMessageIndex]
                 const existingParts = existingMsg.parts || []
                 
                 // 检查是否已存在相同ID的tool part
                 const partIndex = existingParts.findIndex(p => p.id === part.id)
                 
                 // 构建新的tool part，合并state（如果已存在）
                 let newState = part.state || {}
                 if (partIndex >= 0) {
                   const existingPart = existingParts[partIndex]
                   // 合并state：新state覆盖旧state，但保留新state中没有的字段
                   newState = {
                     status: part.state?.status || existingPart.state?.status || 'pending',
                     ...existingPart.state,
                     ...part.state,
                     // 深度合并input和metadata
                     input: part.state?.input ? {
                       ...existingPart.state?.input,
                       ...part.state.input
                     } : existingPart.state?.input,
                     metadata: part.state?.metadata ? {
                       ...existingPart.state?.metadata,
                       ...part.state.metadata
                     } : existingPart.state?.metadata
                   }
                 } else {
                   // 确保新state有status字段
                   if (!newState.status) {
                     newState.status = 'pending'
                   }
                 }
                 
                 const newPart: MessagePart = {
                   id: part.id,
                   type: 'tool',
                   content: part.text || delta || '',
                   time: part.time,
                   tool: part.tool,
                   state: newState
                 }
                 
                 let updatedParts
                 if (partIndex >= 0) {
                   // 更新现有part
                   updatedParts = [...existingParts]
                   updatedParts[partIndex] = newPart
                 } else {
                   // 添加新part
                   updatedParts = [...existingParts, newPart]
                 }
                 
                    const isUserMessage = part.role === 'user'
                     updated[tempAssistantMessageIndex] = {
                       ...existingMsg,
                       id: messageId,
                       // 如果消息有错误信息，保持错误状态；否则为success
                       status: existingMsg.errorInfo || existingMsg.status === 'error' ? 'error' : (isUserMessage ? 'success' : 'success'),
                       parts: updatedParts
                     }
                 
                 console.log(`Replaced temp assistant message with real message ${messageId} for tool part`)
                 return updated
               }
               
                 // 否则创建新消息
                   const isUserMessage = part.role === 'user'
                   const newMessage: Message = {
                     id: messageId,
                     content: '',
                     role: part.role || 'assistant',
                     timestamp: part.time?.start || Date.now(),
                     status: isUserMessage ? 'success' : 'success',  // 有tool内容，去除loading状态
                   parts: [{
                     id: part.id,
                     type: 'tool',
                     content: part.text || delta || '',
                     time: part.time,
                     tool: part.tool,
                     state: part.state
                    }]
                  }
                 return [...prev, newMessage]
              }
           })
         } else if (part.type === 'compaction') {
           // 会话压缩标记
           console.log(`Compaction part updated: id=${part.id}, messageID=${part.messageID}, auto=${part.auto}, overflow=${part.overflow}`)
           setMessages(prev => {
             const existingIndex = prev.findIndex(m => m.id === messageId)
             if (existingIndex >= 0) {
               // 更新现有消息，添加compaction part
               const updated = [...prev]
               const existing = updated[existingIndex]
               const existingParts = existing.parts || []
               const newPart: MessagePart = {
                 id: part.id,
                 type: 'compaction',
                 content: '',
                 time: part.time,
                 auto: part.auto,
                 overflow: part.overflow
               }
               // 检查是否已存在相同ID的compaction part
               const partIndex = existingParts.findIndex(p => p.id === part.id)
               let updatedParts
               if (partIndex >= 0) {
                 // 更新现有part
                 updatedParts = [...existingParts]
                 updatedParts[partIndex] = newPart
               } else {
                 // 添加新part
                 updatedParts = [...existingParts, newPart]
               }
               updated[existingIndex] = {
                 ...existing,
                 parts: updatedParts,
                 // 压缩消息保持原状态（通常是success）
                 status: existing.status
               }
               console.log(`Updated message ${messageId} with compaction part ${part.id}`)
               return updated
             } else {
               // 消息不存在，创建新消息（应该是用户消息）
               const newMessage: Message = {
                 id: messageId,
                 content: '',
                 role: 'user', // 压缩消息通常是用户角色
                 timestamp: part.time?.start || Date.now(),
                 status: 'success',
                 parts: [{
                   id: part.id,
                   type: 'compaction',
                   content: '',
                   time: part.time,
                   auto: part.auto,
                   overflow: part.overflow
                 }]
               }
               console.log(`Created new message ${messageId} with compaction part ${part.id}`)
               return [...prev, newMessage]
             }
           })
         } else if (part.type === 'file') {
           // 文件类型part - 添加到消息的parts中
           setMessages(prev => {
             const existingIndex = prev.findIndex(m => m.id === messageId)
             if (existingIndex >= 0) {
               const updated = [...prev]
               const existing = updated[existingIndex]
               const existingParts = existing.parts || []
               // 检查是否已存在相同ID的file part
               const partIndex = existingParts.findIndex(p => p.id === part.id)
               let newParts: MessagePart[]
               if (partIndex >= 0) {
                 // 更新现有part
                 newParts = [...existingParts]
                 newParts[partIndex] = {
                   ...newParts[partIndex],
                   type: 'file',
                   content: '',
                   time: part.time
                 }
               } else {
                 // 添加新part
                 newParts = [...existingParts, {
                   id: part.id,
                   type: 'file',
                   content: '',
                   time: part.time
                 }]
               }
               updated[existingIndex] = {
                 ...existing,
                 parts: newParts
               }
               console.log(`Added file part ${part.id} to message ${messageId}, filename: ${(part as any).filename}`)
               return updated
             } else {
               // 创建新消息
               const newMessage: Message = {
                 id: messageId,
                 content: '',
                 role: 'user',
                 timestamp: part.time?.start || Date.now(),
                 status: 'success',
                 parts: [{
                   id: part.id,
                   type: 'file',
                   content: '',
                   time: part.time
                 }]
               }
               console.log(`Created new message ${messageId} with file part ${part.id}`)
               return [...prev, newMessage]
             }
           })
       }
       }
      } else if (eventType === 'message.updated') {
       // 消息更新（包含完整信息，如summary.diffs等）
       const { sessionID, info } = properties
       if (sessionID === currentSessionId) {
         console.log(`message.updated: role=${info.role}, id=${info.id}, sessionID=${sessionID}, parentID=${info.parentID}, has parentID=${!!info.parentID}`)
        // 更新智能体和模型设置（仅助手消息）
        if (info.role === 'assistant') {
          // 设置智能体模式
          if (info.agent === 'plan' || info.agent === 'build') {
            // 注意：这里需要从props中获取setChatMode，但当前hook没有这个函数
            // 可以在需要时通过props传递，暂时注释掉
            // setChatMode(info.agent)
          }
          
          // 设置模型和提供商
          if (info.providerID && info.modelID) {
            // 同样，需要从props获取setSelectedProvider和setSelectedModel
            // setSelectedProvider(info.providerID)
            // setSelectedModel(info.modelID)
          }
        }
        
         console.log('message.updated:', info, 'parentID:', info.parentID)
        setMessages(prev => {
          const existingIndex = prev.findIndex(m => m.id === info.id)

          if (info.role === 'user') {
            // 用户消息，添加或更新
            if (existingIndex >= 0) {
              const updated = [...prev]
              updated[existingIndex] = {
                ...updated[existingIndex],
                role: 'user',
                status: 'success'
              }
              return updated
            }
              // 查找临时用户消息（ID以'temp-user-'开头）
              // 优先匹配内容相同的，如果没有内容则匹配最近的临时用户消息
              const tempUserMessages = prev
                .map((m, index) => ({ message: m, index }))
                .filter(item => item.message.id.startsWith('temp-user-'))
                .sort((a, b) => b.message.timestamp - a.message.timestamp) // 最近的在前
              
              let tempUserMessageIndex = -1
              if (tempUserMessages.length > 0) {
                if (info.text || info.content) {
                  // 尝试匹配内容相同的
                  const contentMatch = tempUserMessages.find(item => 
                    item.message.content === (info.text || info.content || '')
                  )
                  if (contentMatch) {
                    tempUserMessageIndex = contentMatch.index
                  } else {
                    // 内容不匹配，使用最近的临时消息
                    tempUserMessageIndex = tempUserMessages[0].index
                  }
                } else {
                  // 没有内容，使用最近的临时消息
                  tempUserMessageIndex = tempUserMessages[0].index
                }
              }
              
               if (tempUserMessageIndex >= 0) {
                  // 替换临时消息的ID为真实ID，并更新其他字段
                  // 保留原有content（包含[FILE:][IMAGE:]等标签），因为SSE返回的user text部分不含文件标签
                  const updated = [...prev]
                  const tempMsg = updated[tempUserMessageIndex]
                  const oldTempUserId = tempMsg.id
                  updated[tempUserMessageIndex] = {
                    ...tempMsg,
                    id: info.id,
                    timestamp: info.time?.created || Date.now(),
                    parentID: info.parentID,
                    status: 'success',
                    content: tempMsg.content || info.text || info.content || '',
                  }
                 
                 // 更新所有parentID为旧临时用户ID的助手消息，将parentID更新为真实用户ID
                 updated.forEach((msg, idx) => {
                   if (msg.role === 'assistant' && msg.parentID === oldTempUserId) {
                     updated[idx] = {
                       ...msg,
                       parentID: info.id
                     }
                   }
                 })
                 console.log(`Replaced temp user message ${oldTempUserId} with real message ${info.id}`)
                 return updated
              } else {
                // 创建新的用户消息 - 只有在有真实内容时才创建，避免空白气泡
                // SSE事件中用户消息没有text和content时跳过（常见于刷新后重放的sync事件）
                if (!info.text && !info.content) {
                  console.log('Skipping empty user message (no text/content)', info.id)
                  return prev
                }
                const newMessage: Message = {
                  id: info.id,
                  content: info.text || info.content || '',
                  role: 'user',
                  timestamp: info.time?.created || Date.now(),
                  status: 'success',
                  parentID: info.parentID
                }
                console.log(`Created new user message ${info.id} (no temp message found)`)
                return [...prev, newMessage]
              }
          } else if (info.role === 'assistant') {
            // AI助手消息
            if (existingIndex >= 0) {
              // 更新现有消息
              const updated = [...prev]
              const existingMsg = updated[existingIndex]
              const existingParts = existingMsg.parts || []
              let updatedParts = [...existingParts]
              
              // 检查是否有summary.diffs，如果有则创建或更新edit工具part
              if (info.summary?.diffs && Array.isArray(info.summary.diffs)) {
                console.log(`Updating message ${info.id} with ${info.summary.diffs.length} diffs`)
                
                info.summary.diffs.forEach((diff: any) => {
                  // 检查是否已存在对应文件的edit工具part
                  const existingEditIndex = existingParts.findIndex(
                    p => p.type === 'tool' && p.tool === 'edit' && p.state?.input?.filePath === diff.file
                  )
                  
                  if (existingEditIndex >= 0) {
                    // 更新现有edit part
                    updatedParts[existingEditIndex] = {
                      ...updatedParts[existingEditIndex],
                      state: {
                        ...updatedParts[existingEditIndex].state,
                        status: 'completed',
                        metadata: {
                          ...updatedParts[existingEditIndex].state?.metadata,
                          filediff: diff
                        }
                      }
                    }
                  } else {
                    // 创建新的edit工具part
                    const newEditPart: MessagePart = {
                      id: `edit-${Date.now()}`,
                      type: 'tool',
                      tool: 'edit',
                      content: '',
                      state: {
                        status: 'completed',
                        input: {
                          filePath: diff.file
                        },
                        metadata: {
                          filediff: diff
                        }
                      }
                    }
                    updatedParts.push(newEditPart)
                  }
                })
              }
              
                 // 确定消息状态：如果有错误（如被中断），则为error；如果已完成，则为success；否则保持原状态或loading
                 const hasError = info.error !== undefined // 只要存在error键就表示被中止
                 const isCompleted = info.time?.completed
                 const newStatus = hasError ? 'error' : (existingMsg.status === 'error' ? 'error' : (isCompleted ? 'success' : (existingMsg.status || 'loading')))
               
               updated[existingIndex] = {
                 ...existingMsg,
                 parentID: info.parentID,
                 status: newStatus,
                 errorInfo: hasError ? info.error : undefined,
                 parts: updatedParts
               }
              return updated
            } else {
                // 创建新的助手消息（不再合并到已有消息）
                let parts: MessagePart[] = []
                
                // 检查是否有summary.diffs，如果有则创建edit工具part
                if (info.summary?.diffs && Array.isArray(info.summary.diffs)) {
                  info.summary.diffs.forEach((diff: any) => {
                    const newEditPart: MessagePart = {
                      id: `edit-${Date.now()}-${diff.file}`,
                      type: 'tool',
                      tool: 'edit',
                      content: '',
                      state: {
                        status: 'completed',
                        input: { filePath: diff.file },
                        metadata: { filediff: diff }
                      }
                    }
                    parts.push(newEditPart)
                  })
                }
                
                const hasError = info.error !== undefined
                const isCompleted = info.time?.completed
                const newStatus = hasError ? 'error' : (isCompleted ? 'success' : 'loading')
                
                const newMessage: Message = {
                  id: info.id,
                  content: '',
                  role: 'assistant',
                  timestamp: info.time?.created || Date.now(),
                  status: newStatus,
                  parentID: info.parentID,
                  errorInfo: hasError ? info.error : undefined,
                  parts: parts.length > 0 ? parts : undefined
                }
                return [...prev, newMessage]
              }
          }
          return prev
        })
      }
    } else if (eventType === 'message.removed') {
      // 消息删除
      const { sessionID, messageID } = properties
      if (sessionID === currentSessionId) {
        setMessages(prev => prev.filter(m => m.id !== messageID))
      }
    } else if (eventType === 'session.diff') {
      // 会话diff更新，更新对应的edit工具part
      const { sessionID, diff } = properties
      if (sessionID === currentSessionId && Array.isArray(diff)) {
        console.log(`Processing session.diff with ${diff.length} file changes`)
        
        // 更新消息中对应的edit工具part
        setMessages(prev => prev.map(msg => {
          // 查找消息中是否有edit工具part需要更新
          const updatedParts = msg.parts?.map(part => {
            if (part.type === 'tool' && part.tool === 'edit') {
              // 查找对应的diff
              const fileDiff = diff.find((d: any) => d.file === part.state?.input?.filePath)
              if (fileDiff) {
                const existingState = part.state || { status: 'completed' }
                return {
                  ...part,
                  state: {
                    ...existingState,
                    status: existingState.status || 'completed',
                    metadata: {
                      ...existingState.metadata,
                      filediff: fileDiff
                    }
                  }
                }
              }
            }
            return part
          }) || msg.parts
          
          if (updatedParts !== msg.parts) {
            return { ...msg, parts: updatedParts }
          }
          return msg
        }))
      }
    } else if (eventType === 'session.status') {
      // 更新会话状态
      const { sessionID, status } = properties
      if (sessionID && status) {
        console.log('更新会话状态:', sessionID, status)
        setSessionStatuses(prev => ({
          ...prev,
          [sessionID]: status
        }))
      }
    } else if (eventType === 'session.updated' || eventType === 'session.idle' || eventType === 'session.created' || eventType === 'session.ended') {
      // 忽略其他会话事件，避免连接中断
      console.log('SSE session event:', eventType, properties)
    } else if (eventType === 'server.heartbeat') {
      // 忽略服务器心跳事件
      console.log('SSE server heartbeat')
    } else if (eventType === 'model.updated' || eventType === 'config.updated') {
      // 模型或配置更新，可以重新加载设置
      console.log('SSE config event:', eventType, properties)
      // 重新加载提供商列表
      loadProviders()
    } else if (eventType === 'todo.replied') {
      // 待办事项已响应，可以忽略或更新待办列表
      console.log('SSE todo replied:', eventType, properties)
      // 如果需要，可以重新加载待办事项
      // loadTodos()
    } else if (eventType === 'message.part.delta') {
      const { sessionID, messageID, partID, field, delta } = properties
      if (sessionID === currentSessionId) {
        console.log(`Processing delta for message ${messageID}, part ${partID}, field: ${field}, delta: "${delta}"`)
        setMessages(prev => {
          let found = false
          const mapped = prev.map(msg => {
            if (msg.id === messageID) {
              found = true
              const existingParts = msg.parts || []
              const partIndex = existingParts.findIndex(p => p.id === partID)
              if (partIndex >= 0) {
                // 根据field更新对应字段
                const updatedParts = [...existingParts]
                const part = updatedParts[partIndex]
                let updatedPart = { ...part }
                
                if (field === 'text' || field === 'content') {
                  updatedPart.content = (part.content || '') + delta
                } else if (field === 'description' && part.type === 'reasoning') {
                  // 对于reasoning part，更新description字段（同时更新thoughtChain步骤）
                  updatedPart.content = (part.content || '') + delta
                } else if (field === 'output' && part.type === 'tool') {
                  // 对于tool part，更新state.output
                  const currentOutput = part.state?.output || ''
                  updatedPart.state = {
                    status: part.state?.status || 'running',
                    ...part.state,
                    output: currentOutput + delta
                  }
                } else {
                  // 默认更新content
                  updatedPart.content = (part.content || '') + delta
                }
                
                updatedParts[partIndex] = updatedPart
                
                // 如果是reasoning part，还需要更新thoughtChain步骤的description
                let updatedMsg = { ...msg, parts: updatedParts }
                if (part.type === 'reasoning' && msg.thoughtChain?.steps) {
                  console.log(`Updating reasoning part ${partID} with delta: "${delta}", current content: "${part.content}", new content: "${updatedPart.content}"`)
                  const stepIndex = msg.thoughtChain.steps.findIndex(step => step.id === partID)
                  if (stepIndex >= 0) {
                    const updatedSteps = [...msg.thoughtChain.steps]
                    updatedSteps[stepIndex] = {
                      ...updatedSteps[stepIndex],
                      description: (updatedSteps[stepIndex].description || '') + delta
                    }
                    updatedMsg.thoughtChain = {
                      ...msg.thoughtChain,
                      steps: updatedSteps
                    }
                  }
                  return updatedMsg
                }
                return updatedMsg
              } else {
                // part不存在，尝试创建part
                console.log(`Part ${partID} not found in message ${messageID}, creating new part based on field: ${field}`)
                
                // 根据field推断part类型（默认text，如果field包含description可能是reasoning，如果field是output可能是tool）
                let partType: 'text' | 'reasoning' | 'tool' = 'text'
                if (field === 'description' || partID.includes('reason') || partID.includes('prt_')) {
                  // prt_开头的ID可能是任何类型，但description字段通常是reasoning
                  partType = field === 'description' ? 'reasoning' : 'text'
                }
                if (field === 'output') {
                  partType = 'tool'
                }
                
                const newPart: MessagePart = {
                  id: partID,
                  type: partType,
                  content: delta,
                  ...(partType === 'tool' && { state: { status: 'running', output: delta } })
                }
                
                // 如果是reasoning part，可能需要初始化thoughtChain
                let updatedMsg = {
                  ...msg,
                  parts: [...existingParts, newPart],
                  content: partType === 'text' ? msg.content + delta : msg.content,
                  status: 'loading' as const // 设置loading状态，等待后续更新
                }
                
                if (partType === 'reasoning') {
                  // 为reasoning part初始化thoughtChain
                  updatedMsg = {
                    ...updatedMsg,
                    thoughtChain: {
                      steps: [{
                        id: partID,
                        description: delta,
                         status: 'running' as const,
                        messageId: messageID
                      }],
                       expanded: true  // delta事件表示思考中，展开
                    }
                  }
                }
                
                console.log(`Created new ${partType} part ${partID} for message ${messageID}, content: "${delta}"`)
                return updatedMsg
              }
            } else {
              return msg
            }
          })

          // 如果delta对应的message不存在，创建一个临时消息来接收后续delta
          if (!found) {
            console.log(`Delta for unknown message ${messageID}, creating temp message`)
            let partType: 'text' | 'reasoning' | 'tool' = 'text'
            if (field === 'description' || partID.includes('reason') || partID.includes('prt_')) {
              partType = field === 'description' ? 'reasoning' : 'text'
            }
            if (field === 'output') partType = 'tool'

            const newPart: MessagePart = {
              id: partID,
              type: partType,
              content: delta,
              ...(partType === 'tool' && { state: { status: 'running', output: delta } })
            }

            let newMsg: Message = {
              id: messageID,
              role: 'assistant',
              content: partType === 'text' ? delta : '',
              status: 'loading' as const,
              timestamp: Date.now(),
              parts: [newPart],
            }

            if (partType === 'reasoning') {
              newMsg.thoughtChain = {
                steps: [{
                  id: partID,
                  description: delta,
                  status: 'running' as const,
                  messageId: messageID
                }],
                expanded: true
              }
            }

            return [...mapped.filter(m => !m.id.startsWith('temp-assistant-')), newMsg]
          }

          return mapped
        })
      }
    } else if (eventType === 'permission.asked') {
      // 权限请求
      const request = properties
      if (request) {
        console.log('收到权限请求:', request)
        
        // 只处理当前会话的权限请求
        if (!currentSessionId || request.sessionID === currentSessionId) {
          const { autoConfirm, settings } = propsRef.current
          
          // 自动确认逻辑
          if (autoConfirm) {
            console.log('自动确认权限请求 (全局自动确认):', request.id)
            // 延迟100ms后自动回复允许一次，确保UI面板有足够时间显示
            setTimeout(() => {
              kotlinApi.replyPermission(request.id, 'once').then(result => {
                if (result.error) {
                  console.error('自动确认权限失败:', result.error)
                } else {
                  console.log('权限自动确认成功')
                }
              })
            }, 100)
            // 不需要添加到待处理列表或显示对话框
            return
          }
          
          // 使用权限规则进行评估
          const decision = evaluatePermission(request, settings.permissions)
          const reply = mapDecisionToReply(decision)
          
          if (reply) {
            // 根据规则自动回复
            console.log(`权限规则评估: ${decision} -> ${reply}`, request.id)
            setTimeout(() => {
              kotlinApi.replyPermission(request.id, reply).then(result => {
                if (result.error) {
                  console.error('权限自动回复失败:', result.error)
                } else {
                  console.log('权限自动回复成功')
                }
              })
            }, 100)
            // 不需要添加到待处理列表或显示对话框
            return
          }
          
          // 需要用户确认，添加到待处理列表并设置当前权限
          console.log('权限规则评估: ask -> 需要用户确认', request.id)
          setPermissionRequests(prev => [...prev, request])
          setCurrentPermission(request)
        }
      }
    } else if (eventType === 'question.asked') {
      // 问题请求
      const request = properties
      if (request) {
        console.log('收到问题请求:', request)
        // 如果没有当前会话ID，或者会话ID匹配，则添加问题请求
        if (!currentSessionId || request.sessionID === currentSessionId) {
          setQuestionRequests(prev => [...prev, request])
          // 总是设置新问询为当前问询，覆盖之前的
          setCurrentQuestion(request)
          setCurrentQuestionIndex(0)
          setSelectedAnswers([])
          setCustomAnswers([])
        }
      }
    } else if (eventType === 'permission.replied') {
      // 权限已响应
      const { requestID } = properties
      setPermissionRequests(prev => prev.filter(req => req.id !== requestID))
       if (propsRef.current.currentPermission?.id === requestID) {
        setCurrentPermission(null)
      }
    } else if (eventType === 'question.replied') {
      // 问题已回答
      const { requestID } = properties
      setQuestionRequests(prev => {
        const remaining = prev.filter(req => req.id !== requestID)
        if (propsRef.current.currentQuestion?.id === requestID) {
          setCurrentQuestion(null)
          setCurrentQuestionIndex(0)
          // 如果有其他问询，设置下一个为当前问询
          if (remaining.length > 0) {
            setCurrentQuestion(remaining[0])
            setCurrentQuestionIndex(0)
            setSelectedAnswers([])
            setCustomAnswers([])
          }
        }
        return remaining
      })
    } else if (eventType === 'question.rejected') {
      // 问题被拒绝
      const { requestID } = properties
      setQuestionRequests(prev => {
        const remaining = prev.filter(req => req.id !== requestID)
        if (propsRef.current.currentQuestion?.id === requestID) {
          setCurrentQuestion(null)
          setCurrentQuestionIndex(0)
          // 如果有其他问询，设置下一个为当前问询
          if (remaining.length > 0) {
            setCurrentQuestion(remaining[0])
            setCurrentQuestionIndex(0)
            setSelectedAnswers([])
            setCustomAnswers([])
          }
        }
        return remaining
      })
    }
    // 其他事件类型可以在这里添加
  }

  const handlerRef = useRef(handleSSEEvent)
  useEffect(() => {
    handlerRef.current = handleSSEEvent
  })

  useEffect(() => {
    if (serverStatus !== 'running') return
    if (isConnectingRef.current) return

    // 清除之前的重连定时器
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    const connectSSE = async () => {
      isConnectingRef.current = true
      try {
        const serverUrl = await getServerUrl()
         const response = await fetch(`${serverUrl}/api/opencode/global/event`, {
           signal: sseRef.current.abortController?.signal,
           headers: {
             Accept: 'text/event-stream',
           },
         })

         if (!response.ok || !response.body) {
           console.error('❌ SSE connection failed: response not ok or no body')
           throw new Error('Failed to connect to SSE')
         }
         
         console.log('✅ SSE connection established successfully to', `${serverUrl}/api/opencode/global/event`)

        const readableStream = response.body
        const sseStream = XStream({ readableStream })

        const reader = sseStream.getReader()
        sseRef.current.reader = reader

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const { event, data } = value
          console.log('SSE event:', event, data)
          
          // Special logging for right-click debugging
          if (event === 'chat_message') {
            console.log('🔵 SSE RIGHT-CLICK EVENT DETECTED:', event, data)
          }

          try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data
            
            // 根据SSE格式调整事件类型和数据
            const eventType = parsedData.payload?.type || event
            const properties = parsedData.payload?.properties || parsedData
            
            handlerRef.current(eventType, properties, event, data)
          } catch (e) {
            console.warn('Failed to parse SSE data', e)
          }
        }
       } catch (error) {
         if (error instanceof Error && error.name === 'AbortError') {
           console.log('SSE connection aborted')
         } else {
           console.error('❌ SSE connection error:', error)
           console.log('🔄 Retrying SSE connection in 5 seconds...')
           // 5秒后重连
           retryTimeoutRef.current = setTimeout(connectSSE, 5000)
         }
      } finally {
        isConnectingRef.current = false
      }
    }

    sseRef.current.abortController = new AbortController()
    connectSSE()

    return () => {
      sseRef.current.abortController?.abort()
      if (sseRef.current.reader) {
        sseRef.current.reader.cancel()
      }
      sseRef.current = {}

      // Clear retry timeout and reset connecting state
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      isConnectingRef.current = false
    }
  }, [serverStatus, currentSessionId, sseReconnectKey])
}