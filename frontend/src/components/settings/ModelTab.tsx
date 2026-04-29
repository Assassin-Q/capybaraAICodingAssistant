import React, { useState } from 'react'
import { Alert, Button, Table, Modal, Space, Flex, Input, Select, Checkbox, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { Provider } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'

interface ModelTabProps {
  error: string | null
  setError: (error: string | null) => void
  providers: Provider[]
  allProviders: Provider[]
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
        <span style={{ color: 'var(--text-primary)' }}>模型配置</span>
        <Space>
          <Button
            type="default"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowAddModel(true)}
          >
            添加模型密钥
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowAddCustomModel(true)}
          >
            添加自定义模型
          </Button>
        </Space>
      </Flex>

      <Modal
        title={isEditingModel ? "编辑模型密钥" : "添加新模型"}
        open={showAddModel}
        centered
        maskClosable={false}
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
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleAddModel} disabled={!selectedProvider || !apiKey}>
            {isEditingModel ? '更新' : '保存'}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            {isEditingModel ? '模型厂商' : '选择模型厂商'}
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
              placeholder="选择厂商"
              showSearch
              getPopupContainer={() => document.body}
              popupMatchSelectWidth={false}
              filterOption={(input, option) => 
                (option?.searchText || '').toLowerCase().includes(input.toLowerCase())
              }
              options={allProviders
                .filter(p => !p.isConnected) // 过滤掉已连接的厂商
                .map(p => {
                  return {
                    label: (
                      <Space>
                        {p.name}
                      </Space>
                    ),
                    value: p.id,
                    searchText: p.name,
                  }
                })}
            />
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>API Key</div>
          <Input.Password
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="输入 API Key"
          />
        </div>
       </Modal>

      {/* 自定义模型弹窗 */}
      <Modal
        title="添加自定义模型"
        open={showAddCustomModel}
        centered
        maskClosable={false}
        onCancel={() => { setShowAddCustomModel(false); resetCustomModelForm() }}
        footer={[
          <Button key="cancel" onClick={() => { setShowAddCustomModel(false); resetCustomModelForm() }}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleAddCustomModel}>
            保存
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>提供商名称</div>
          <Input
            value={customProviderName}
            onChange={e => setCustomProviderName(e.target.value)}
            placeholder="例如：My OpenAI"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
            供应商 ID
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>只支持小写字母、数字、连字符或下划线</span>
          </div>
          <Input
            value={customProviderId}
            onChange={e => setCustomProviderId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="自动生成或输入自定义ID"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>基础 URL</div>
          <Input
            value={customBaseUrl}
            onChange={e => setCustomBaseUrl(e.target.value)}
            placeholder="例如：https://api.mysqopenai.com/v1"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>API Key（可选）</div>
          <Input.Password
            value={customApiKey}
            onChange={e => setCustomApiKey(e.target.value)}
            placeholder="输入 API Key（如无需认证可留空）"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>模型列表</div>
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addModelRow}>
              添加模型
            </Button>
          </Flex>
          {customModels.map((model, index) => (
            <div key={index} style={{ 
              marginBottom: 16, 
              padding: 12, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 6,
              border: '1px solid var(--border-color)'
            }}>
              <Space style={{ display: 'flex', marginBottom: 8 }}>
                <Input
                  placeholder="模型 ID（如 gpt-4）"
                  value={model.id}
                  onChange={e => updateModelField(index, 'id', e.target.value)}
                  style={{ flex: 1 }}
                />
                <Input
                  placeholder="显示名称（如 GPT-4）"
                  value={model.name}
                  onChange={e => updateModelField(index, 'name', e.target.value)}
                  style={{ flex: 1 }}
                />
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
                <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)' }}>模型能力配置</div>
                <Space wrap>
                  <Checkbox
                    checked={model.options.reasoning}
                    onChange={e => updateModelOptions(index, { ...model.options, reasoning: e.target.checked })}
                  >
                    支持推理
                  </Checkbox>
                  <Checkbox
                    checked={model.options.toolcall}
                    onChange={e => updateModelOptions(index, { ...model.options, toolcall: e.target.checked })}
                  >
                    支持工具调用
                  </Checkbox>
                </Space>
                
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>输入模态</div>
                <Checkbox.Group
                  value={model.options.modalities}
                  onChange={values => {
                    // 如果选择了图片、视频、PDF等非文本模态，自动设置attachment为true
                    const hasNonTextModality = values.some(v => v !== 'text')
                    updateModelOptions(index, { 
                      ...model.options, 
                      modalities: values,
                      attachment: hasNonTextModality
                    })
                  }}
                  options={[
                    { label: '文本', value: 'text' },
                    { label: '图片', value: 'image' },
                    { label: '音频', value: 'audio' },
                    { label: '视频', value: 'video' },
                    { label: 'PDF', value: 'pdf' }
                  ]}
                />
                
                {model.options.reasoning && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                    支持推理（推理强度由OpenCode自动管理）
                  </div>
                )}
                
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>上下文大小</span>
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
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>请求头（可选）</div>
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addHeaderRow}>
              添加请求头
            </Button>
          </Flex>
          {customHeaders.map((header, index) => (
            <Space key={index} style={{ display: 'flex', marginBottom: 8 }}>
              <Input
                placeholder="Header 名称"
                value={header.name}
                onChange={e => updateHeaderField(index, 'name', e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                placeholder="Header 值"
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
            { title: '厂商名称', dataIndex: 'name', key: 'name' },
            {
              title: '模型数量',
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
              title: '操作',
              key: 'action',
              render: (_, record) => (
                <Space size="small">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    disabled={record.id === 'opencode'}
                    onClick={() => handleEditProvider(record)}
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
          backgroundColor: 'var(--bg-secondary)', 
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          fontSize: 12
        }}>
          <Flex justify="space-between" align="center">
            <div style={{ color: 'var(--text-secondary)' }}>
              ⚠️ 修改模型配置后需要重启服务才能生效
            </div>
            <Button 
              type="primary" 
              size="small"
              loading={restartLoading}
              onClick={async () => {
                setRestartLoading(true)
                try {
                  await kotlinApi.restartService()
                  message.success('服务重启成功')
                } catch (error) {
                  console.error('重启服务失败:', error)
                  message.error(`重启服务失败: ${(error as Error).message}`)
                } finally {
                  setRestartLoading(false)
                }
              }}
            >
              重启服务
            </Button>
          </Flex>
        </div>
    </div>
  )
}

export default ModelTab