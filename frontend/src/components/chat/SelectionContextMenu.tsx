import React, { useEffect, useRef, useState } from 'react'
import { message as antMessage } from 'antd'
import { CopyOutlined, TranslationOutlined, MessageOutlined, FileOutlined, AppstoreOutlined, CloudServerOutlined } from '@ant-design/icons'

interface SelectionContextMenuProps {
  onTranslate: (text: string) => void
  onAddToChat?: (text: string) => void
  onSelectSkill?: () => void
  onSelectMCP?: () => void
  onFileSelect?: (files: FileList) => void
  onPasteText?: (text: string) => string
}

const MENU_WIDTH = 170
const EDGE_MARGIN = 8

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = ({
  onTranslate, onAddToChat, onSelectSkill, onSelectMCP, onFileSelect, onPasteText
}) => {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [isInInput, setIsInInput] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const adjustPosition = (x: number, y: number, menuW: number, menuH: number) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    let adjustedX = x
    let adjustedY = y
    if (x + menuW > vw - EDGE_MARGIN) adjustedX = vw - menuW - EDGE_MARGIN
    if (x < EDGE_MARGIN) adjustedX = EDGE_MARGIN
    if (y + menuH > vh - EDGE_MARGIN) adjustedY = vh - menuH - EDGE_MARGIN
    if (y < EDGE_MARGIN) adjustedY = EDGE_MARGIN
    return { x: adjustedX, y: adjustedY }
  }

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // 阻止所有右键的浏览器原生菜单
      e.preventDefault()
      e.stopPropagation()

      const target = e.target as HTMLElement
      const inInput = target.closest('[contenteditable="true"]') !== null ||
        target.closest('.chat-input-area') !== null

      const selection = window.getSelection()
      const text = selection?.toString()?.trim() || ''

      // 无划词且不在输入框 → 不显示任何菜单
      if (!text && !inInput) return

      setIsInInput(inInput)
      setSelectedText(text)

      const itemCount = inInput && !text ? 4 : 3
      const menuH = itemCount * 36 + 12
      const pos = adjustPosition(e.clientX, e.clientY, MENU_WIDTH, menuH)
      setPosition(pos)
      setVisible(true)
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }

    const handleKeyDown = () => setVisible(false)

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText)
      antMessage.success('已复制到剪贴板')
    } catch {
      document.execCommand('copy')
      antMessage.success('已复制到剪贴板')
    }
    setVisible(false)
  }

  const handlePaste = async () => {
    try {
      let text = await navigator.clipboard.readText()
      // 调用长文本转换
      if (onPasteText) text = onPasteText(text)
      const div = document.querySelector('[contenteditable="true"]') as HTMLDivElement
      if (div) {
        div.focus()
        const sel = window.getSelection()
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          // 检查是否包含 LONG_TEXT 标签，使用 insertNode 兼容 JCEF
          const isSpecial = /\[(LONG_TEXT|SKILL|MCP|FILE|IMAGE):[^\]]+\]/.test(text)
          if (isSpecial) {
            // 创建文本节点，让 MessageInput 的 sync effect 后续通过 renderTextToDOM 创建 DOM
            range.insertNode(document.createTextNode(text))
          } else {
            range.insertNode(document.createTextNode(text))
          }
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        } else {
          div.appendChild(document.createTextNode(text))
        }
        div.dispatchEvent(new Event('input', { bubbles: true }))
        antMessage.success('已粘贴')
      }
    } catch {
      antMessage.error('粘贴失败，剪贴板可能为空')
    }
    setVisible(false)
  }

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0 && onFileSelect) {
        onFileSelect(files)
        antMessage.success(`已选择 ${files.length} 个文件`)
      }
    }
    input.click()
    setVisible(false)
  }

  if (!visible) return null

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 9999,
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    padding: '4px 0',
    minWidth: MENU_WIDTH,
  }

  const itemStyle = (color?: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 16px',
    cursor: 'pointer',
    fontSize: 13,
    color: color || 'var(--text-primary)',
    transition: 'background-color 0.15s',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left',
  })

  const dividerStyle: React.CSSProperties = {
    height: 1,
    backgroundColor: 'var(--border-color)',
    margin: '4px 0',
  }

  // 输入框内无划词 → 显示粘贴/Skill/MCP/文件
  if (isInInput && !selectedText) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <button style={itemStyle()} onClick={handlePaste}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <span style={{ fontSize: 14 }}>📋</span><span>粘贴</span>
        </button>
        {onSelectSkill && (
          <button style={itemStyle()} onClick={() => { setVisible(false); onSelectSkill(); antMessage.success('已打开 Skill 选择面板') }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <AppstoreOutlined style={{ color: 'var(--success-color)' }} /><span>选择 Skill</span>
          </button>
        )}
        {onSelectMCP && (
          <button style={itemStyle()} onClick={() => { setVisible(false); onSelectMCP(); antMessage.success('已打开 MCP 选择面板') }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <CloudServerOutlined style={{ color: 'var(--warning-color)' }} /><span>选择 MCP</span>
          </button>
        )}
        <button style={itemStyle()} onClick={handleFileSelect}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <FileOutlined style={{ color: 'var(--accent-color)' }} /><span>选择文件</span>
        </button>
      </div>
    )
  }

  // 有划词（输入框内或消息区）→ 显示复制/添加到对话/翻译
  return (
    <div ref={menuRef} style={menuStyle}>
      <button style={itemStyle()} onClick={handleCopy}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <CopyOutlined style={{ color: 'var(--text-secondary)' }} /><span>复制</span>
      </button>
      {onAddToChat && (
        <button style={{
          ...itemStyle(),
          opacity: isInInput ? 0.4 : 1,
          cursor: isInInput ? 'default' : 'pointer',
        }} onClick={() => {
          if (!isInInput) { setVisible(false); onAddToChat(selectedText) }
        }}
          onMouseEnter={(e) => { if (!isInInput) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <MessageOutlined style={{ color: 'var(--accent-color)' }} /><span>添加到对话</span>
        </button>
      )}
      <div style={dividerStyle} />
      <button style={itemStyle('var(--accent-color)')} onClick={() => { setVisible(false); onTranslate(selectedText) }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <TranslationOutlined /><span>翻译</span>
      </button>
    </div>
  )
}

export default SelectionContextMenu
