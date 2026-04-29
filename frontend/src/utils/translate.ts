// 语言代码映射
export const LANGUAGE_OPTIONS = [
  { code: 'auto', name: '自动检测' },
  { code: 'zh-CN', name: '中文（简体）' },
  { code: 'zh-TW', name: '中文（繁体）' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'ar', name: '阿拉伯语' },
  { code: 'th', name: '泰语' },
  { code: 'vi', name: '越南语' },
  { code: 'it', name: '意大利语' },
  { code: 'nl', name: '荷兰语' },
  { code: 'pl', name: '波兰语' },
  { code: 'tr', name: '土耳其语' },
  { code: 'id', name: '印尼语' },
  { code: 'ms', name: '马来语' },
  { code: 'hi', name: '印地语' },
  { code: 'bn', name: '孟加拉语' },
]

const LANG_NAME_MAP: Record<string, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'de': '德语',
  'es': '西班牙语',
  'pt': '葡萄牙语',
  'ru': '俄语',
  'ar': '阿拉伯语',
  'th': '泰语',
  'vi': '越南语',
  'it': '意大利语',
  'nl': '荷兰语',
  'pl': '波兰语',
  'tr': '土耳其语',
  'id': '印尼语',
  'ms': '马来语',
  'hi': '印地语',
  'bn': '孟加拉语',
}

// SiliconFlow API 配置
const SILICONFLOW_API = 'https://api.siliconflow.cn/v1/chat/completions'
const SILICONFLOW_MODEL = 'Qwen/Qwen2.5-7B-Instruct'
let storedApiKey: string | undefined

export function setSiliconFlowKey(key: string) {
  storedApiKey = key
}

function getApiHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (storedApiKey) {
    headers['Authorization'] = `Bearer ${storedApiKey}`
  }
  return headers
}

export function getBrowserLanguage(): string {
  const lang = navigator.language || 'zh-CN'
  const langMap: Record<string, string> = {
    'zh': 'zh-CN',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'zh-HK': 'zh-TW',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'fr': 'fr',
    'de': 'de',
  }
  return langMap[lang] || lang.split('-')[0] || 'en'
}

// 使用 SiliconFlow API 检测语言
export async function detectLanguage(text: string): Promise<string> {
  try {
    const prompt = `Please identify the language of the following text. Only return the language code, nothing else.
Examples: "Hello" -> "en", "你好" -> "zh-CN", "こんにちは" -> "ja", "안녕하세요" -> "ko", "Bonjour" -> "fr"

Text: ${text.slice(0, 500)}

Language code:`

    const res = await fetch(SILICONFLOW_API, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        model: SILICONFLOW_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0,
      }),
    })

    const data = await res.json()
    const code = (data?.choices?.[0]?.message?.content || '').trim().toLowerCase()
    // 验证返回的是有效的语言代码
    if (LANG_NAME_MAP[code] || code === 'en' || code === 'zh-cn' || code === 'zh-tw') {
      return code === 'zh-cn' ? 'zh-CN' : code === 'zh-tw' ? 'zh-TW' : code
    }
    return 'en'
  } catch {
    return 'en'
  }
}

// 使用 SiliconFlow API 翻译文本
export async function translateText(
  text: string,
  from: string,
  to: string
): Promise<string> {
  if (!text.trim()) return ''

  try {
    const fromName = LANG_NAME_MAP[from] || from
    const toName = LANG_NAME_MAP[to] || to

    const prompt = `Translate the following text from ${fromName} to ${toName}. Only return the translated text, no explanations or notes.

Text: ${text.slice(0, 4000)}

Translation:`

    const res = await fetch(SILICONFLOW_API, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        model: SILICONFLOW_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    })

    const data = await res.json()
    const translation = (data?.choices?.[0]?.message?.content || '').trim()
    return translation || '翻译失败，请重试'
  } catch (err) {
    console.error('翻译失败:', err)
    return '翻译失败，请检查网络连接'
  }
}
