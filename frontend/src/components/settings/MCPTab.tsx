import React, { useState, useEffect } from 'react'
import { Button, Table, Modal, Flex, Input, Switch, Select, Form, Space, Tabs, Radio, Collapse, message, Tag, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { MCPServer, Settings } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'


const { TextArea } = Input

interface MCPTabProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  isDark: boolean
  onServiceRestart?: () => Promise<void>
  showAddMCP: boolean
  setShowAddMCP: (value: boolean) => void
  newMCPName: string
  setNewMCPName: (value: string) => void
  newMCPConfig: string
  setNewMCPConfig: (value: string) => void
  editingMCPId: string | null
  setEditingMCPId: (id: string | null) => void
  handleAddMCP: () => Promise<void>
  fetchMCPServers: () => Promise<void>
}

interface MCPFormData {
  type: 'local' | 'remote'
  enabled: boolean
  // Local fields
  command: string[]
  environment: Array<{ key: string; value: string }>
  // Remote fields
  url: string
  headers: Array<{ key: string; value: string }>
  oauth: boolean | 'auto' | 'disabled' | 'custom'
  oauthClientId: string
  oauthClientSecret: string
  oauthScope: string
  // Common
  timeout: number
}

const MCPTab: React.FC<MCPTabProps> = ({
  settings,
  onSettingsChange,
  isDark: _isDark,
  onServiceRestart,
  showAddMCP,
  setShowAddMCP,
  newMCPName,
  setNewMCPName,
  newMCPConfig,
  setNewMCPConfig,
  editingMCPId,
  setEditingMCPId,
  handleAddMCP,
  fetchMCPServers,
}) => {
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('remote')
  const [restartLoading, setRestartLoading] = useState(false)
  const editingServer = editingMCPId ? settings.mcpServers.find(s => s.id === editingMCPId) : null
  const setEditingServer = (server: MCPServer | null) => {
    setEditingMCPId(server?.id || null)
    if (server) {
      setNewMCPName(server.name)
       // 从现有配置中提取JSON（保留完整配置）
       try {
         const config: any = {}
         // 设置type字段
         config.type = server.type || (server.url ? 'remote' : 'local')
         // 设置enabled字段
         config.enabled = server.enabled
         // 设置timeout字段
         if (server.timeout) config.timeout = server.timeout
         // 设置url字段（远程服务器）
         if (server.url) config.url = server.url
         // 设置command字段（本地服务器）
         if (server.command && server.command.length > 0) config.command = server.command
         // 设置environment字段
         if (server.environment && Object.keys(server.environment).length > 0) {
           config.environment = server.environment
         }
         // 设置headers字段
         if (server.headers && Object.keys(server.headers).length > 0) {
           config.headers = server.headers
         }
         // 设置oauth字段
         if (server.oauth !== undefined) {
           config.oauth = server.oauth
         }
         setNewMCPConfig(JSON.stringify(config, null, 2))
       } catch {
         setNewMCPConfig('{}')
       }
    } else {
      setNewMCPName('')
      setNewMCPConfig('{}')
    }
  }
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  // 初始化表单数据
  const initialFormData: MCPFormData = {
    type: 'remote',
    enabled: true,
    command: ['npx', '-y', 'my-mcp-command'],
    environment: [{ key: '', value: '' }],
    url: 'https://mcp.example.com',
    headers: [{ key: '', value: '' }],
    oauth: 'auto',
    oauthClientId: '',
    oauthClientSecret: '',
    oauthScope: '',
    timeout: 5000,
  }

  // 当显示模态框时重置表单
  useEffect(() => {
    if (showAddMCP) {
      if (editingServer) {
        // 编辑模式：解析现有配置
        try {
          const config = JSON.parse(newMCPConfig || '{}')
          form.setFieldsValue({
            type: config.type || 'remote',
            enabled: editingServer.enabled,
            command: config.command || initialFormData.command,
            environment: config.environment ? Object.entries(config.environment).map(([k, v]) => ({ key: k, value: String(v) })) : initialFormData.environment,
            url: config.url || editingServer.url,
            headers: config.headers ? Object.entries(config.headers).map(([k, v]) => ({ key: k, value: String(v) })) : initialFormData.headers,
            oauth: config.oauth === false ? 'disabled' : (config.oauth ? 'custom' : 'auto'),
            oauthClientId: config.oauth?.clientId || '',
            oauthClientSecret: config.oauth?.clientSecret || '',
            oauthScope: config.oauth?.scope || '',
            timeout: config.timeout || initialFormData.timeout,
          })
          setActiveTab(config.type === 'local' ? 'local' : 'remote')
        } catch (e) {
          // 解析失败，使用默认值
          form.setFieldsValue(initialFormData)
        }
      } else {
        // 新建模式
        form.setFieldsValue(initialFormData)
        setActiveTab('remote')
      }
    }
  }, [showAddMCP, editingServer, newMCPConfig, form])

  // 生成JSON配置
  const generateConfig = (values: any): string => {
    const baseConfig: any = {
      enabled: values.enabled,
      timeout: values.timeout,
    }

    if (values.type === 'local') {
      baseConfig.type = 'local'
      baseConfig.command = values.command.filter((c: string) => c.trim())
      if (values.environment.some((e: any) => e.key && e.value)) {
        const envObj: Record<string, string> = {}
        values.environment.forEach((e: any) => {
          if (e.key && e.value) envObj[e.key] = e.value
        })
        if (Object.keys(envObj).length > 0) {
          baseConfig.environment = envObj
        }
      }
    } else {
      baseConfig.type = 'remote'
      baseConfig.url = values.url
      if (values.headers.some((h: any) => h.key && h.value)) {
        const headersObj: Record<string, string> = {}
        values.headers.forEach((h: any) => {
          if (h.key && h.value) headersObj[h.key] = h.value
        })
        if (Object.keys(headersObj).length > 0) {
          baseConfig.headers = headersObj
        }
      }
      // OAuth配置
      if (values.oauth === 'disabled') {
        baseConfig.oauth = false
      } else if (values.oauth === 'custom') {
        baseConfig.oauth = {}
        if (values.oauthClientId) baseConfig.oauth.clientId = values.oauthClientId
        if (values.oauthClientSecret) baseConfig.oauth.clientSecret = values.oauthClientSecret
        if (values.oauthScope) baseConfig.oauth.scope = values.oauthScope
      }
      // 如果oauth为'auto'，不添加oauth字段（使用默认自动检测）
    }

    return JSON.stringify(baseConfig, null, 2)
  }

  // 从JSON解析到表单数据
  const parseJsonToForm = (jsonStr: string): MCPFormData | null => {
    try {
      const config = JSON.parse(jsonStr)
      const formData: MCPFormData = {
        type: config.type || 'remote',
        enabled: config.enabled ?? true,
        command: config.command || ['npx', '-y', 'my-mcp-command'],
        environment: config.environment 
          ? Object.entries(config.environment).map(([k, v]) => ({ key: k, value: String(v) }))
          : [{ key: '', value: '' }],
        url: config.url || '',
        headers: config.headers 
          ? Object.entries(config.headers).map(([k, v]) => ({ key: k, value: String(v) }))
          : [{ key: '', value: '' }],
        oauth: config.oauth === false ? 'disabled' : (config.oauth?.clientId ? 'custom' : 'auto'),
        oauthClientId: config.oauth?.clientId || '',
        oauthClientSecret: config.oauth?.clientSecret || '',
        oauthScope: config.oauth?.scope || '',
        timeout: config.timeout || 5000,
      }
      return formData
    } catch {
      return null
    }
  }

  // 验证MCP配置格式
  const validateMCPConfig = (jsonStr: string): { valid: boolean; error?: string } => {
    try {
      const config = JSON.parse(jsonStr)
      
      // 检查type字段
      if (!config.type || !['local', 'remote'].includes(config.type)) {
        return { valid: false, error: 'type字段必须是"local"或"remote"' }
      }
      
      // 检查local类型的必填字段
      if (config.type === 'local') {
        if (!config.command || !Array.isArray(config.command) || config.command.length === 0) {
          return { valid: false, error: 'local类型必须提供command数组' }
        }
      }
      
      // 检查remote类型的必填字段
      if (config.type === 'remote') {
        if (!config.url || typeof config.url !== 'string') {
          return { valid: false, error: 'remote类型必须提供url字符串' }
        }
      }
      
      // 检查可选字段类型
      if (config.environment && typeof config.environment !== 'object') {
        return { valid: false, error: 'environment必须是对象类型' }
      }
      if (config.headers && typeof config.headers !== 'object') {
        return { valid: false, error: 'headers必须是对象类型' }
      }
      if (config.timeout !== undefined && (typeof config.timeout !== 'number' || config.timeout < 0)) {
        return { valid: false, error: 'timeout必须是非负数字' }
      }
      if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
        return { valid: false, error: 'enabled必须是布尔类型' }
      }
      
      return { valid: true }
    } catch (e) {
      return { valid: false, error: `JSON解析失败: ${(e as Error).message}` }
    }
  }

  // 处理Tab切换（表单↔JSON双向同步）
  const handleTabChange = (key: string) => {
    const newJsonMode = key === 'json'
    
    if (newJsonMode && !jsonMode) {
      // 从表单切换到JSON：将表单数据同步到JSON
      try {
        const values = form.getFieldsValue()
        const configJson = generateConfig(values)
        setNewMCPConfig(configJson)
        setJsonError(null)
      } catch (e) {
        console.error('表单数据同步到JSON失败:', e)
      }
    } else if (!newJsonMode && jsonMode) {
      // 从JSON切换到表单：将JSON数据同步到表单
      const formData = parseJsonToForm(newMCPConfig)
      if (formData) {
        form.setFieldsValue(formData)
        setActiveTab(formData.type)
        setJsonError(null)
      } else {
        message.error('JSON格式错误，无法同步到表单')
        return // 阻止切换
      }
    }
    
    setJsonMode(newJsonMode)
  }

  // 表单提交
  const handleFormSubmit = async () => {
    try {
      // 如果是JSON模式，先验证JSON格式
      if (jsonMode) {
        const validation = validateMCPConfig(newMCPConfig)
        if (!validation.valid) {
          message.error(`配置格式错误: ${validation.error}`)
          return
        }
      }
      
      const values = await form.validateFields()
      const configJson = generateConfig(values)
      setNewMCPConfig(configJson)
      await handleAddMCP()
      setEditingServer(null)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const mcpColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
       render: (_: any, record: MCPServer) => {
         if (record.type === 'local') return '本地'
         if (record.type === 'remote') return '远程'
         // 兼容旧数据：根据字段推断
         if (record.command && record.command.length > 0) return '本地'
         if (record.url) return '远程'
         return '未知'
       },
    },
    {
      title: 'URL/命令',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
        render: (url: string, record: MCPServer) => {
         if (record.type === 'local' && record.command && record.command.length > 0) {
           return record.command.join(' ')
         }
         return url || '-'
       },
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: MCPServer) => (
        <Switch
          checked={enabled}
          onChange={checked => {
            const newServers = settings.mcpServers.map(s =>
              s.id === record.id ? { ...s, enabled: checked } : s
            )
            onSettingsChange({ ...settings, mcpServers: newServers })
          }}
        />
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: MCPServer) => {
        const status = record.status || 'unknown'
        const statusMap: Record<string, { color: string; text: string }> = {
          'connected': { color: 'green', text: '已连接' },
          'disconnected': { color: 'default', text: '未连接' },
          'error': { color: 'red', text: '错误' },
          'unknown': { color: 'default', text: '未知' },
        }
        const statusInfo = statusMap[status] || statusMap['unknown']
        return (
          <Tooltip title={record.error}>
            <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: MCPServer) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
             onClick={() => {
               setEditingServer(record)
               setShowAddMCP(true)
             }}
          />
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              const newServers = settings.mcpServers.filter(s => s.id !== record.id)
              onSettingsChange({ ...settings, mcpServers: newServers })
            }}
          />
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Flex justify="space-between" style={{ marginBottom: 16 }}>
        <span style={{ color: 'var(--text-secondary)' }}>配置 MCP 服务器连接</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
          setEditingServer(null)
          setNewMCPName('')
          setNewMCPConfig('{}')
          setShowAddMCP(true)
        }}>
          添加服务器
        </Button>
      </Flex>

      <Modal
        title={editingServer ? `编辑 MCP 服务器: ${editingServer.name}` : '添加 MCP 服务器'}
        open={showAddMCP}
        centered
        mask={{ closable: false }}
        onCancel={() => { 
          setShowAddMCP(false); 
          setEditingServer(null);
          setNewMCPName(''); 
          setNewMCPConfig('') 
        }}
        footer={[
          <Button key="cancel" onClick={() => { 
            setShowAddMCP(false); 
            setEditingServer(null);
            setNewMCPName(''); 
            setNewMCPConfig('') 
          }}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleFormSubmit}>
            {editingServer ? '更新' : '保存'}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>服务器名称</div>
          <Input
            value={newMCPName}
            onChange={e => setNewMCPName(e.target.value)}
            placeholder="输入服务器名称（英文小写，使用连字符）"
          />
        </div>

        <Tabs
          activeKey={jsonMode ? 'json' : 'form'}
          onChange={handleTabChange}
          items={[
            {
              key: 'form',
              label: '表单配置',
              children: (
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={initialFormData}
                >
                  <Form.Item
                    name="type"
                    label="服务器类型"
                    rules={[{ required: true, message: '请选择服务器类型' }]}
                  >
                    <Radio.Group onChange={(e) => setActiveTab(e.target.value)}>
                      <Radio value="remote">远程服务器 (Remote)</Radio>
                      <Radio value="local">本地服务器 (Local)</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item
                    name="enabled"
                    label="启用状态"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                  </Form.Item>

                  {activeTab === 'local' ? (
                    <>
                      <Form.Item
                        name="command"
                        label="启动命令"
                        rules={[{ required: true, message: '请输入启动命令' }]}
                        extra="例如: ['npx', '-y', '@modelcontextprotocol/server-everything']"
                      >
                        <Select
                          mode="tags"
                          placeholder="输入命令和参数，按回车添加"
                          style={{ width: '100%' }}
                          tokenSeparators={[',']}
                        />
                      </Form.Item>

                      <Form.List name="environment">
                        {(fields, { add, remove }) => (
                          <div>
                            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>环境变量</div>
                              <Button type="dashed" size="small" onClick={() => add({ key: '', value: '' })}>
                                添加环境变量
                              </Button>
                            </div>
                            {fields.map(({ key, name, ...restField }) => (
                              <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                <Form.Item
                                  {...restField}
                                  name={[name, 'key']}
                                  rules={[{ required: false, message: '变量名' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="变量名" />
                                </Form.Item>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'value']}
                                  rules={[{ required: false, message: '变量值' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="变量值" />
                                </Form.Item>
                                <Button type="text" danger onClick={() => remove(name)}>
                                  删除
                                </Button>
                              </Space>
                            ))}
                          </div>
                        )}
                      </Form.List>
                    </>
                  ) : (
                    <>
                      <Form.Item
                        name="url"
                        label="服务器 URL"
                        rules={[{ required: true, message: '请输入服务器 URL' }]}
                        extra="远程 MCP 服务器的地址，例如: https://mcp.example.com"
                      >
                        <Input placeholder="https://mcp.example.com" />
                      </Form.Item>

                      <Form.List name="headers">
                        {(fields, { add, remove }) => (
                          <div>
                            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>请求头 (Headers)</div>
                              <Button type="dashed" size="small" onClick={() => add({ key: '', value: '' })}>
                                添加请求头
                              </Button>
                            </div>
                            {fields.map(({ key, name, ...restField }) => (
                              <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                <Form.Item
                                  {...restField}
                                  name={[name, 'key']}
                                  rules={[{ required: false, message: 'Header 名称' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="例如: Authorization" />
                                </Form.Item>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'value']}
                                  rules={[{ required: false, message: 'Header 值' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="例如: Bearer {env:API_KEY}" />
                                </Form.Item>
                                <Button type="text" danger onClick={() => remove(name)}>
                                  删除
                                </Button>
                              </Space>
                            ))}
                          </div>
                        )}
                      </Form.List>

                      <Form.Item
                        name="oauth"
                        label="OAuth 认证"
                        extra="OpenCode 会自动处理 OAuth 认证流程"
                      >
                        <Radio.Group>
                          <Radio value="auto">自动检测（默认）</Radio>
                          <Radio value="custom">自定义 OAuth 配置</Radio>
                          <Radio value="disabled">禁用 OAuth（使用 API 密钥）</Radio>
                        </Radio.Group>
                      </Form.Item>

                      <Collapse
                        size="small"
                        style={{ marginBottom: 16 }}
                        items={[{
                          key: 'oauth-config',
                          label: 'OAuth 配置（仅当选择"自定义 OAuth 配置"时生效）',
                          children: (
                            <>
                              <Form.Item
                                name="oauthClientId"
                                label="Client ID"
                                extra="OAuth 客户端 ID"
                              >
                                <Input placeholder="客户端 ID" />
                              </Form.Item>
                              <Form.Item
                                name="oauthClientSecret"
                                label="Client Secret"
                                extra="OAuth 客户端密钥（如果需要）"
                              >
                                <Input.Password placeholder="客户端密钥" />
                              </Form.Item>
                              <Form.Item
                                name="oauthScope"
                                label="Scope"
                                extra="请求的权限范围，例如: tools:read tools:execute"
                              >
                                <Input placeholder="scope" />
                              </Form.Item>
                            </>
                          ),
                        }]}
                      />
                    </>
                  )}

                  <Form.Item
                    name="timeout"
                    label="超时时间（毫秒）"
                    extra="从 MCP 服务器获取工具的超时时间，默认 5000（5秒）"
                  >
                    <Input type="number" min={1000} max={30000} />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'json',
              label: 'JSON 配置',
              children: (
                <div>
                  <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>配置 (JSON)</div>
                  <TextArea
                    value={newMCPConfig}
                    onChange={e => {
                      const value = e.target.value
                      setNewMCPConfig(value)
                      // 实时校验JSON格式
                      if (value.trim()) {
                        const validation = validateMCPConfig(value)
                        setJsonError(validation.valid ? null : validation.error || null)
                      } else {
                        setJsonError(null)
                      }
                    }}
                    placeholder='{"type": "remote", "url": "https://mcp.example.com"}'
                    rows={12}
                    status={jsonError ? 'error' : undefined}
                  />
                  {jsonError && (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--error-color)' }}>
                      {jsonError}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    提示：切换到表单模式可以自动将JSON配置映射到表单字段
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Modal>

      <Table
        dataSource={settings.mcpServers}
        columns={mcpColumns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
      />

      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        // backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        fontSize: 12
      }}>
        <Flex justify="space-between" align="center">
          <div style={{ color: 'var(--text-secondary)' }}>
            ⚠️ 添加、修改、删除 MCP 服务器后需要重启服务才能生效
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
                // 刷新MCP服务器列表
                await fetchMCPServers()
                // 通知父组件刷新数据
                if (onServiceRestart) {
                  await onServiceRestart()
                }
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

export default MCPTab