import React, { useEffect } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import AIAssistantPanel from './components/AIAssistantPanel'
import { LocaleProvider, useLocale } from './locales/LocaleContext'

const antdLocales: Record<string, any> = { zh: zhCN, en: enUS }

const AppContent: React.FC<{
  isDark: boolean
  onThemeChange: (dark: boolean) => void
}> = ({ isDark, onThemeChange }) => {
  const { locale } = useLocale()

  return (
    <ConfigProvider
      locale={antdLocales[locale] || zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#61afef',
          borderRadius: 2,
        },
      }}
    >
      <div style={{ height: '100%', width: '100%', display: 'flex' }}>
        <AIAssistantPanel 
          isDark={isDark} 
          onThemeChange={onThemeChange}
        />
      </div>
    </ConfigProvider>
  )
}

const App: React.FC = () => {
  const [isDark, setIsDark] = React.useState(true)

  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <LocaleProvider>
      <AppContent isDark={isDark} onThemeChange={setIsDark} />
    </LocaleProvider>
  )
}

export default App
