import React, { createContext, useContext, useState, useCallback } from 'react'
import zh from '../locales/zh.json'
import en from '../locales/en.json'

export type Locale = 'zh' | 'en'

const STORAGE_KEY = 'ai-coding-locale'

interface LocaleContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string>) => string
}

const messages: Record<Locale, Record<string, string>> = { zh, en }

const LocaleContext = createContext<LocaleContextType>({
  locale: 'zh',
  setLocale: () => {},
  t: (key: string) => key,
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
    return 'zh'
  })

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem(STORAGE_KEY, newLocale)
  }, [])

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let text = messages[locale]?.[key]
    if (!text) {
      text = messages['zh']?.[key] || key
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
