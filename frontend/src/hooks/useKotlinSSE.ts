import { useEffect, useRef } from 'react'
import { XStream } from '@ant-design/x-sdk'
import { getServerUrl } from '../utils/kotlinApi'
import type { ChatMessage } from '../utils/kotlinApi'

interface UseKotlinSSEProps {
  serverStatus: string
  sseReconnectKey?: number
  onChatMessage: (chatMsg: ChatMessage) => void
}

export function useKotlinSSE(props: UseKotlinSSEProps) {
  const { serverStatus, sseReconnectKey } = props
  const propsRef = useRef<UseKotlinSSEProps>(props)
  
  // 每次渲染更新ref
  useEffect(() => {
    propsRef.current = props
  })
  
  const sseRef = useRef<{
    abortController?: AbortController
    reader?: ReadableStreamDefaultReader
  }>({})
  const isConnectingRef = useRef(false)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const response = await fetch(`${serverUrl}/api/events`, {
          signal: sseRef.current.abortController?.signal,
          headers: {
            Accept: 'text/event-stream',
          },
        })

        if (!response.ok || !response.body) {
          console.error('❌ Kotlin SSE connection failed: response not ok or no body')
          throw new Error('Failed to connect to Kotlin SSE')
        }
        
        console.log('✅ Kotlin SSE connection established successfully to', `${serverUrl}/api/events`)

        const readableStream = response.body
        const sseStream = XStream({ readableStream })

        const reader = sseStream.getReader()
        sseRef.current.reader = reader

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const { event, data } = value
          console.log('Kotlin SSE event:', event, data)
          
          try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data
            
            // 处理chat_message事件
            if (event === 'chat_message') {
              console.log('🔵 Kotlin SSE CHAT_MESSAGE EVENT:', parsedData)
              // 转换为完整的ChatMessage格式
              const chatMsg: ChatMessage = {
                id: parsedData.id || Date.now(),
                type: parsedData.type,
                content: parsedData.content,
                fileName: parsedData.fileName,
                lineRange: parsedData.lineStart && parsedData.lineEnd ? {
                  start: parsedData.lineStart,
                  end: parsedData.lineEnd
                } : undefined,
                timestamp: Date.now(),
                status: 'success'
              }
              propsRef.current.onChatMessage(chatMsg)
            }
          } catch (e) {
            console.warn('Failed to parse Kotlin SSE data', e)
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Kotlin SSE connection aborted')
        } else {
          console.error('❌ Kotlin SSE connection error:', error)
          console.log('🔄 Retrying Kotlin SSE connection in 5 seconds...')
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
  }, [serverStatus, sseReconnectKey])
}
