import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Select, Typography, Spin, Tag, Input, Button, message } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { LANGUAGE_OPTIONS, detectLanguage, translateText, setSiliconFlowKey } from '../../utils/translate'
import { kotlinApi } from '../../utils/kotlinApi'

const { Text } = Typography

interface TranslationModalProps {
  open: boolean
  text: string
  onClose: () => void
}

const TranslationModal: React.FC<TranslationModalProps> = ({ open, text, onClose }) => {
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('zh-CN')
  const [translated, setTranslated] = useState('')
  const [loading, setLoading] = useState(false)
  const [detectedLang, setDetectedLang] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [savingApiKey, setSavingApiKey] = useState(false)

  // 初始化：检测源语言，设置目标语言为中文，加载硅基流动API Key
  useEffect(() => {
    if (!open || !text) return

    const init = async () => {
      setTargetLang('zh-CN')
      setSourceLang('auto')
      setTranslated('')
      setDetectedLang('')
      setLoading(true)
      
      // 从 auth.json 加载硅基流动的 API Key
      try {
        const authResponse = await kotlinApi.getModelAuth('siliconflow')
        if (authResponse.data?.apiKey) {
          setApiKey(authResponse.data.apiKey)
          setSiliconFlowKey(authResponse.data.apiKey)
        }
      } catch { /* ignore */ }

      const detected = await detectLanguage(text.slice(0, 500))

      // 如果检测到是中文，则目标语言切换为英文
      const defaultTarget = detected === 'zh-CN' || detected === 'zh-TW' ? 'en' : 'zh-CN'
      setTargetLang(defaultTarget)
      setDetectedLang(detected)
      setSourceLang(detected)

      const result = await translateText(text, detected, defaultTarget)
      setTranslated(result)
      setLoading(false)
    }

    init()
  }, [open, text])

  const handleTranslate = useCallback(async (from: string, to: string) => {
    if (!text.trim()) return
    setLoading(true)
    const result = await translateText(text, from, to)
    setTranslated(result)
    setLoading(false)
  }, [text])

  const handleSourceChange = (value: string) => {
    const newSource = value === 'auto' ? detectedLang || 'en' : value
    setSourceLang(value)
    if (targetLang) {
      handleTranslate(newSource, targetLang)
    }
  }

  const handleTargetChange = (value: string) => {
    setTargetLang(value)
    if (sourceLang) {
      const from = sourceLang === 'auto' ? detectedLang || 'en' : sourceLang
      handleTranslate(from, value)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      message.warning('请输入 API Key')
      return
    }
    setSavingApiKey(true)
    try {
      // 保存到 auth.json
      await kotlinApi.saveModelAuth('siliconflow', apiKey.trim())
      // 设置到翻译工具
      setSiliconFlowKey(apiKey.trim())
      message.success('API Key 保存成功！使用模型: Qwen/Qwen2.5-7B-Instruct（目前免费）')
      setShowApiConfig(false)
    } catch (error) {
      message.error('保存失败')
    } finally {
      setSavingApiKey(false)
    }
  }

  return (
    <Modal
      title="翻译"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnHidden
      styles={{ body: { maxHeight: '90vh', minHeight: '35vh', overflow: 'auto' } }}
    >
      {/* API Key 配置 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="link" size="small" icon={<SettingOutlined />} onClick={() => setShowApiConfig(!showApiConfig)}>
          {showApiConfig ? '收起设置' : '配置翻译API'}
        </Button>
      </div>
      {showApiConfig && (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            硅基流动 API Key（使用模型: <strong>Qwen/Qwen2.5-7B-Instruct</strong>）
            <a href="https://cloud.siliconflow.cn/me/account/ak" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', marginLeft: 4 }}>
              获取
            </a>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input.Password
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="输入 SiliconFlow API Key"
              style={{ flex: 1 }}
              size="small"
            />
            <Button size="small" type="primary" loading={savingApiKey} onClick={handleSaveApiKey}>
              保存
            </Button>
          </div>
        </div>
      )}

      {/* 语言选择 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select
          value={sourceLang}
          onChange={handleSourceChange}
          options={LANGUAGE_OPTIONS.map(l => ({ value: l.code, label: l.name }))}
          style={{ width: 160 }}
          size="small"
        />
        <span style={{ color: 'var(--text-secondary)' }}>→</span>
        <Select
          value={targetLang}
          onChange={handleTargetChange}
          options={LANGUAGE_OPTIONS.filter(l => l.code !== 'auto').map(l => ({ value: l.code, label: l.name }))}
          style={{ width: 160 }}
          size="small"
        />
        {detectedLang && sourceLang === 'auto' && (
          <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
            检测为: {LANGUAGE_OPTIONS.find(l => l.code === detectedLang)?.name || detectedLang}
          </Tag>
        )}
      </div>

      {/* 左右排列的原文/译文 */}
      <div style={{ display: 'flex', gap: 16, minHeight: 200 }}>
        {/* 原文 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text strong style={{ fontSize: 13 }}>原文</Text>
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              maxHeight: 320,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid var(--border-color)',
            }}
          >
            {text}
          </div>
        </div>

        {/* 译文 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text strong style={{ fontSize: 13 }}>译文</Text>
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              maxHeight: 320,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid var(--border-color)',
              minHeight: 48,
              position: 'relative',
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
                <Spin size="small" />
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>翻译中...</span>
              </div>
            ) : (
              translated
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default TranslationModal
