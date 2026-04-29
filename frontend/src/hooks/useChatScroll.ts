import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react'

interface UseChatScrollOptions {
  /** 滚动容器的ref */
  scrollRef: React.RefObject<HTMLElement>
  /** ChatArea的ref */
  chatAreaRef?: React.RefObject<{ scrollToBottom: () => void }>
  /** 消息列表 */
  messages: any[]
  /** 是否正在加载更多历史消息 */
  loadingMoreMessages: boolean
  /** 是否正在加载历史消息（内部状态） */
  isLoadingHistory?: boolean
  /** SSE分片阈值（字符数），超过此值启用分片加载 */
  chunkThreshold?: number
  /** 分片延迟（毫秒） */
  chunkDelay?: number
  /** 距离底部的容差（像素），小于此值视为在底部 */
  bottomTolerance?: number
  /** 显示滚动到底部按钮的距离阈值（可视区域比例） */
  showButtonThreshold?: number
}

interface UseChatScrollReturn {
  /** 强制滚动到底部（发送消息时调用） */
  forceScrollToBottom: () => void
  /** 手动滚动到底部（按钮点击时调用） */
  scrollToBottom: () => void
  /** 是否显示滚动到底部按钮 */
  showScrollToBottom: boolean
  /** 是否在底部 */
  isAtBottom: boolean
  /** 设置历史消息加载状态 */
  setLoadingHistory: (loading: boolean) => void
  /** 分片加载内容（SSE流式数据超过阈值时使用） */
  chunkedAppend: (text: string) => Promise<void>
  /** 重置分片队列 */
  resetChunkQueue: () => void
}

export function useChatScroll(options: UseChatScrollOptions): UseChatScrollReturn {
  const {
    scrollRef,
    chatAreaRef,
    messages,
    loadingMoreMessages,
    chunkThreshold = 30,
    chunkDelay = 16,
    bottomTolerance = 10,
    showButtonThreshold = 0.5,
  } = options

  // 状态
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Refs
  const isAtBottomRef = useRef(true)
  const distanceFromBottomRef = useRef(0)
  const lastScrollHeightRef = useRef(0)
  const forceScrollRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const lastFirstMessageIdRef = useRef<string>('')
  const isLoadingHistoryRef = useRef(false)
  const isUserInteractingRef = useRef(false)
  const userInteractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chunkQueueRef = useRef<Array<{ text: string; resolve: () => void }>>([])
  const isProcessingChunksRef = useRef(false)
  const pendingContentRef = useRef('')

  // 设置历史消息加载状态
  const setLoadingHistory = useCallback((loading: boolean) => {
    isLoadingHistoryRef.current = loading
  }, [])

  // 滚动到底部的核心函数
  const performScrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    if (chatAreaRef?.current) {
      chatAreaRef.current.scrollToBottom()
      // 微调确保完全到底
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const dist = scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight
          if (dist > bottomTolerance) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
          }
        }
      })
    } else {
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior })
    }
  }, [scrollRef, chatAreaRef, bottomTolerance])

  // 强制滚动到底部（发送消息时调用）
  const forceScrollToBottom = useCallback(() => {
    forceScrollRef.current = true
    distanceFromBottomRef.current = 0
    isAtBottomRef.current = true
    setIsAtBottom(true)
    setShowScrollToBottom(false)

    requestAnimationFrame(() => {
      performScrollToBottom('smooth')
      forceScrollRef.current = false
    })
  }, [performScrollToBottom])

  // 手动滚动到底部（按钮点击）
  const scrollToBottom = useCallback(() => {
    performScrollToBottom('smooth')
    setIsAtBottom(true)
    isAtBottomRef.current = true
    distanceFromBottomRef.current = 0
    setShowScrollToBottom(false)
  }, [performScrollToBottom])

  // 分片处理队列
  const processChunkQueue = useCallback(() => {
    if (isProcessingChunksRef.current || chunkQueueRef.current.length === 0) return

    isProcessingChunksRef.current = true
    const { text, resolve } = chunkQueueRef.current.shift()!

    pendingContentRef.current += text

    // 如果用户在底部且没有用户交互，滚动到底部
    if (isAtBottomRef.current && !isUserInteractingRef.current) {
      requestAnimationFrame(() => {
        performScrollToBottom('smooth')
      })
    }

    setTimeout(() => {
      resolve()
      isProcessingChunksRef.current = false
      processChunkQueue()
    }, chunkDelay)
  }, [chunkDelay, performScrollToBottom])

  // 分片加载内容
  const chunkedAppend = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (text.length <= chunkThreshold) {
        // 小于阈值，直接处理
        pendingContentRef.current += text
        resolve()
        if (isAtBottomRef.current && !isUserInteractingRef.current) {
          requestAnimationFrame(() => {
            performScrollToBottom('smooth')
          })
        }
        return
      }

      // 超过阈值，分片处理
      chunkQueueRef.current.push({ text, resolve })
      processChunkQueue()
    })
  }, [chunkThreshold, performScrollToBottom, processChunkQueue])

  // 重置分片队列
  const resetChunkQueue = useCallback(() => {
    chunkQueueRef.current = []
    isProcessingChunksRef.current = false
    pendingContentRef.current = ''
  }, [])

  // 滚动事件监听
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      const isBottom = distanceFromBottom < bottomTolerance

      setIsAtBottom(isBottom)
      isAtBottomRef.current = isBottom
      distanceFromBottomRef.current = distanceFromBottom

      // 显示/隐藏滚动到底部按钮
      const threshold = clientHeight * showButtonThreshold
      setShowScrollToBottom(!isBottom && distanceFromBottom > threshold)
    }

    // 用户交互检测（触摸/鼠标滚轮）
    const handleWheel = () => {
      isUserInteractingRef.current = true
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current)
      }
      // 用户停止滚动500ms后恢复自动附着
      userInteractionTimeoutRef.current = setTimeout(() => {
        isUserInteractingRef.current = false
        // 如果用户滚到底部，重新启用自动附着
        if (isAtBottomRef.current) {
          performScrollToBottom('smooth')
        }
      }, 500)
    }

    // 鼠标触摸滚动条检测
    const handleMouseDown = (e: MouseEvent) => {
      // 检查是否点击在滚动条区域
      const rect = scrollElement.getBoundingClientRect()
      const isScrollbarClick = e.clientX > rect.right - 15 || e.clientY > rect.bottom - 15
      if (isScrollbarClick) {
        isUserInteractingRef.current = true
        if (userInteractionTimeoutRef.current) {
          clearTimeout(userInteractionTimeoutRef.current)
        }
        userInteractionTimeoutRef.current = setTimeout(() => {
          isUserInteractingRef.current = false
          if (isAtBottomRef.current) {
            performScrollToBottom('smooth')
          }
        }, 500)
      }
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    scrollElement.addEventListener('wheel', handleWheel, { passive: true })
    scrollElement.addEventListener('mousedown', handleMouseDown)

    // 初始检查
    handleScroll()

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      scrollElement.removeEventListener('wheel', handleWheel)
      scrollElement.removeEventListener('mousedown', handleMouseDown)
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current)
      }
    }
  }, [scrollRef, bottomTolerance, showButtonThreshold, performScrollToBottom])

  // 消息变化时的智能滚动
  useEffect(() => {
    if (!scrollRef.current) return

    const firstMsgId = messages[0]?.id || ''
    const isHistoryMessageAtTop = firstMsgId !== lastFirstMessageIdRef.current

    // 初次加载：直接滚动到底部
    if (!initialScrollDoneRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        performScrollToBottom('smooth')
      })
      initialScrollDoneRef.current = true
      setIsAtBottom(true)
      isAtBottomRef.current = true
      distanceFromBottomRef.current = 0
      setShowScrollToBottom(false)
    } else {
      // 非初次加载：用户在底部且不是加载历史消息时才滚动
      const shouldScroll = forceScrollRef.current ||
        (distanceFromBottomRef.current < 100 && !isHistoryMessageAtTop && !loadingMoreMessages && !isLoadingHistoryRef.current && !isUserInteractingRef.current)

      if (shouldScroll) {
        requestAnimationFrame(() => {
          performScrollToBottom('smooth')
        })
        setIsAtBottom(true)
        isAtBottomRef.current = true
        distanceFromBottomRef.current = 0
        forceScrollRef.current = false
      }
    }

    lastFirstMessageIdRef.current = firstMsgId
  }, [messages, loadingMoreMessages, scrollRef, performScrollToBottom])

  // 内容高度变化检测（处理工具调用展开等）
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    const currentScrollHeight = scrollRef.current.scrollHeight
    const prevScrollHeight = lastScrollHeightRef.current
    lastScrollHeightRef.current = currentScrollHeight

    // 高度增加且用户接近底部，自动滚动
    const shouldScroll = forceScrollRef.current ||
      (currentScrollHeight > prevScrollHeight && distanceFromBottomRef.current < 100 && !loadingMoreMessages && !isLoadingHistoryRef.current && !isUserInteractingRef.current)

    if (shouldScroll) {
      const firstMsgId = messages[0]?.id || ''
      const isHistoryMessageAtTop = firstMsgId !== lastFirstMessageIdRef.current
      if (!isHistoryMessageAtTop || forceScrollRef.current) {
        requestAnimationFrame(() => {
          performScrollToBottom('smooth')
        })
        if (forceScrollRef.current) {
          forceScrollRef.current = false
        }
      }
    }
  })

  // Todo折叠状态变化时保持滚动位置
  useEffect(() => {
    // 这个effect由外部触发，这里只是占位
    // 实际使用时，外部需要在todoCollapsed变化时调用
  }, [])

  return {
    forceScrollToBottom,
    scrollToBottom,
    showScrollToBottom,
    isAtBottom,
    setLoadingHistory,
    chunkedAppend,
    resetChunkQueue,
  }
}
