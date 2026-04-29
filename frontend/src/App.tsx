import React, { useEffect } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AIAssistantPanel from './components/AIAssistantPanel'

const App: React.FC = () => {
  const [isDark, setIsDark] = React.useState(true)

  // 应用主题到 body
  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#61afef',
          borderRadius: 6,
        },
      }}
    >
      <div style={{ height: '100%', width: '100%', display: 'flex' }}>
        <AIAssistantPanel 
          isDark={isDark} 
          onThemeChange={setIsDark}
        />
      </div>
    </ConfigProvider>
  )
}

export default App
