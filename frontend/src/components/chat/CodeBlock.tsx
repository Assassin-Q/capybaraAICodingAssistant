import React from 'react'
import { message } from 'antd'
import { Mermaid } from '@ant-design/x'
import { CopyOutlined } from '@ant-design/icons'
import { File } from '@pierre/diffs/react'

export const CodeBlockContext = React.createContext(true)

interface CodeBlockProps {
  className?: string
  children?: React.ReactNode
  domNode?: any
  streamStatus?: any
  lang?: string
  block?: boolean
}

const CodeBlock: React.FC<CodeBlockProps> = (props) => {
  const isDark = React.useContext(CodeBlockContext)
  const { className, children } = props
  const lang = className?.match(/language-(\w+)/)?.[1] || ''
  if (typeof children !== 'string') return null

  if (lang === 'mermaid') {
    return <Mermaid>{children}</Mermaid>
  }

  const lineCount = children.split('\n').filter(l => l.trim() || true).length
  const showLineNumbers = lineCount > 1

  if (lineCount <= 1) {
    return (
      <span style={{
        display: 'inline',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-code)',
        padding: '2px 6px',
        fontFamily: "'SF Mono', 'Fira Code', 'Menlo', 'Monaco', monospace",
        fontSize: '13px',
      }}>
        {children}
      </span>
    )
  }

  return (
    <div style={{
      position: 'relative',
      maxWidth: '100%',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-code)',
      overflow: 'hidden',
    }}>
      <File
        file={{
          name: `index.${lang || 'text'}`,
          contents: children,
          lang: lang || 'text',
        }}
        options={{
          theme: isDark ? 'pierre-dark' : 'pierre-light',
          disableLineNumbers: !showLineNumbers,
          disableFileHeader: true,
          lineHoverHighlight: 'disabled',
          enableLineSelection: false,
        }}
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(children).then(() => {
            message.success('已复制到剪贴板')
          })
        }}
        title="复制代码"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          opacity: 0.6,
          zIndex: 10,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.color = 'var(--accent-color)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
      >
        <CopyOutlined style={{ fontSize: '14px' }} />
      </button>
    </div>
  )
}

export default React.memo(CodeBlock)
