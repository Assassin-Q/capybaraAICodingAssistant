import React from 'react'
import { Button, Input } from 'antd'
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

  const totalQuestions = currentQuestion.questions.length

  return (
    <div
      style={{
        marginBottom: 8,
        border: '1px solid var(--border-color)',
        borderRadius: 2,
        padding: 10,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: 'var(--accent-color)',
      }} />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingLeft: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent-color)',
            fontSize: 10,
            fontWeight: 600,
          }}>
            ?
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-color)' }}>
            需要您确认 ({currentQuestionIndex + 1}/{totalQuestions})
          </span>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-color)',
            animation: 'pulse-dot 2s infinite',
          }} />
        </div>

        {totalQuestions > 1 && (
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              onClick={onPrevQuestion}
              disabled={currentQuestionIndex === 0}
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: currentQuestionIndex === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              ‹
            </button>
            <button
              onClick={onNextQuestion}
              disabled={currentQuestionIndex === totalQuestions - 1}
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: currentQuestionIndex === totalQuestions - 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                cursor: currentQuestionIndex === totalQuestions - 1 ? 'not-allowed' : 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {currentQuestion.questions.map((q: any, idx: number) => (
        <div
          key={idx}
          style={{
            display: idx === currentQuestionIndex ? 'block' : 'none',
            paddingLeft: 8,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
            {q.header || `问题 ${idx + 1}`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
            {q.question}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {q.options && q.options.map((opt: any, optIdx: number) => {
              const isChecked = selectedAnswers[idx] && selectedAnswers[idx].includes(opt.label)
              return (
                <div
                  key={optIdx}
                  onClick={() => onAnswerChange(idx, opt.label, !isChecked)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 2,
                    border: isChecked ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                    backgroundColor: isChecked ? 'var(--accent-light)' : 'var(--bg-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: isChecked ? 'none' : '1px solid var(--border-color)',
                    backgroundColor: isChecked ? 'var(--accent-color)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isChecked && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#fff' }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: isChecked ? 'var(--accent-color)' : 'var(--text-primary)',
                    fontWeight: isChecked ? 500 : 400,
                  }}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      {opt.description}
                    </span>
                  )}
                </div>
              )
            })}

            <div
              onClick={() => {
                const isChecked = selectedAnswers[idx] && selectedAnswers[idx].includes('__custom__')
                onAnswerChange(idx, '__custom__', !isChecked)
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 2,
                border: selectedAnswers[idx]?.includes('__custom__') ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: selectedAnswers[idx]?.includes('__custom__') ? 'var(--accent-light)' : 'var(--bg-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: selectedAnswers[idx]?.includes('__custom__') ? 'none' : '1px solid var(--border-color)',
                backgroundColor: selectedAnswers[idx]?.includes('__custom__') ? 'var(--accent-color)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {selectedAnswers[idx]?.includes('__custom__') && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#fff' }} />
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>自定义回答</span>
            </div>

            {selectedAnswers[idx]?.includes('__custom__') && (
              <div style={{ padding: '4px 0' }}>
                <Input
                  size="small"
                  placeholder="请输入您的回答..."
                  value={customAnswers[idx] || ''}
                  onChange={(e) => onCustomAnswerChange(idx, e.target.value)}
                  style={{ borderRadius: 2, fontSize: 12 }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
            <Button
              size="small"
              onClick={onQuestionReject}
              style={{ borderRadius: 2, fontSize: 11 }}
            >
              忽略
            </Button>
            {totalQuestions > 1 && currentQuestionIndex < totalQuestions - 1 ? (
              <Button
                size="small"
                type="primary"
                onClick={onNextQuestion}
                style={{ borderRadius: 2, fontSize: 11 }}
              >
                下一步
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                onClick={onQuestionReply}
                style={{ borderRadius: 2, fontSize: 11 }}
              >
                提交
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default QuestionPanel
