import React from 'react'
import { Collapse, Modal, Button, message } from 'antd'
import { Think } from '@ant-design/x'
import { XMarkdown } from '@ant-design/x-markdown'
import type { ComponentProps } from '@ant-design/x-markdown'
import { CheckCircleOutlined, ClockCircleOutlined, CopyOutlined } from '@ant-design/icons'

import type { Message, MessagePart, SkillConfig, MCPServer } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'
import DiffViewer from './DiffViewer'
import CodeBlock, { CodeBlockContext } from './CodeBlock'

// 检测是否在JCEF环境中
const isJCEFEnvironment = () => {
  if (typeof window === 'undefined') return false
  if ((window as any).__JCEF__ !== undefined) return true
  try {
    if ((window as any).chrome?.webview !== undefined) return true
    if (navigator.userAgent.includes('IntelliJ') || navigator.userAgent.includes('JetBrains')) return true
  } catch {}
  return false
}

// base64 data URL下载辅助函数，正确保留文件扩展名
const downloadFromDataUrl = async (dataUrl: string, fileName: string) => {
  try {
    // 在JCEF环境中使用Kotlin API保存文件
    if (isJCEFEnvironment()) {
      let base64Content = ''
      let mimeType = 'application/octet-stream'
      
      if (dataUrl.startsWith('data:')) {
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          mimeType = matches[1]
          base64Content = matches[2]
        }
      } else if (dataUrl.startsWith('blob:')) {
        // 对于blob URL，需要先转换为base64
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        const reader = new FileReader()
        base64Content = await new Promise((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string
            const base64 = result.split(',')[1] || ''
            resolve(base64)
          }
          reader.readAsDataURL(blob)
        })
        mimeType = blob.type
      }
      
      if (base64Content) {
        // 先让用户选择保存路径
        const pathResponse = await kotlinApi.chooseSavePath(fileName)
        if (!pathResponse.data?.success || !pathResponse.data?.path) {
          // 用户取消选择，不提示错误
          return
        }
        // 直接写入选中路径
        const savePath = pathResponse.data.path
        const result = await kotlinApi.saveFile(fileName, base64Content, mimeType, savePath)
        if (result.data?.success) {
          message.success(`文件已保存到: ${result.data.path}`)
        } else if (result.data?.message === 'User cancelled') {
          // 用户取消
        } else {
          message.error('保存文件失败: ' + (result.error || '未知错误'))
        }
        return
      }
    }
    
    // 非JCEF环境使用原有逻辑
    if (dataUrl.startsWith('blob:')) {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      const mime = matches[1]
      const base64 = matches[2]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: mime })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } else {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  } catch (err) {
    console.error('下载文件失败:', err)
    message.error('下载文件失败')
  }
}


interface MessageContentProps {
  msg: Message
  skills: SkillConfig[]
  mcpServers: MCPServer[]
  sessionId?: string
  onGoToSession?: (sessionId: string) => void
  isDark: boolean
}

const MessageContent: React.FC<MessageContentProps> = ({ msg, skills, mcpServers, sessionId, onGoToSession, isDark }) => {
  // 状态管理：用户手动展开的思考链和工具面板
  const expandedStateRef = React.useRef<{
    thoughts: Record<string, boolean>;
    tools: Record<string, boolean>;
  }>({ thoughts: {}, tools: {} })

  // 长文本弹窗状态
  const [longTextModalVisible, setLongTextModalVisible] = React.useState(false)
  const [longTextContent, setLongTextContent] = React.useState('')
  
  // 图片预览弹窗状态
  const [imagePreviewVisible, setImagePreviewVisible] = React.useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState('')
  const [imagePreviewName, setImagePreviewName] = React.useState('')
  
  // 文件信息弹窗状态
  const [fileInfoVisible, setFileInfoVisible] = React.useState(false)
  const [fileInfoName, setFileInfoName] = React.useState('')
  const [fileInfoUrl, setFileInfoUrl] = React.useState('')
  const [fileInfoMime, setFileInfoMime] = React.useState('')
  
  // Skill/MCP信息弹窗状态
  const [skillInfoVisible, setSkillInfoVisible] = React.useState(false)
  const [skillInfoName, setSkillInfoName] = React.useState('')
  const [skillInfoDescription, setSkillInfoDescription] = React.useState('')
  const [skillInfoType, setSkillInfoType] = React.useState<'skill' | 'mcp'>('skill')
  
  const containerRef = React.useRef<HTMLDivElement>(null)

  // 点击长文本标签显示弹窗
  const showLongTextModal = React.useCallback((encodedContent: string) => {
    try {
      // 解码base64并还原原始文本
      const decoded = decodeURIComponent(atob(encodedContent))
      setLongTextContent(decoded)
      setLongTextModalVisible(true)
    } catch (error) {
      console.error('解码长文本失败:', error, encodedContent)
      // 如果解码失败，显示原始内容（可能是旧格式）
      setLongTextContent(encodedContent)
      setLongTextModalVisible(true)
    }
  }, [])

  // 使用ref存储最新值，供全局函数读取
  const msgPartsRef = React.useRef(msg.parts)
  const skillsRef = React.useRef(skills)
  const mcpServersRef = React.useRef(mcpServers)
  msgPartsRef.current = msg.parts
  skillsRef.current = skills
  mcpServersRef.current = mcpServers

  // 直接在渲染时设置全局函数（确保首次渲染即可用，不依赖useEffect异步执行）
  ;(window as any).showLongTextModal = showLongTextModal

  ;(window as any).showImagePreviewModal = (data: string, fileName: string) => {
    const cleanFileName = fileName.replace(/^[📄🖼️]\s*/, '')
    if (data.startsWith('data:') || data.startsWith('blob:') || data.startsWith('http')) {
      setImagePreviewUrl(data)
      setImagePreviewName(cleanFileName)
      setImagePreviewVisible(true)
      return
    }
    const tagSegments = data.split('|')
    const tagMime = tagSegments[1] || 'image/png'
    const tagData = tagSegments.slice(2).join('|')
    if (tagData) {
      setImagePreviewUrl(`data:${tagMime};base64,${tagData}`)
      setImagePreviewName(cleanFileName)
      setImagePreviewVisible(true)
    } else {
      message.info('图片数据暂不可用')
    }
  }
  
  ;(window as any).showFileInfoModal = (data: string, displayFileName: string) => {
    const cleanFileName = displayFileName.replace(/^[📄🖼️]\s*/, '')
    if (data && (data.startsWith('data:') || data.startsWith('blob:') || data.startsWith('http'))) {
      const mime = data.substring(5, data.indexOf(';')) || ''
      if (mime.startsWith('image/')) {
        setImagePreviewUrl(data)
        setImagePreviewName(cleanFileName)
        setImagePreviewVisible(true)
        return
      }
      setFileInfoName(cleanFileName)
      setFileInfoMime(mime)
      setFileInfoUrl(data)
      setFileInfoVisible(true)
      return
    }
    const tagParts = (data || '').split('|')
    const tagFileName = tagParts[0] || cleanFileName
    const tagMime = tagParts[1] || ''
    const tagData = tagParts.slice(2).join('|')
    if (tagMime.startsWith('image/') && tagData) {
      setImagePreviewUrl(`data:${tagMime};base64,${tagData}`)
      setImagePreviewName(tagFileName)
      setImagePreviewVisible(true)
      return
    }
    const fileUrl = tagData ? `data:${tagMime};base64,${tagData}` : ''
    setFileInfoName(tagFileName)
    setFileInfoMime(tagMime)
    setFileInfoUrl(fileUrl)
    setFileInfoVisible(true)
  }
  
  ;(window as any).showSkillInfoModal = (name: string, type: 'skill' | 'mcp') => {
    setSkillInfoName(name)
    setSkillInfoType(type)
    if (type === 'skill') {
      const skill = skillsRef.current.find(s => s.name === name)
      setSkillInfoDescription(skill?.description || '暂无描述')
    } else {
      const mcp = mcpServersRef.current.find(m => m.name === name)
      setSkillInfoDescription(mcp?.url || '暂无描述')
    }
    setSkillInfoVisible(true)
  }

  // 高亮消息中的指令 (@技能 #MCP /文件)
  const highlightInstructions = React.useCallback((text: string) => {
    let highlighted = text.replace(/@(\S+)/g, (match, name) => {
      const skill = skills.find(s => s.name === name)
      if (skill) return `\`@${name}\` `
      return match
    })
    highlighted = highlighted.replace(/#(\S+)/g, (match, name) => {
      const mcp = mcpServers.find(m => m.name === name)
      if (mcp) return `\`#${name}\` `
      return match
    })
    highlighted = highlighted.replace(/\/(\S+)/g, (_match, path) => {
      return `\`/${path}\` `
    })
    return highlighted
  }, [skills, mcpServers])

  // 存储每个 <opencode-tag> 的实际数据，key 为 msg.id:type:identifier
  const tagDataRef = React.useRef<Map<string, string>>(new Map())
  const tagMsgIdRef = React.useRef('')

  // 将哨兵标签转为 <opencode-tag> HTML 元素，数据存到 tagDataRef，标签只记录 key
  const processTags = React.useCallback((content: string): string => {
    const map = tagDataRef.current
    const msgId = msg.id || 'msg'
    // 当 msg.id 变化时清理旧数据
    if (tagMsgIdRef.current !== msgId) {
      map.clear()
      tagMsgIdRef.current = msgId
    }
    let result = content

    // 长文本 [LONG_TEXT_START]...[LONG_TEXT_END]
    result = result.replace(/\[LONG_TEXT_START\]([\s\S]*?)\[LONG_TEXT_END\]/g, (_match, text) => {
      const preview = text.substring(0, 20).replace(/[\n\r]/g, '')
      const key = `${msgId}:longtext:${preview}`
      map.set(key, text)
      const label = `📄 ${preview.substring(0, 15)}... (${text.length}字)`
      return `<opencode-tag id="${key}" title="longtext">${label}</opencode-tag>`
    })
    // 兼容旧格式 [FILE_START]...[/FILE_END]
    result = result.replace(/\[FILE_START\]([\s\S]*?)\[FILE_END\]/g, (_match, text) => {
      const preview = text.substring(0, 20).replace(/[\n\r]/g, '')
      const key = `${msgId}:longtext:${preview}`
      map.set(key, text)
      const label = `📄 ${preview.substring(0, 15)}... (${text.length}字)`
      return `<opencode-tag id="${key}" title="longtext">${label}</opencode-tag>`
    })
    // 技能 [SKILL_START]...[SKILL_END]
    result = result.replace(/\[SKILL_START\]([\s\S]*?)\[SKILL_END\]/g, (_match, content) => {
      let name = content.trim()
      const parts = content.split('|')
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].trim() === 'SKILL' && i + 1 < parts.length) { name = parts[i + 1].trim(); break }
      }
      if (name === content.trim() && parts.length > 1) name = parts[parts.length - 1].trim()
      const key = `${msgId}:skill:${name}`
      map.set(key, name)
      return `<opencode-tag id="${key}" title="skill">@${name}</opencode-tag>`
    })
    // 兼容旧格式 [SKILL:name]
    result = result.replace(/\[SKILL:([^\]]+)\]/g, (_match, name) => {
      const key = `${msgId}:skill:${name}`
      map.set(key, name)
      return `<opencode-tag id="${key}" title="skill">@${name}</opencode-tag>`
    })
    // MCP [MCP_START]...[MCP_END]
    result = result.replace(/\[MCP_START\]([\s\S]*?)\[MCP_END\]/g, (_match, content) => {
      let name = content.trim()
      const parts = content.split('|')
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].trim() === 'MCP' && i + 1 < parts.length) { name = parts[i + 1].trim(); break }
      }
      if (name === content.trim() && parts.length > 1) name = parts[parts.length - 1].trim()
      const key = `${msgId}:mcp:${name}`
      map.set(key, name)
      return `<opencode-tag id="${key}" title="mcp">#${name}</opencode-tag>`
    })
    // 兼容旧格式 [MCP:name]
    result = result.replace(/\[MCP:([^\]]+)\]/g, (_match, name) => {
      const key = `${msgId}:mcp:${name}`
      map.set(key, name)
      return `<opencode-tag id="${key}" title="mcp">#${name}</opencode-tag>`
    })
    // 文件 [FILE_START]...[FILE_END]
    result = result.replace(/\[FILE_START\]([\s\S]*?)\[FILE_END\]/g, (_match, value) => {
      const fileName = value.split('|')[0]?.trim() || '文件'
      const key = `${msgId}:file:${fileName}`
      map.set(key, value.trim())
      return `<opencode-tag id="${key}" title="file">📄 ${fileName}</opencode-tag>`
    })
    // 兼容旧格式 [FILE:...]
    result = result.replace(/\[FILE:([^\]]+)\]/g, (_match, value) => {
      const fileName = value.split('|')[0] || '文件'
      const key = `${msgId}:file:${fileName}`
      map.set(key, value)
      return `<opencode-tag id="${key}" title="file">📄 ${fileName}</opencode-tag>`
    })
    // 图片 [IMAGE_START]...[IMAGE_END]
    result = result.replace(/\[IMAGE_START\]([\s\S]*?)\[IMAGE_END\]/g, (_match, value) => {
      const fileName = value.split('|')[0]?.trim() || '图片'
      const key = `${msgId}:image:${fileName}`
      map.set(key, value.trim())
      return `<opencode-tag id="${key}" title="image">🖼️ ${fileName}</opencode-tag>`
    })
    // 兼容旧格式 [IMAGE:...]
    result = result.replace(/\[IMAGE:([^\]]+)\]/g, (_match, value) => {
      const fileName = value.split('|')[0] || '图片'
      const key = `${msgId}:image:${fileName}`
      map.set(key, value)
      return `<opencode-tag id="${key}" title="image">🖼️ ${fileName}</opencode-tag>`
    })
    return result
  }, [msg.id])

  // 合并处理：高亮指令 + 标签转换
  const processContent = React.useCallback((content: string): string => {
    return processTags(content)
  }, [processTags])

  // XMarkdown components 映射：将 <opencode-tag> 渲染为可点击的 React 组件
  const OpenCodeTag: React.FC<ComponentProps> = (props) => {
    const optype = (props as any).title || ''
    const opkey = (props as any).id || ''

    const handleClick = React.useCallback(async () => {
      if (!optype || !opkey) return
      const raw = tagDataRef.current.get(opkey)
      if (!raw) return
      if (optype === 'longtext') {
        ;(window as any).showLongTextModal?.(btoa(encodeURIComponent(raw)))
      } else if (optype === 'skill') {
        ;(window as any).showSkillInfoModal?.(raw, 'skill')
      } else if (optype === 'mcp') {
        ;(window as any).showSkillInfoModal?.(raw, 'mcp')
      } else if ((optype === 'file' || optype === 'image') && sessionId) {
        const tagSegments = raw.split('|')
        const tagFileName = tagSegments[0] || ''
        const tagTruncatedData = tagSegments.slice(2).join('|')
        try {
          const resp = await kotlinApi.getMessage(sessionId, msg.id)
          if (resp.data?.parts) {
            const filePart = resp.data.parts.find((p: any) => {
              if (p.type !== 'file') return false
              if (p.filename !== tagFileName) return false
              if (tagTruncatedData && p.url) {
                const base64Match = p.url.match(/^data:[^;]+;base64,(.+)$/)
                if (base64Match && !base64Match[1].startsWith(tagTruncatedData)) {
                  return false
                }
              }
              return true
            })
            if (filePart?.url) {
              const isImage = (filePart.mime || '').startsWith('image/')
              if (isImage || optype === 'image') {
                ;(window as any).showImagePreviewModal?.(filePart.url, tagFileName)
              } else {
                ;(window as any).showFileInfoModal?.(filePart.url, tagFileName)
              }
              return
            }
          }
        } catch (e) {
          console.error('获取消息详情失败:', e)
        }
        // API查找不到时，尝试从标签内嵌数据直接解析
        if (optype === 'image') {
          ;(window as any).showImagePreviewModal?.(raw, tagFileName)
        } else {
          // 对file类型也检查是否为图片，显示图片预览
          const mimeType = tagSegments[1] || ''
          if (mimeType.startsWith('image/') && tagSegments.slice(2).join('|')) {
            ;(window as any).showImagePreviewModal?.(raw, tagFileName)
          } else {
            ;(window as any).showFileInfoModal?.(raw, tagFileName)
          }
        }
      }
    }, [optype, opkey, sessionId, msg.id])

    const isSkill = optype === 'skill'
    const isMcp = optype === 'mcp'

    return (
      <span
        className="long-text-tag"
        onClick={handleClick}
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 4,
          margin: '0 2px',
          fontSize: 12,
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: isSkill ? 'var(--accent-light, rgba(22, 119, 255, 0.1))' :
                         isMcp ? 'var(--success-light, rgba(82, 196, 26, 0.1))' :
                         'var(--bg-tertiary, #f5f5f5)',
          color: isSkill ? 'var(--accent-color, #1677FF)' :
                 isMcp ? 'var(--success-color, #52C41A)' :
                 'inherit',
          border: `1px solid ${
            isSkill ? 'var(--accent-color, #1677FF)' :
            isMcp ? 'var(--success-color, #52C41A)' :
            'var(--border-color, #d9d9d9)'
          }`,
          transition: 'all 0.2s ease',
          lineHeight: 1.4,
        }}
        onMouseEnter={(e) => {
          if (isSkill || isMcp) {
            e.currentTarget.style.backgroundColor = isSkill ? 'var(--accent-color, #1677FF)' : 'var(--success-color, #52C41A)'
            e.currentTarget.style.color = 'white'
          }
        }}
        onMouseLeave={(e) => {
          if (isSkill || isMcp) {
            e.currentTarget.style.backgroundColor = isSkill ? 'var(--accent-light, rgba(22, 119, 255, 0.1))' : 'var(--success-light, rgba(82, 196, 26, 0.1))'
            e.currentTarget.style.color = isSkill ? 'var(--accent-color, #1677FF)' : 'var(--success-color, #52C41A)'
          }
        }}
      >
        {props.children}
      </span>
    )
  }

  // 展开状态管理函数（使用part.id而非index，避免SSE更新导致index变化）
  const getThoughtExpanded = (partId: string): boolean => {
    return expandedStateRef.current.thoughts[partId] ?? false
  }

  const setThoughtExpanded = (partId: string, expanded: boolean) => {
    expandedStateRef.current.thoughts[partId] = expanded
  }

  const getToolExpanded = (partId: string): boolean => {
    return expandedStateRef.current.tools[partId] ?? false
  }

  const setToolExpanded = (partId: string, expanded: boolean) => {
    expandedStateRef.current.tools[partId] = expanded
  }

  // 渲染工具标签，根据状态显示图标
  const renderToolLabel = (title: string, status?: string) => {
    let icon = null
    if (status === 'running' || status === 'pending') {
      icon = <ClockCircleOutlined style={{ marginRight: 6, color: 'var(--warning-color)', fontSize: 12, lineHeight: '20px' }} />
    } else if (status === 'success' || status === 'completed') {
      icon = <CheckCircleOutlined style={{ marginRight: 6, color: 'var(--success-color)', fontSize: 12, lineHeight: '20px' }} />
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', lineHeight: '20px', fontSize: 12, fontWeight: 500 }}>
        {icon}
        <span style={{ lineHeight: '20px' }}>{title}</span>
      </div>
    )
   }

  const contentToRender = React.useMemo(() => {
    const highlighted = msg.role === 'user' ? highlightInstructions(msg.content) : msg.content
    return processContent(highlighted)
  }, [msg.content, processContent, highlightInstructions, msg.role])

  const markdownComponents = React.useMemo(() => ({
    code: CodeBlock,
    'opencode-tag': OpenCodeTag,
  }), [])

  if (msg.status === 'loading' && !msg.content && (!msg.parts || msg.parts.length === 0)) {
    return <span style={{ color: 'var(--text-secondary)' }}>思考中...</span>
  }

  // 如果没有parts，直接显示内容（但仍然渲染 Modals 以支持点击弹窗）
  if (!msg.parts || msg.parts.length === 0) {
      const errorDiv = (msg.errorInfo && msg.errorInfo.name !== 'MessageAbortedError') ? (
        <div style={{ 
          color: 'var(--error-color)', 
          backgroundColor: 'var(--error-light)',
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-sm)',
          fontSize: '13px',
          maxWidth: '100%',
          overflow: 'auto',
          border: '1px solid var(--error-color)',
        }}>
          <strong>错误：</strong>{msg.errorInfo.data?.message || msg.errorInfo.name || '未知错误'}
        </div>
      ) : null

      return (
        <CodeBlockContext.Provider value={isDark}>
          {errorDiv}
          <XMarkdown 
            components={markdownComponents}
            content={contentToRender}
            streaming={{
              hasNextChunk: msg.role !== 'user' && msg.status === 'loading',
              enableAnimation: true,
              tail: msg.role !== 'user' && msg.status === 'loading',
            }}
            openLinksInNewTab
            escapeRawHtml={false}
            paragraphTag="div"
            style={{ maxWidth: '100%', overflow: 'auto' }}
          />
          <Modal title="详情" centered open={longTextModalVisible} onCancel={() => setLongTextModalVisible(false)} footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(longTextContent).then(() => message.success('已复制到剪贴板'))}>复制</Button>,
            <Button key="close" onClick={() => setLongTextModalVisible(false)}>关闭</Button>
          ]}>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 'calc(90vh - 120px)', overflow: 'auto', fontFamily: "'SF Mono','Fira Code','Menlo','Monaco',monospace", fontSize: '14px', padding: 'var(--spacing-md)', backgroundColor: 'var(--bg-code)', color: 'var(--text-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', lineHeight: 1.6 }}>
              {longTextContent}
            </div>
          </Modal>
          <Modal title={imagePreviewName || '图片预览'} centered open={imagePreviewVisible} onCancel={() => setImagePreviewVisible(false)} footer={[
            <Button key="download" onClick={() => { if (imagePreviewUrl) downloadFromDataUrl(imagePreviewUrl, imagePreviewName || 'image') }}>下载</Button>,
            <Button key="close" onClick={() => setImagePreviewVisible(false)}>关闭</Button>
          ]} styles={{ body: { textAlign: 'center', padding: '16px 0' } }}>
            {imagePreviewUrl ? <img src={imagePreviewUrl} alt={imagePreviewName} style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 160px)', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} /> : <div style={{ padding: '40px 0', color: 'var(--text-secondary)' }}>图片数据暂不可用</div>}
          </Modal>
          <Modal title="文件信息" centered open={fileInfoVisible} onCancel={() => setFileInfoVisible(false)} footer={[
            <Button key="download" type="primary" onClick={() => { if (fileInfoUrl) downloadFromDataUrl(fileInfoUrl, fileInfoName) }}>下载文件</Button>,
            <Button key="close" onClick={() => setFileInfoVisible(false)}>关闭</Button>
          ]}>
            <div style={{ padding: '16px 0', maxHeight: 'calc(90vh - 120px)', overflow: 'auto' }}>
              <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>文件名：</span><span style={{ fontWeight: 500 }}>{fileInfoName}</span></div>
              {fileInfoMime && <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>类型：</span><span style={{ fontWeight: 500, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{fileInfoMime}</span></div>}
              {fileInfoUrl && <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', fontSize: 12, color: 'var(--text-secondary)' }}>文件大小：{(fileInfoUrl.length * 0.75 / 1024).toFixed(1)} KB</div>}
            </div>
          </Modal>
          <Modal title={skillInfoType === 'skill' ? '技能信息' : 'MCP 服务器信息'} centered open={skillInfoVisible} onCancel={() => setSkillInfoVisible(false)} footer={[
            <Button key="close" onClick={() => setSkillInfoVisible(false)}>关闭</Button>
          ]}>
            <div style={{ padding: '16px 0', maxHeight: 'calc(90vh - 120px)', overflow: 'auto' }}>
              <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>名称：</span><span style={{ fontWeight: 500 }}>{skillInfoType === 'skill' ? '@' : '#'}{skillInfoName}</span></div>
              <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>{skillInfoType === 'skill' ? '描述：' : 'URL：'}</span><span style={{ wordBreak: 'break-all', lineHeight: 1.6 }}>{skillInfoDescription}</span></div>
            </div>
          </Modal>
        </CodeBlockContext.Provider>
      )
  }

  // 预处理：计算每个reasoning part的状态
  const partStatuses = new Map<number, { status: 'thinking' | 'completed', blink: boolean }>()
  const isPartLastAndInterrupted = new Map<number, boolean>()
  let lastValidPartIndex = -1
  if (msg.parts) {
    msg.parts.forEach((part: MessagePart, index: number) => {
      if (part.type !== 'step-start' && part.type !== 'step-finish') {
        lastValidPartIndex = index
      }
      // 设置中断标记
      if (msg.errorInfo?.name === 'MessageAbortedError' && index === lastValidPartIndex) {
        isPartLastAndInterrupted.set(index, true)
      } else {
        isPartLastAndInterrupted.set(index, false)
      }
      
      if (part.type === 'reasoning') {
        // 如果消息被中断，标记为已完成
        if (msg.errorInfo?.name === 'MessageAbortedError') {
          partStatuses.set(index, { status: 'completed', blink: false })
        } else {
          // 根据part.time?.end判断是否完成
          const isCompleted = !!part.time?.end
          partStatuses.set(index, { 
            status: isCompleted ? 'completed' : 'thinking', 
            blink: !isCompleted 
          })
        }
      }
    })
  }

  // 按数组顺序渲染每个part
  const renderedParts: JSX.Element[] = []

  msg.parts.forEach((part: MessagePart, index: number) => {
    if (part.type === 'step-start' || part.type === 'step-finish' || part.type === 'file') {
      return
    } else if (part.type === 'reasoning') {
      const status = partStatuses.get(index) || { status: 'thinking' as const, blink: true }
      const isUserMessage = msg.role === 'user'
      const isLastPartAndInterrupted = isPartLastAndInterrupted.get(index) || false

      const title = isUserMessage ? "用户消息" : 
        isLastPartAndInterrupted ? "思考中止" :
        (status.status === 'thinking' ? '思考中...' : '思考完成')
      const blink = !isUserMessage && status.blink && !isLastPartAndInterrupted
      const hasNextChunk = !isUserMessage && status.status === 'thinking' && !isLastPartAndInterrupted
      const isCompleted = status.status === 'completed' || isUserMessage || isLastPartAndInterrupted

      renderedParts.push(
        <Think 
          key={`think-${part.id || index}-${status.status}`} 
          style={{ marginBottom: 8, fontSize: '12px', maxWidth: '100%' }}
          title={title}
          loading={false}
          blink={blink}
          defaultExpanded={isCompleted ? getThoughtExpanded(part.id || `reasoning-${index}`) : true}
          onExpand={(expanded: boolean) => {
            if (isCompleted) {
              setThoughtExpanded(part.id || `reasoning-${index}`, expanded)
            }
          }}
        >
          <div style={{ fontSize: '12px', maxWidth: '100%', overflow: 'auto' }}>
            <XMarkdown 
              components={markdownComponents}
              content={processContent(part.content)}
              streaming={{
                hasNextChunk,
                enableAnimation: true,
                tail: hasNextChunk,
              }}
              openLinksInNewTab
              paragraphTag="div"
            />
          </div>
        </Think>
      )

    } else if (part.type === 'tool') {
      if (!part.tool) return;

      const toolContent = part.state?.output || part.state?.metadata?.output || part.state?.metadata?.preview || ''

      if (part.tool === 'read') {
        const filePath = part.state?.input?.filePath || ''
        const fileContent = part.state?.metadata?.preview || ''
        const language = filePath.split('.').pop()?.toLowerCase() || 'text'
        const toolStatus = part.state?.status || 'unknown'
        const isInterrupted = isPartLastAndInterrupted.get(index) || false
        const labelText = isInterrupted ? `读取文件：${filePath}（思考中止）` : `读取文件：${filePath}`
        renderedParts.push(
          <Collapse
            key={`tool-${index}-${toolStatus}`}
            style={{ marginBottom: 6, maxWidth: '100%', overflow: 'auto', borderRadius: 2, border: '1px solid var(--border-light)' }}
            defaultActiveKey={getToolExpanded(part.id || `tool-${index}`) ? [`tool-${part.id || index}`] : []}
            onChange={(keys) => setToolExpanded(part.id || `tool-${index}`, keys.includes(`tool-${part.id || index}`))}
            items={[{
              key: `tool-${part.id || index}`,
              label: renderToolLabel(labelText, toolStatus),
              children: (
                <div style={{ maxWidth: '100%', overflow: 'auto' }}>
                  <CodeBlock className={`language-${language}`}>{fileContent}</CodeBlock>
                </div>
              )
            }]}
          />
        )

      } else if (part.tool === 'bash') {
        const command = part.state?.input?.command || ''
        const description = part.state?.input?.description || ''
        const toolStatus = part.state?.status || 'unknown'
        const title = description ? `执行Bash：${description}` : `执行Bash：${command}`
        const formattedContent = `**执行命令**: \`${command}\`\n\n\`\`\`bash\n${toolContent}\n\`\`\``
        const isInterrupted = isPartLastAndInterrupted.get(index) || false
        const finalTitle = isInterrupted ? `${title}（思考中止）` : title
        renderedParts.push(
          <Collapse
            key={`tool-${index}-${toolStatus}`}
            style={{ marginBottom: 6, maxWidth: '100%', overflow: 'auto', borderRadius: 2, border: '1px solid var(--border-light)' }}
            defaultActiveKey={getToolExpanded(part.id || `tool-${index}`) ? [`tool-${index}`] : []}
            onChange={(keys) => setToolExpanded(part.id || `tool-${index}`, keys.includes(`tool-${part.id || index}`))}
            items={[{
              key: `tool-${part.id || index}`,
              label: renderToolLabel(finalTitle, toolStatus),
              children: (
                <div style={{ maxWidth: '100%', overflow: 'auto', wordWrap: 'break-word', wordBreak: 'break-word' }}>
                  <XMarkdown components={markdownComponents} content={formattedContent} openLinksInNewTab style={{ maxWidth: '100%', overflow: 'auto' }} />
                </div>
              )
            }]}
          />
        )

      } else if (part.tool === 'edit' && part.state?.metadata?.filediff) {
        const filediff = part.state.metadata.filediff
        const fileInput = part.state.input
        const additions = filediff.additions || 0
        const deletions = filediff.deletions || 0
        const changeSummary = additions > 0 || deletions > 0 ? `（新增${additions}行，删除${deletions}行）` : ''
        const title = `修改文件：${filediff.file}${changeSummary}`
        const toolStatus = part.state?.status || 'unknown'
        const isInterrupted = isPartLastAndInterrupted.get(index) || false
        const finalTitle = isInterrupted ? `${title}（思考中止）` : title
        renderedParts.push(
          <Collapse
            key={`tool-${index}-${toolStatus}`}
            style={{ marginBottom: 6, maxWidth: '100%', overflow: 'auto', borderRadius: 2, border: '1px solid var(--border-light)' }}
            defaultActiveKey={getToolExpanded(part.id || `tool-${index}`) ? [`tool-${index}`] : []}
            onChange={(keys) => setToolExpanded(part.id || `tool-${index}`, keys.includes(`tool-${part.id || index}`))}
            items={[{
              key: `tool-${part.id || index}`,
              label: renderToolLabel(finalTitle, toolStatus),
              children: (
                <div style={{ maxWidth: '100%', overflow: 'auto' }}>
                  <DiffViewer filePath={filediff.file} before={fileInput?.oldString || ''} after={fileInput?.newString || ''} isDark={isDark} />
                </div>
              )
            }]}
          />
        )

      } else if (part.tool === 'task') {
        const subagentType = part.state?.input?.subagent_type || '未知类型'
        const description = part.state?.input?.description || '无描述'
        const sessionId = part.state?.metadata?.sessionId
        const isCompleted = part.state?.status === 'completed'
        const StatusIcon = isCompleted ? CheckCircleOutlined : ClockCircleOutlined
        const statusColor = isCompleted ? 'var(--success-color)' : 'var(--warning-color)'
        const handleGoToSubsession = () => {
          if (sessionId && onGoToSession) onGoToSession(sessionId)
          else if (sessionId) console.log('跳转到子会话:', sessionId)
        }
        const isInterrupted = isPartLastAndInterrupted.get(index) || false
        const finalDescription = isInterrupted ? `${description}（思考中止）` : description
        renderedParts.push(
          <div key={`tool-${index}`} style={{ marginBottom: 6, padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: 2, border: '1px solid var(--border-light)', maxWidth: '100%', overflow: 'auto', wordWrap: 'break-word', wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusIcon style={{ color: statusColor, fontSize: 14 }} />
              <div>
                <span style={{ fontWeight: 500, fontSize: 12 }}>{subagentType} 智能体：</span>
                <span style={{ color: 'var(--accent-color)', cursor: sessionId ? 'pointer' : 'default', textDecoration: sessionId ? 'underline' : 'none' }} onClick={handleGoToSubsession}>
                  {finalDescription}
                </span>
                {sessionId && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>(点击跳转)</span>}
              </div>
            </div>
          </div>
        )

      } else {
        const toolStatus = part.state?.status || 'unknown'
        const title = `工具：${part.tool}`
        const inputJson = part.state?.input ? JSON.stringify(part.state.input, null, 2) : '无输入'
        const output = part.state?.output || part.state?.metadata?.output || toolContent || '无输出'
        let formattedContent = ''
        if (inputJson !== '无输入') formattedContent += `**输入**:\n\`\`\`json\n${inputJson}\n\`\`\`\n\n`
        formattedContent += `**输出**:\n\`\`\`txt\n${output}\n\`\`\``
        const isInterrupted = isPartLastAndInterrupted.get(index) || false
        const finalTitle = isInterrupted ? `${title}（思考中止）` : title
        renderedParts.push(
          <Collapse
            key={`tool-${index}-${toolStatus}`}
            style={{ marginBottom: 6, maxWidth: '100%', overflow: 'auto', borderRadius: 2, border: '1px solid var(--border-light)' }}
            defaultActiveKey={getToolExpanded(part.id || `tool-${index}`) ? [`tool-${index}`] : []}
            onChange={(keys) => setToolExpanded(part.id || `tool-${index}`, keys.includes(`tool-${part.id || index}`))}
            items={[{
              key: `tool-${part.id || index}`,
              label: renderToolLabel(finalTitle, toolStatus),
              children: (
                <div style={{ maxWidth: '100%', overflow: 'auto', wordWrap: 'break-word', wordBreak: 'break-word' }}>
                  <XMarkdown components={markdownComponents} content={formattedContent} openLinksInNewTab style={{ maxWidth: '100%', overflow: 'auto' }} />
                </div>
              )
            }]}
          />
        )
      }

    } else if (part.type === 'text') {
      const isInterrupted = isPartLastAndInterrupted.get(index) || false
      renderedParts.push(
        <div key={`text-${index}`} style={{ maxWidth: '100%', overflow: 'auto' }}>
          {isInterrupted && (
            <div style={{
              color: 'var(--warning-color, #faad14)',
              backgroundColor: 'var(--warning-bg, rgba(250, 173, 20, 0.1))',
              padding: '4px 8px',
              borderRadius: '4px',
              marginBottom: '8px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              思考中止
            </div>
          )}
          <XMarkdown
            components={markdownComponents}
            content={processContent(part.content)}
            streaming={{
              hasNextChunk: false,
              enableAnimation: true,
              tail: false,
            }}
            openLinksInNewTab
          />
        </div>
      )
    }
  })


  // 如果消息有错误信息，显示错误消息
  if (msg.errorInfo && msg.errorInfo.name !== 'MessageAbortedError') {
    const errorMessage = msg.errorInfo.data?.message || msg.errorInfo.name || '未知错误'
     renderedParts.push(
       <div key="error-message" style={{ 
         color: 'var(--error-color)', 
         backgroundColor: 'var(--error-light)',
         padding: 'var(--spacing-md)',
         borderRadius: 'var(--radius-md)',
         marginBottom: 'var(--spacing-sm)',
         fontSize: '13px',
         maxWidth: '100%',
         overflow: 'auto',
         border: '1px solid var(--error-color)',
       }}>
         <strong>错误：</strong>{errorMessage}
    </div>
      )
   }

  return (
    <div ref={containerRef}>
    <CodeBlockContext.Provider value={isDark}>
      <style>{`
        diffs-container {
          width: 100% !important;
          min-width: 0;
        }
        .long-text-tag {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          margin: 0 2px;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          transition: all 0.2s ease;
        }
      `}</style>
      {renderedParts}
      
      <Modal
        title="详情"
        centered
        open={longTextModalVisible}
        onCancel={() => setLongTextModalVisible(false)}
        footer={[
          <Button 
            key="copy" 
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(longTextContent).then(() => {
                message.success('已复制到剪贴板')
              })
            }}
          >
            复制
          </Button>,
          <Button key="close" onClick={() => setLongTextModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        <div style={{ 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word',
          maxHeight: 'calc(90vh - 120px)',
          overflow: 'auto',
          fontFamily: "'SF Mono', 'Fira Code', 'Menlo', 'Monaco', monospace",
          fontSize: '14px',
          padding: 'var(--spacing-md)',
          backgroundColor: 'var(--bg-code)',
          color: 'var(--text-code)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          lineHeight: 1.6,
        }}>
          {longTextContent}
        </div>
      </Modal>
      
      {/* 图片预览弹窗 */}
      <Modal
        title="文件信息"
        centered
        open={fileInfoVisible}
        onCancel={() => setFileInfoVisible(false)}
        footer={[
          <Button key="download" type="primary" onClick={() => { if (fileInfoUrl) downloadFromDataUrl(fileInfoUrl, fileInfoName) }}>下载文件</Button>,
          <Button key="close" onClick={() => setFileInfoVisible(false)}>关闭</Button>
        ]}
      >
        <div style={{ padding: '16px 0', maxHeight: 'calc(90vh - 120px)', overflow: 'auto' }}>
          <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>文件名：</span><span style={{ fontWeight: 500 }}>{fileInfoName}</span></div>
          {fileInfoMime && <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>类型：</span><span style={{ fontWeight: 500, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{fileInfoMime}</span></div>}
          {fileInfoUrl && <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', fontSize: 12, color: 'var(--text-secondary)' }}>文件大小：{(fileInfoUrl.length * 0.75 / 1024).toFixed(1)} KB</div>}
        </div>
      </Modal>
      
      {/* 文件信息弹窗 */}
      <Modal
        title="文件信息"
        centered
        open={fileInfoVisible}
        onCancel={() => setFileInfoVisible(false)}
        footer={[
          <Button 
            key="download" 
            type="primary"
            onClick={() => {
              if (fileInfoUrl) {
                downloadFromDataUrl(fileInfoUrl, fileInfoName)
              }
            }}
          >
            下载文件
          </Button>,
          <Button key="close" onClick={() => setFileInfoVisible(false)}>
            关闭
          </Button>
        ]}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>文件名：</span>
            <span style={{ fontWeight: 500 }}>{fileInfoName}</span>
          </div>
          {fileInfoMime && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>类型：</span>
              <span style={{ 
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: fileInfoMime.startsWith('image/') 
                  ? 'var(--accent-light, rgba(22, 119, 255, 0.1))' 
                  : 'var(--bg-tertiary, #f5f5f5)',
                color: fileInfoMime.startsWith('image/') 
                  ? 'var(--accent-color, #1677FF)' 
                  : 'var(--text-secondary)',
                fontSize: 12,
              }}>
                {fileInfoMime}
              </span>
            </div>
          )}
          {fileInfoUrl && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-md)',
              wordBreak: 'break-all',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}>
              文件大小：{(fileInfoUrl.length * 0.75 / 1024).toFixed(1)} KB (base64)
            </div>
          )}
        </div>
      </Modal>
      
      {/* Skill/MCP信息弹窗 */}
      <Modal
        title={skillInfoType === 'skill' ? '技能信息' : 'MCP 服务器信息'}
        centered
        open={skillInfoVisible}
        onCancel={() => setSkillInfoVisible(false)}
        footer={[
          <Button key="close" onClick={() => setSkillInfoVisible(false)}>关闭</Button>
        ]}
      >
        <div style={{ padding: '16px 0', maxHeight: 'calc(90vh - 120px)', overflow: 'auto' }}>
          <div style={{ marginBottom: 12 }}><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>名称：</span><span style={{ fontWeight: 500 }}>{skillInfoType === 'skill' ? '@' : '#'}{skillInfoName}</span></div>
          <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>{skillInfoType === 'skill' ? '描述：' : 'URL：'}</span><span style={{ wordBreak: 'break-all', lineHeight: 1.6 }}>{skillInfoDescription}</span></div>
        </div>
      </Modal>
    </CodeBlockContext.Provider>
    </div>
  );
}

const MemoizedMessageContent = React.memo(MessageContent)
export default MemoizedMessageContent