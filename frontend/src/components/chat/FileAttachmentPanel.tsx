import React from 'react'
import { Attachments } from '@ant-design/x'
import { PlusOutlined } from '@ant-design/icons'

interface FileAttachmentPanelProps {
  attachments: any[]
  onChange: (info: any) => void
  onFilePaste?: (files: FileList) => void
}

const FileAttachmentPanel: React.FC<FileAttachmentPanelProps> = ({ attachments, onChange, onFilePaste }) => {
  if (attachments.length === 0) {
    return null
  }

  const handleBeforeUpload = (file: File) => {
    if (onFilePaste) {
      const dt = new DataTransfer()
      dt.items.add(file)
      onFilePaste(dt.files)
    }
    return false
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <Attachments
        items={attachments}
        onChange={onChange}
        beforeUpload={handleBeforeUpload}
        placeholder={{
          icon: <PlusOutlined style={{ fontSize: 24, color: 'var(--text-secondary)' }} />,
          title: '添加文件',
        }}
        style={{ marginBottom: 8 }}
      />
    </div>
  )
}

export default FileAttachmentPanel
