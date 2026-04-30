import React from 'react'
import { Button, Typography } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import type { PermissionRequest } from '../../types'

const { Text } = Typography

export interface PermissionPanelProps {
  permission: PermissionRequest
  onPermissionReply: (action: 'reject' | 'once' | 'always') => void
}

const getPermissionLabel = (permission: string): string => {
  switch (permission) {
    case 'external_directory': return '需访问目录之外的文件'
    case 'file_write': return '需要写入文件'
    case 'file_delete': return '需要删除文件'
    case 'command_execute': return '需要执行命令'
    default: return permission
  }
}

const PermissionPanel: React.FC<PermissionPanelProps> = ({
  permission,
  onPermissionReply
}) => {
  return (
    <div
      style={{
        marginBottom: 8,
        border: '1px solid var(--warning-color)',
        borderRadius: 2,
        padding: 10,
        backgroundColor: 'var(--warning-light)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 80,
        height: 80,
        backgroundColor: 'rgba(252, 196, 25, 0.08)',
        borderRadius: '50%',
        filter: 'blur(24px)',
        transform: 'translate(50%, -50%)',
      }} />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 10,
        gap: 6,
        position: 'relative',
        zIndex: 1,
      }}>
        <ExclamationCircleOutlined style={{ color: 'var(--warning-color)', fontSize: 15 }} />
        <Text strong style={{ fontSize: 13, color: 'var(--warning-color)' }}>需要权限</Text>
      </div>

      <div style={{
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 56, flexShrink: 0, marginTop: 2 }}>
            权限类型
          </span>
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: 500,
            color: 'var(--text-primary)',
            padding: '1px 6px',
            borderRadius: 2,
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
          }}>
            {getPermissionLabel(permission.permission)}
          </span>
        </div>

        {permission.metadata?.filepath && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 56, flexShrink: 0, marginTop: 2 }}>
              文件路径
            </span>
            <span style={{
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              padding: '1px 6px',
              borderRadius: 2,
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-primary)',
              wordBreak: 'break-all',
              flex: 1,
              minWidth: 0,
            }}>
              {permission.metadata.filepath}
            </span>
          </div>
        )}

        {permission.patterns && permission.patterns.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 56, flexShrink: 0, marginTop: 2 }}>
              匹配模式
            </span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {permission.patterns.map((pattern, index) => (
                <span key={index} style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: 'var(--text-primary)',
                  padding: '1px 6px',
                  borderRadius: 2,
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary)',
                  wordBreak: 'break-all',
                }}>
                  {pattern}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
        <Button
          size="small"
          onClick={() => onPermissionReply('reject')}
          style={{ borderRadius: 2, fontSize: 11, color: 'var(--error-color)', borderColor: 'var(--error-color)' }}
        >
          拒绝
        </Button>
        <Button
          size="small"
          onClick={() => onPermissionReply('once')}
          style={{ borderRadius: 2, fontSize: 11 }}
        >
          允许一次
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => onPermissionReply('always')}
          style={{ borderRadius: 2, fontSize: 11 }}
        >
          始终允许
        </Button>
      </div>
    </div>
  )
}

export default PermissionPanel
