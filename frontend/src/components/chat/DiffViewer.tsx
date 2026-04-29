import React from 'react'
import { Modal, Button, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { parseDiffFromFile } from '@pierre/diffs'
import { FileDiff, UnresolvedFile } from '@pierre/diffs/react'
import { buildConflictText } from '../../utils/buildConflictText'

const DiffViewer: React.FC<{
  filePath: string
  before: string
  after: string
  isDark: boolean
}> = ({ filePath, before, after, isDark }) => {
  const fileDiff = React.useMemo(() => {
    try {
      return parseDiffFromFile(
        { name: filePath, contents: before || '' },
        { name: filePath, contents: after || '' }
      )
    } catch {
      return null
    }
  }, [filePath, before, after])

  const [mergeModalOpen, setMergeModalOpen] = React.useState(false)
  const [mergeResetKey, setMergeResetKey] = React.useState(0)

  const mergeFile = React.useMemo(() => {
    const lang = filePath.split('.').pop() || 'text'
    const content = buildConflictText(before, after, {
      conflictPrefix: 'Original',
      conflictSuffix: 'Modified',
    })
    return { name: filePath, contents: content, lang }
  }, [filePath, before, after])

  const buttonTheme = isDark
    ? { bg: '#21262d', border: '#30363d', color: '#8b949e', accent: '#58a6ff' }
    : { bg: '#f6f8fa', border: '#d0d7de', color: '#656d76', accent: '#0969da' }

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 2,
    padding: '2px 6px', fontSize: 11, cursor: 'pointer',
    border: `1px solid ${buttonTheme.border}`,
    borderRadius: 4, backgroundColor: buttonTheme.bg,
    color: buttonTheme.color, opacity: 0.7,
  }

  const unsafeCSS = React.useMemo(() => {
    if (isDark) {
      return `
:host {
  --diffs-bg: #0d1117;
  --diffs-bg-context: #161b22;
  --diffs-bg-hover: #1c2128;
  --diffs-bg-separator: #21262d;
  --diffs-fg: #e6edf3;
  --diffs-fg-number: #8b949e;
  --diffs-bg-addition: #1a3a2a;
  --diffs-bg-addition-number: #1a3a2a;
  --diffs-bg-deletion: #3a1a1a;
  --diffs-bg-deletion-number: #3a1a1a;
  --diffs-addition-base: #3fb950;
  --diffs-deletion-base: #f85149;
  --diffs-modified-base: #58a6ff;
  --diffs-light-bg: #0d1117;
  --diffs-dark-bg: #0d1117;
  --diffs-light: #e6edf3;
  --diffs-dark: #e6edf3;
  --diffs-added-light: #3fb950;
  --diffs-added-dark: #3fb950;
  --diffs-deleted-light: #f85149;
  --diffs-deleted-dark: #f85149;
  --diffs-modified-light: #58a6ff;
  --diffs-modified-dark: #58a6ff;
  --diffs-font-size: 13px;
  --diffs-line-height: 20px;
  --diffs-gap-block: 0;
  --diffs-gap-inline: 0;
  --diffs-bg-addition-emphasis: #1a3a2a;
  --diffs-bg-deletion-emphasis: #3a1a1a;
  --diffs-bg-buffer: #161b22;
}
[data-background] [data-line-type="change-deletion"] {
  --diffs-line-bg: #3a1a1a;
}
[data-background] [data-line-type="change-deletion"] [data-column-number] {
  background-color: #3a1a1a;
}
[data-background] [data-line-type="change-addition"] {
  --diffs-line-bg: #1a3a2a;
}
[data-background] [data-line-type="change-addition"] [data-column-number] {
  background-color: #1a3a2a;
}`
    }
    return `
:host {
  --diffs-bg: #ffffff;
  --diffs-bg-context: #f6f8fa;
  --diffs-bg-hover: #f3f4f6;
  --diffs-bg-separator: #e8eaed;
  --diffs-fg: #1f2328;
  --diffs-fg-number: #656d76;
  --diffs-bg-addition: #e6ffec;
  --diffs-bg-addition-number: #e6ffec;
  --diffs-bg-deletion: #ffebe9;
  --diffs-bg-deletion-number: #ffebe9;
  --diffs-addition-base: #1a7f37;
  --diffs-deletion-base: #cf222e;
  --diffs-modified-base: #0969da;
  --diffs-light-bg: #ffffff;
  --diffs-dark-bg: #ffffff;
  --diffs-light: #1f2328;
  --diffs-dark: #1f2328;
  --diffs-added-light: #1a7f37;
  --diffs-added-dark: #1a7f37;
  --diffs-deleted-light: #cf222e;
  --diffs-deleted-dark: #cf222e;
  --diffs-modified-light: #0969da;
  --diffs-modified-dark: #0969da;
  --diffs-font-size: 13px;
  --diffs-line-height: 20px;
  --diffs-gap-block: 0;
  --diffs-gap-inline: 0;
  --diffs-bg-addition-emphasis: #e6ffec;
  --diffs-bg-deletion-emphasis: #ffebe9;
  --diffs-bg-buffer: #f6f8fa;
}
[data-background] [data-line-type="change-deletion"] {
  --diffs-line-bg: #ffebe9;
}
[data-background] [data-line-type="change-deletion"] [data-column-number] {
  background-color: #ffebe9;
}
[data-background] [data-line-type="change-addition"] {
  --diffs-line-bg: #e6ffec;
}
[data-background] [data-line-type="change-addition"] [data-column-number] {
  background-color: #e6ffec;
}`
  }, [isDark])

  return (
    <div style={{
      position: 'relative', width: '100%', maxHeight: '500px', overflow: 'auto',
      borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
    }}>
      {fileDiff && (
        <FileDiff
          fileDiff={fileDiff}
          disableWorkerPool
          options={{
            theme: isDark ? 'pierre-dark' : 'pierre-light',
            diffStyle: 'split',
            lineHoverHighlight: 'disabled',
            enableLineSelection: false,
            hunkSeparators: 'simple',
            unsafeCSS,
          } as any}
        />
      )}
      <div style={{ position: 'absolute', top: 44, right: 8, display: 'flex', gap: 4, zIndex: 10 }}>
        <button onClick={() => navigator.clipboard.writeText(before).then(() => message.success('已复制原始代码'))}
          title="复制原始代码" style={btnBase}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = buttonTheme.accent; e.currentTarget.style.color = buttonTheme.accent }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = buttonTheme.border; e.currentTarget.style.color = buttonTheme.color }}>
          <CopyOutlined style={{ fontSize: 11 }} />
          <span>原始</span>
        </button>
        <button onClick={() => navigator.clipboard.writeText(after).then(() => message.success('已复制修改后代码'))}
          title="复制修改后代码" style={btnBase}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = buttonTheme.accent; e.currentTarget.style.color = buttonTheme.accent }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = buttonTheme.border; e.currentTarget.style.color = buttonTheme.color }}>
          <CopyOutlined style={{ fontSize: 11 }} />
          <span>修改后</span>
        </button>
        <button onClick={() => setMergeModalOpen(true)}
          title="合并代码"
          style={{ ...btnBase, borderColor: buttonTheme.accent, color: buttonTheme.accent }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}>
          <span>合并</span>
        </button>
      </div>
      <Modal
        title="合并代码 - 点击 Current(原始) / Incoming(修改后) 解决冲突"
        centered
        open={mergeModalOpen}
        onCancel={() => setMergeModalOpen(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            navigator.clipboard.writeText(after).then(() => message.success('已复制到剪贴板'))
          }}>复制</Button>,
          <Button key="reset" onClick={() => {
            setMergeModalOpen(false)
            setMergeResetKey(k => k + 1)
            setTimeout(() => setMergeModalOpen(true), 50)
          }}>重置</Button>,
          <Button key="close" onClick={() => setMergeModalOpen(false)}>关闭</Button>
        ]}
      >
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <UnresolvedFile
            key={mergeResetKey}
            file={mergeFile}
            disableWorkerPool
            options={{
              theme: isDark ? 'pierre-dark' : 'pierre-light',
              lineHoverHighlight: 'disabled',
              enableLineSelection: false,
              unsafeCSS,
            } as any}
          />
        </div>
      </Modal>
    </div>
  )
}

export default React.memo(DiffViewer)
