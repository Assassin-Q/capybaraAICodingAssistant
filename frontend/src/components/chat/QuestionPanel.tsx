import React from 'react'
import { Button, Input, Radio, Typography } from 'antd'
import type { QuestionRequest } from '../../types'

interface QuestionPanelProps {
  currentQuestion: QuestionRequest | null
  currentQuestionIndex: number
  selectedAnswers: string[][]
  customAnswers: string[]
  currentSessionId: string | null
  onAnswerChange: (questionIndex: number, answer: string, checked: boolean) => void
  onCustomAnswerChange: (questionIndex: number, value: string) => void
  onQuestionReject: () => void
  onPrevQuestion: () => void
  onNextQuestion: () => void
  onQuestionReply: () => void
}

const QuestionPanel: React.FC<QuestionPanelProps> = ({
  currentQuestion,
  currentQuestionIndex,
  selectedAnswers,
  customAnswers,
  currentSessionId,
  onAnswerChange,
  onCustomAnswerChange,
  onQuestionReject,
  onPrevQuestion,
  onNextQuestion,
  onQuestionReply,
}) => {
  if (!currentQuestion || currentQuestion.sessionID !== currentSessionId) {
    return null
  }

  return (
    <div
      style={{
        marginBottom: 8,
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 4,
        padding: 12,
      }}
    >
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        问题请求 ({currentQuestionIndex + 1}/{currentQuestion.questions.length})
      </Typography.Text>
      
      {currentQuestion.questions.map((q: any, idx: number) => (
        <div 
          key={idx} 
          style={{ 
            display: idx === currentQuestionIndex ? 'block' : 'none',
            marginBottom: 12 
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <p><strong>{q.header || `问题 ${idx + 1}`}</strong></p>
            <p>{q.question}</p>
          </div>
          
          <div style={{ marginBottom: 12 }}>
            {/* AI返回的4个选项 */}
            {q.options && q.options.map((opt: any, optIdx: number) => (
               <div key={optIdx} style={{ marginBottom: 4 }}>
                   <Radio
                     checked={selectedAnswers[idx] && selectedAnswers[idx].includes(opt.label)}
                     onChange={(e) => onAnswerChange(idx, opt.label, e.target.checked)}
                   >
                     <span style={{ fontWeight: 'normal' }}>{opt.label}</span>
                     {opt.description && (
                       <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>
                         {opt.description}
                       </span>
                     )}
                   </Radio>
               </div>
            ))}
            
            {/* 用户自定义输入框（第5个选项） */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                自定义回答（可选）
              </div>
              <Input
                placeholder="输入您的自定义回答..."
                value={customAnswers[idx] || ''}
                onChange={(e) => onCustomAnswerChange(idx, e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      ))}
      
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {/* 忽略按钮（拒绝回答） */}
        <Button danger onClick={onQuestionReject}>
          忽略
        </Button>
        
        {/* 导航按钮 */}
        {currentQuestion.questions.length > 1 && currentQuestionIndex > 0 && (
          <Button onClick={onPrevQuestion}>
            返回
          </Button>
        )}
        
        {currentQuestion.questions.length > 1 && currentQuestionIndex < currentQuestion.questions.length - 1 ? (
          <Button type="primary" onClick={onNextQuestion}>
            下一步
          </Button>
        ) : (
          <Button type="primary" onClick={onQuestionReply}>
            提交
          </Button>
        )}
      </div>
    </div>
  )
}

export default QuestionPanel