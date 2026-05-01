import React from 'react'
import { useLocale } from '../../locales/LocaleContext'
import { Select } from 'antd'

interface ThemeTabProps {
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
}

const ThemeTab: React.FC<ThemeTabProps> = ({
  isDark,
  onThemeChange,
}) => {
  const { t } = useLocale()
  return (
    <div>
      <div style={{ marginBottom: 8, color: 'var(--text-primary)' }}>{t('theme.title')}</div>
      <Select
        value={isDark ? 'dark' : 'light'}
        onChange={value => onThemeChange(value === 'dark')}
        style={{ width: '100%' }}
        options={[
          { label: t('theme.darkLabel'), value: 'dark' },
          { label: t('theme.lightLabel'), value: 'light' },
        ]}
      />
    </div>
  )
}

export default ThemeTab
