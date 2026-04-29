import { AbstractChatProvider } from '@ant-design/x-sdk'

interface OpenCodeInput {
  query: string
  model?: string
  context?: string
}

interface OpenCodeOutput {
  content?: string
  done?: boolean
  error?: string
}

interface ChatMessage {
  content: string
  role: 'user' | 'assistant'
  timestamp: number
  status?: 'loading' | 'success' | 'error'
}

export class OpenCodeChatProvider extends AbstractChatProvider<ChatMessage, OpenCodeInput, OpenCodeOutput> {
  transformParams(
    requestParams: Partial<OpenCodeInput>,
    options?: any
  ): OpenCodeInput {
    return {
      query: requestParams.query || '',
      model: requestParams.model || 'gpt-4',
      context: requestParams.context,
      ...(options?.params || {}),
    }
  }

  transformLocalMessage(requestParams: Partial<OpenCodeInput>): ChatMessage {
    return {
      content: requestParams.query || '',
      role: 'user',
      timestamp: Date.now(),
    }
  }

  transformMessage(info: { originMessage?: ChatMessage; chunk: OpenCodeOutput }): ChatMessage {
    const { originMessage, chunk } = info

    if (chunk?.done || !chunk?.content) {
      return {
        content: originMessage?.content || '',
        role: originMessage?.role || 'assistant',
        timestamp: originMessage?.timestamp || Date.now(),
        status: 'success' as const,
      }
    }

    return {
      content: `${originMessage?.content || ''}${chunk.content || ''}`,
      role: 'assistant' as const,
      timestamp: originMessage?.timestamp || Date.now(),
      status: 'loading' as const,
    }
  }
}