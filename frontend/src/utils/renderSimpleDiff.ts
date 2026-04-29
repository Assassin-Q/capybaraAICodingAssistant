import { diffLines, diffWords, type Change } from 'diff'

export interface DiffTheme {
  diffBg: string
  addedBg: string
  removedBg: string
  textColor: string
  addedColor: string
  removedColor: string
  lineNumColor: string
  splitBorder: string
}

const lightTheme: DiffTheme = {
  diffBg: '#ffffff',
  addedBg: '#e6ffec',
  removedBg: '#ffebe9',
  textColor: '#1f2328',
  addedColor: '#1a7f37',
  removedColor: '#cf222e',
  lineNumColor: '#6e7681',
  splitBorder: '#d0d7de',
}

const darkTheme: DiffTheme = {
  diffBg: '#0d1117',
  addedBg: '#1a3a2a',
  removedBg: '#3a1a1a',
  textColor: '#e6edf3',
  addedColor: '#3fb950',
  removedColor: '#f85149',
  lineNumColor: '#8b949e',
  splitBorder: '#30363d',
}

export function getDiffTheme(isDark: boolean): DiffTheme {
  return isDark ? darkTheme : lightTheme
}

interface DiffRow {
  type: 'unchanged' | 'added' | 'removed' | 'changed'
  leftNum: number
  rightNum: number
  leftContent: string
  rightContent: string
  leftChanges?: Change[]
  rightChanges?: Change[]
}

export function computeDiff(before: string, after: string): DiffRow[] {
  const changes = diffLines(before, after)
  const rows: DiffRow[] = []
  let leftNum = 0
  let rightNum = 0

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, '').split('\n')
    if (change.added && change.removed) {
      for (const text of lines) {
        leftNum++
        rightNum++
        rows.push({ type: 'changed', leftNum, rightNum, leftContent: text, rightContent: text })
      }
    } else if (change.added) {
      for (const text of lines) {
        rightNum++
        const leftIdx = rows.length - 1
        if (leftIdx >= 0 && rows[leftIdx].type === 'removed' && rows[leftIdx].rightNum === 0) {
          rows[leftIdx].rightNum = rightNum
          rows[leftIdx].rightContent = text
          rows[leftIdx].type = 'changed'
          const words = diffWords(rows[leftIdx].leftContent, text)
          rows[leftIdx].leftChanges = words.filter(w => w.removed)
          rows[leftIdx].rightChanges = words.filter(w => w.added)
        } else {
          rows.push({ type: 'added', leftNum: 0, rightNum, leftContent: '', rightContent: text })
        }
      }
    } else if (change.removed) {
      for (const text of lines) {
        leftNum++
        rows.push({ type: 'removed', leftNum, rightNum: 0, leftContent: text, rightContent: '' })
      }
    } else {
      for (const text of lines) {
        leftNum++
        rightNum++
        rows.push({ type: 'unchanged', leftNum, rightNum, leftContent: text, rightContent: text })
      }
    }
  }
  return rows
}

function hightlightText(text: string, changes: Change[] | undefined, theme: DiffTheme, _added: boolean): string {
  if (!changes || changes.length === 0) return escapeHtml(text)
  let result = ''
  let pos = 0
  for (const ch of changes) {
    if (ch.added || ch.removed) {
      const idx = text.indexOf(ch.value, pos)
      if (idx < 0) continue
      if (idx > pos) result += escapeHtml(text.slice(pos, idx))
      const isAdd = ch.added
      result += `<span style="background:${isAdd ? theme.addedBg : theme.removedBg};text-decoration:underline;text-decoration-color:${isAdd ? theme.addedColor : theme.removedColor}">${escapeHtml(ch.value)}</span>`
      pos = idx + ch.value.length
    }
  }
  if (pos < text.length) result += escapeHtml(text.slice(pos))
  return result
}

function renderCell(num: number, content: string, bg: string, color: string, theme: DiffTheme, isChanged: boolean, changes: Change[] | undefined, added: boolean): string {
  const numBg = bg === 'transparent' ? theme.diffBg : bg
  const numColor = theme.lineNumColor
  let displayContent = escapeHtml(content)
  if (isChanged && changes) {
    displayContent = hightlightText(content, changes, theme, added)
  }
  return `<td style="width:4ch;text-align:right;padding:0 1ch;user-select:none;background:${numBg};color:${numColor};font-size:12px">${num || ''}</td>` +
    `<td style="padding:0 1ch;white-space:pre;min-width:1ch;background:${bg};color:${color}">${isChanged ? '' : ' '}${displayContent}</td>`
}

export function renderSimpleDiff(rows: DiffRow[], theme: DiffTheme, _isDark: boolean): string {
  let html = '<table style="width:100%;border-collapse:collapse;font-family:Menlo,Monaco,\'Courier New\',monospace;font-size:13px;line-height:1.5">'
  for (const row of rows) {
    if (row.type === 'unchanged') {
      html += '<tr>' +
        renderCell(row.leftNum, row.leftContent, 'transparent', theme.textColor, theme, false, undefined, false) +
        renderCell(row.rightNum, row.rightContent, 'transparent', theme.textColor, theme, false, undefined, false) +
        '</tr>'
    } else if (row.type === 'removed') {
      html += '<tr>' +
        renderCell(row.leftNum, row.leftContent, theme.removedBg, theme.removedColor, theme, true, row.leftChanges, false) +
        renderCell(0, '', 'transparent', theme.textColor, theme, false, undefined, false) +
        '</tr>'
    } else if (row.type === 'added') {
      html += '<tr>' +
        renderCell(0, '', 'transparent', theme.textColor, theme, false, undefined, false) +
        renderCell(row.rightNum, row.rightContent, theme.addedBg, theme.addedColor, theme, true, row.rightChanges, true) +
        '</tr>'
    } else if (row.type === 'changed') {
      html += '<tr>' +
        renderCell(row.leftNum, row.leftContent, theme.removedBg, theme.removedColor, theme, true, row.leftChanges, false) +
        renderCell(row.rightNum, row.rightContent, theme.addedBg, theme.addedColor, theme, true, row.rightChanges, true) +
        '</tr>'
    }
  }
  html += '</table>'
  return html
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
