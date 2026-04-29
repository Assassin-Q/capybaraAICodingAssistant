import React from 'react'
import { Select } from 'antd'


interface ThemeTabProps {
  isDark: boolean
  onThemeChange: (isDark: boolean) => void
}

const ThemeTab: React.FC<ThemeTabProps> = ({
  isDark,
  onThemeChange,
}) => {
  return (
    <div>
      <div style={{ marginBottom: 8, color: 'var(--text-primary)' }}>主题模式</div>
      <Select
        value={isDark ? 'dark' : 'light'}
        onChange={value => onThemeChange(value === 'dark')}
        style={{ width: '100%' }}
        options={[
          { label: '深色主题', value: 'dark' },
          { label: '浅色主题', value: 'light' },
        ]}
      />
    </div>
  )
}

export default ThemeTab