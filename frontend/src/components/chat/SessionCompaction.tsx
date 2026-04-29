import React from 'react'
import { Divider } from 'antd'
import type { Message } from '../../types'
import { isSessionCompactionMessage, getCompactionLabel } from '../../utils/messageUtils'

interface SessionCompactionProps {
  message: Message
}

const SessionCompaction: React.FC<SessionCompactionProps> = ({ message }) => {
  if (!isSessionCompactionMessage(message)) {
    return null
  }

  const label = getCompactionLabel(message)

  return (
    <Divider 
      key={message.id} 
      style={{ 
        fontSize: 12, 
        color: 'var(--text-secondary)', 
        margin: '8px 12px' 
      }} 
      dashed
    >
      {label}
    </Divider>
  )
}

export default SessionCompaction