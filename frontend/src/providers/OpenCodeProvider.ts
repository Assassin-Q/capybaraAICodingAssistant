import { OpenAIChatProvider } from '@ant-design/x-sdk'
import { XRequest } from '@ant-design/x-sdk'

// Use Kotlin proxy endpoint for OpenCode service
const provider = new OpenAIChatProvider({
  request: XRequest('/api/opencode/chat/completions', {
    manual: true,
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      model: 'gpt-4', // Default model, will be overridden by settings
      stream: true,
    },
  }),
})

export default provider