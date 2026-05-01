import React, { useState } from 'react'
import { useLocale } from '../../locales/LocaleContext'
import { Alert, Button, Table, Modal, Space, Flex, Input, Select, Checkbox, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { Provider } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'

interface ModelTabProps {
  error: string | null
  setError: (error: string | null) => void
  providers: Provider[]
  allProviders: Provider[]
  systemProviders: any[]
  showAddModel: boolean
  setShowAddModel: React.Dispatch<React.SetStateAction<boolean>>
  selectedProvider: string
  setSelectedProvider: React.Dispatch<React.SetStateAction<string>>
  apiKey: string
  setApiKey: React.Dispatch<React.SetStateAction<string>>
  editingProvider: Provider | null
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider | null>>
  isEditingModel: boolean
  setIsEditingModel: React.Dispatch<React.SetStateAction<boolean>>
  showAddCustomModel: boolean
  setShowAddCustomModel: React.Dispatch<React.SetStateAction<boolean>>
  customProviderName: string
  setCustomProviderName: React.Dispatch<React.SetStateAction<string>>
  customProviderId: string
  setCustomProviderId: React.Dispatch<React.SetStateAction<string>>
  customBaseUrl: string
  setCustomBaseUrl: React.Dispatch<React.SetStateAction<string>>
  customApiKey: string
  setCustomApiKey: React.Dispatch<React.SetStateAction<string>>
  customNpm: string
  setCustomNpm: React.Dispatch<React.SetStateAction<string>>
  customModels: Array<{
    id: string
    name: string
    options: {
      reasoning: boolean
      modalities: string[]
      attachment: boolean
      toolcall: boolean
      contextSize: number
    }
  }>
  customHeaders: Array<{name: string, value: string}>
  handleAddModel: () => Promise<void>
  handleEditProvider: (provider: Provider) => void
  handleDeleteProvider: (providerId: string) => void
  handleAddCustomModel: () => Promise<void>
  resetCustomModelForm: () => void
  addModelRow: () => void
  removeModelRow: (index: number) => void
  updateModelField: (index: number, field: 'id' | 'name', value: string) => void
  updateModelOptions: (index: number, options: any) => void
  addHeaderRow: () => void
  removeHeaderRow: (index: number) => void
  updateHeaderField: (index: number, field: 'name' | 'value', value: string) => void
}

const ModelTab: React.FC<ModelTabProps> = ({
  error,
  setError,
  providers,
  allProviders,
  systemProviders,
  showAddModel,
  setShowAddModel,
  selectedProvider,
  setSelectedProvider,
  apiKey,
  setApiKey,
  editingProvider,
  setEditingProvider,
  isEditingModel,
  setIsEditingModel,
  showAddCustomModel,
  setShowAddCustomModel,
  customProviderName,
  setCustomProviderName,
  customProviderId,
  setCustomProviderId,
  customBaseUrl,
  setCustomBaseUrl,
  customApiKey,
  setCustomApiKey,
  customNpm,
  setCustomNpm,
  customModels,
  customHeaders,
  handleAddModel,
  handleEditProvider,
  handleDeleteProvider,
  handleAddCustomModel,
  resetCustomModelForm,
  addModelRow,
  removeModelRow,
  updateModelField,
  updateModelOptions,
  addHeaderRow,
  removeHeaderRow,
  updateHeaderField,
}) => {
  const [restartLoading, setRestartLoading] = useState(false)
  const { t } = useLocale()
  
  return (
    <div>
      {error && (
        <Alert
          message={error}
          type="error"
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}
      
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <span style={{ color: 'var(--text-primary)' }}>{t('model.title')}</span>
        <Space>
          <Button
            type="default"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowAddModel(true)}
          >
            {t('model.addKey')}
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowAddCustomModel(true)}
          >
            {t('model.addCustom')}
          </Button>
        </Space>
      </Flex>

      <Modal
        title={isEditingModel ? t('model.editModelTitle') : t('model.addModelTitle')}
        open={showAddModel}
        centered
        mask={{ closable: false }}
        onCancel={() => { 
          setShowAddModel(false); 
          setIsEditingModel(false);
          setEditingProvider(null);
          setSelectedProvider(''); 
          setApiKey('') 
        }}
        footer={[
          <Button key="cancel" onClick={() => { 
            setShowAddModel(false); 
            setIsEditingModel(false);
            setEditingProvider(null);
            setSelectedProvider(''); 
            setApiKey('') 
          }}>
            {t('common.cancel')}
          </Button>,
          <Button key="save" type="primary" onClick={handleAddModel} disabled={!selectedProvider || !apiKey}>
            {isEditingModel ? t('common.update') : t('common.save')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {isEditingModel ? t('model.vendorName') : t('model.selectVendor')}
          </div>
          {isEditingModel && editingProvider ? (
            <Input
              value={editingProvider.name}
              readOnly
              style={{ width: '100%' }}
            />
          ) : (
            <Select
              value={selectedProvider}
              onChange={setSelectedProvider}
              style={{ width: '100%' }}
              placeholder={t('model.selectProvider')}
              showSearch
              getPopupContainer={() => document.body}
              popupMatchSelectWidth={false}
              filterOption={(input, option) => 
                (option?.searchText || '').toLowerCase().includes(input.toLowerCase())
              }
              options={(systemProviders.length > 0 ? systemProviders : allProviders)
                .filter((p: any) => !allProviders.some(ap => ap.id === p.id))
                .filter((p: any) => p.id !== 'opencode')
                .map((p: any) => ({
                  label: `${p.name} (${p.id})`,
                  value: p.id,
                  searchText: `${p.name} ${p.id}`,
                }))
              }
            />
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('model.apiKey')}</div>
          <Input.Password
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={t('model.saveKey')}
          />
        </div>
       </Modal>

      {/* 自定义模型弹窗 */}
      <Modal
        title={t('model.addCustomTitle')}
        open={showAddCustomModel}
        centered
        mask={{ closable: false }}
        onCancel={() => { setShowAddCustomModel(false); resetCustomModelForm() }}
        footer={[
          <Button key="cancel" onClick={() => { setShowAddCustomModel(false); resetCustomModelForm() }}>
            {t('common.cancel')}
          </Button>,
          <Button key="save" type="primary" onClick={handleAddCustomModel}>
            {t('common.save')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('model.providerName')}
            <span style={{ color: 'var(--error-color, #ff4d4f)', marginLeft: 2 }}>*</span>
          </div>
          <Input
            value={customProviderName}
            onChange={e => setCustomProviderName(e.target.value)}
            placeholder={t('model.customProviderNamePlaceholder')}
            status={!customProviderName ? undefined : undefined}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('model.providerId')}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{t('model.providerIdHint')}</span>
          </div>
          <Input
            value={customProviderId}
            onChange={e => setCustomProviderId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="自动生成或输入自定义ID"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('model.baseUrl')}
            <span style={{ color: 'var(--error-color, #ff4d4f)', marginLeft: 2 }}>*</span>
          </div>
          <Input
            value={customBaseUrl}
            onChange={e => setCustomBaseUrl(e.target.value)}
            placeholder={t('model.customBaseUrlPlaceholder')}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('model.apiKeyOptional')}</div>
          <Input.Password
            value={customApiKey}
            onChange={e => setCustomApiKey(e.target.value)}
            placeholder="输入 API Key（如无需认证可留空）"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('model.apiFormat')}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{t('model.apiFormatHint')}</span>
          </div>
          <Select
            value={customNpm}
            onChange={setCustomNpm}
            style={{ width: '100%' }}
            options={[
              { label: t('model.openaiFormat'), value: '@ai-sdk/openai-compatible' },
              { label: t('model.anthropicFormat'), value: '@ai-sdk/anthropic' },
            ]}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('model.modelList')}</div>
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addModelRow}>
              {t('model.addModel')}
            </Button>
          </Flex>
          {customModels.map((model, index) => (
            <div key={index} style={{ 
              marginBottom: 16, 
              padding: 12, 
              borderRadius: 6,
              border: '1px solid var(--border-color)'
            }}>
              <Space style={{ display: 'flex', marginBottom: 8 }} wrap>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {t('model.modelId')}
                    <span style={{ color: 'var(--error-color, #ff4d4f)', marginLeft: 2 }}>*</span>
                  </div>
                  <Input
                    placeholder={t('model.modelIdPlaceholder')}
                    value={model.id}
                    onChange={e => updateModelField(index, 'id', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {t('model.modelName')}
                    <span style={{ color: 'var(--error-color, #ff4d4f)', marginLeft: 2 }}>*</span>
                  </div>
                  <Input
                    placeholder={t('model.modelNamePlaceholder')}
                    value={model.name}
                    onChange={e => updateModelField(index, 'name', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                {customModels.length > 1 && (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeModelRow(index)}
                  />
                )}
              </Space>
              
              {/* 模型选项配置 */}
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{t('model.capabilityConfig')}</div>
                <Space wrap>
                  <Checkbox
                    checked={model.options.reasoning}
                    onChange={e => updateModelOptions(index, { ...model.options, reasoning: e.target.checked })}
                  >
                    {t('model.supportReasoning')}
                  </Checkbox>
                  <Checkbox
                    checked={model.options.toolcall}
                    onChange={e => updateModelOptions(index, { ...model.options, toolcall: e.target.checked })}
                  >
                    {t('model.supportToolCall')}
                  </Checkbox>
                </Space>
                
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{t('model.inputModality')}</div>
                <Checkbox.Group
                  value={model.options.modalities}
                  onChange={values => {
                    const hasNonTextModality = values.some(v => v !== 'text')
                    updateModelOptions(index, { 
                      ...model.options, 
                      modalities: values,
                      attachment: hasNonTextModality
                    })
                  }}
                  options={[
                    { label: t('chat.text'), value: 'text' },
                    { label: t('chat.image'), value: 'image' },
                    { label: t('chat.audio'), value: 'audio' },
                    { label: t('chat.video'), value: 'video' },
                    { label: 'PDF', value: 'pdf' }
                  ]}
                />
                
                {model.options.reasoning && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {t('model.reasoningHint')}
                  </div>
                )}
                
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('model.contextSize')}</span>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={model.options.contextSize}
                    onChange={e => updateModelOptions(index, { ...model.options, contextSize: parseInt(e.target.value) || 0 })}
                    style={{ width: 120 }}
                    size="small"
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>tokens</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('model.customHeaders')}</div>
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addHeaderRow}>
              {t('model.addHeader')}
            </Button>
          </Flex>
          {customHeaders.map((header, index) => (
            <Space key={index} style={{ display: 'flex', marginBottom: 8 }}>
              <Input
                placeholder={t('model.headerName')}
                value={header.name}
                onChange={e => updateHeaderField(index, 'name', e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                placeholder={t('model.headerValue')}
                value={header.value}
                onChange={e => updateHeaderField(index, 'value', e.target.value)}
                style={{ flex: 1 }}
              />
              {customHeaders.length > 1 && (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeHeaderRow(index)}
                />
              )}
            </Space>
          ))}
        </div>
      </Modal>

        <Table
         dataSource={providers}
         columns={[
            { title: t('model.vendorName'), dataIndex: 'name', key: 'name' },
            {
              title: t('model.modelCount'),
              key: 'modelCount',
              render: (_, record) => {
                const fullProvider = allProviders.find(p => p.id === record.id)
                if (fullProvider?.models && typeof fullProvider.models === 'object') {
                  return Object.keys(fullProvider.models).length
                }
                return 0
              },
            },
            {
              title: t('model.actions'),
              key: 'action',
              render: (_, record) => (
                <Space size="small">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    disabled={record.id === 'opencode'}
                    onClick={() => handleEditProvider(record)}
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={record.id === 'opencode'}
                    onClick={() => handleDeleteProvider(record.id)}
                  />
                </Space>
              ),
            },
          ]}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
        />
        
        {/* 重启服务按钮 */}
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          fontSize: 12
        }}>
          <Flex justify="space-between" align="center">
            <div style={{ color: 'var(--text-secondary)' }}>
              ⚠️ {t('model.restartHint')}
            </div>
            <Button 
              type="primary" 
              size="small"
              loading={restartLoading}
              onClick={async () => {
                setRestartLoading(true)
                try {
                  await kotlinApi.restartService()
                  message.success(t('model.restartSuccess'))
                } catch (error) {
                  console.error('Restart failed:', error)
                  message.error(t('model.restartFailed') + (error as Error).message)
                } finally {
                  setRestartLoading(false)
                }
              }}
            >
              {t('common.restart')}
            </Button>
          </Flex>
        </div>
    </div>
  )
}

export default ModelTab
