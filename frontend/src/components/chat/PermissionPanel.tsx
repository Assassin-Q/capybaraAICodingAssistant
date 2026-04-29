import React from 'react'
import { Button, Typography } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import type { PermissionRequest } from '../../types'

const { Text, Paragraph } = Typography

export interface PermissionPanelProps {
  permission: PermissionRequest
  onPermissionReply: (action: 'reject' | 'once' | 'always') => void
}

// 权限类型中文映射
const getPermissionLabel = (permission: string): string => {
  switch (permission) {
    case 'external_directory':
      return '需访问目录之外的文件'
    case 'file_write':
      return '需要写入文件'
    case 'file_delete':
      return '需要删除文件'
    case 'command_execute':
      return '需要执行命令'
    default:
      return permission
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
        border: '1px solid #faad14',
        backgroundColor: 'rgba(250, 173, 20, 0.1)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      {/* 标题 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: 12,
        gap: 8
      }}>
        <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 18 }} />
        <Text strong style={{ fontSize: 16 }}>需要权限</Text>
      </div>
      
      {/* 权限内容 */}
      <div style={{ 
        marginBottom: 16,
        padding: '12px',
        backgroundColor: 'rgba(250, 173, 20, 0.05)',
        borderRadius: 6,
        border: '1px solid rgba(250, 173, 20, 0.2)'
      }}>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>权限类型</Text>
          <div style={{ marginTop: 4 }}>
            <Text strong>{getPermissionLabel(permission.permission)}</Text>
          </div>
        </div>
        
        {permission.metadata?.filepath && (
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>文件路径</Text>
            <div style={{ marginTop: 4 }}>
              <Paragraph 
                copyable={{ text: permission.metadata.filepath }}
                style={{ marginBottom: 0, wordBreak: 'break-all' }}
              >
                {permission.metadata.filepath}
              </Paragraph>
            </div>
          </div>
        )}
        
        {permission.patterns && permission.patterns.length > 0 && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>匹配模式</Text>
            <div style={{ marginTop: 4 }}>
              {permission.patterns.map((pattern, index) => (
                <div key={index} style={{ 
                  padding: '4px 8px',
                  backgroundColor: 'rgba(250, 173, 20, 0.1)',
                  borderRadius: 4,
                  marginBottom: 4,
                  fontFamily: 'monospace',
                  fontSize: 12
                }}>
                  {pattern}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button 
          danger 
          onClick={() => onPermissionReply('reject')}
          style={{ minWidth: 80 }}
        >
          拒绝
        </Button>
        <Button 
          onClick={() => onPermissionReply('once')}
          style={{ minWidth: 80 }}
        >
          允许一次
        </Button>
        <Button 
          type="primary" 
          onClick={() => onPermissionReply('always')}
          style={{ minWidth: 80 }}
        >
          始终允许
        </Button>
      </div>
    </div>
  )
}

export default PermissionPanel
