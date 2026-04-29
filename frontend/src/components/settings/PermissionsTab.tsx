import React, { useState, useEffect } from 'react'
import { Input, Select, Button, Space, Typography, message, Collapse, Flex } from 'antd'
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, SaveOutlined } from '@ant-design/icons'
import type { PermissionCategory, PermissionRule, Settings } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'

const { Text } = Typography
const { Option } = Select

// 权限类别列表（根据OpenCode文档）
const PERMISSION_CATEGORIES = [
  { key: 'read', label: '读取文件' },
  { key: 'edit', label: '编辑文件' },
  { key: 'glob', label: '文件通配' },
  { key: 'grep', label: '内容搜索' },
  { key: 'list', label: '列出目录' },
  { key: 'bash', label: 'Shell命令' },
  { key: 'task', label: '子代理' },
  { key: 'skill', label: '加载技能' },
  { key: 'lsp', label: 'LSP查询' },
  { key: 'webfetch', label: '获取URL' },
  { key: 'websearch', label: '网页搜索' },
  { key: 'codesearch', label: '代码搜索' },
  { key: 'external_directory', label: '外部目录' },
  { key: 'doom_loop', label: '循环检测' },
]

interface RuleItemProps {
  categoryKey: string
  rule: PermissionRule
  index: number
  totalRules: number
  onRuleChange: (categoryKey: string, index: number, field: keyof PermissionRule, value: string) => void
  onRemoveRule: (categoryKey: string, index: number) => void
  onMoveRule: (categoryKey: string, index: number, direction: 'up' | 'down') => void
}

const RuleItem: React.FC<RuleItemProps> = ({ 
  categoryKey,
  rule, 
  index, 
  totalRules, 
  onRuleChange, 
  onRemoveRule,
  onMoveRule 
}) => {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 8,
      padding: '8px 12px',
      background: 'var(--bg-tertiary)',
      borderRadius: '6px',
      marginBottom: 8,
    }}>
      <Space size="small">
        <Button
          type="text"
          icon={<UpOutlined />}
          onClick={() => onMoveRule(categoryKey, index, 'up')}
          disabled={index === 0}
          size="small"
          style={{ color: 'var(--text-secondary)' }}
        />
        <Button
          type="text"
          icon={<DownOutlined />}
          onClick={() => onMoveRule(categoryKey, index, 'down')}
          disabled={index === totalRules - 1}
          size="small"
          style={{ color: 'var(--text-secondary)' }}
        />
      </Space>
      <Input
        value={rule.pattern}
        onChange={e => onRuleChange(categoryKey, index, 'pattern', e.target.value)}
        placeholder="规则模式（例如：*.js, /home/user/*）"
        style={{ flex: 1 }}
      />
      <Select
        value={rule.level}
        onChange={value => onRuleChange(categoryKey, index, 'level', value)}
        style={{ width: 120 }}
      >
        <Option value="allow">允许</Option>
        <Option value="ask">询问</Option>
        <Option value="deny">拒绝</Option>
      </Select>
      <Button
        type="text"
        icon={<DeleteOutlined />}
        onClick={() => onRemoveRule(categoryKey, index)}
        style={{ color: 'var(--error-color)' }}
      />
    </div>
  )
}

interface PermissionsTabProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  onServiceRestart?: () => Promise<void>
}

const PermissionsTab: React.FC<PermissionsTabProps> = ({
  settings,
  onSettingsChange,
  onServiceRestart,
}) => {
  const [permissionCategories, setPermissionCategories] = useState<PermissionCategory[]>(() => {
    // 初始化权限类别，如果settings中没有则使用默认值
    if (settings.permissions && settings.permissions.length > 0) {
      return settings.permissions
    }
    // 为每个类别创建默认规则
    return PERMISSION_CATEGORIES.map(cat => ({
      category: cat.key,
      rules: [{ pattern: '*', level: 'allow' as const }]
    }))
  })
  const [saving, setSaving] = useState(false)
  const [restartLoading, setRestartLoading] = useState(false)

  // 当权限类别变化时更新settings
  useEffect(() => {
    onSettingsChange({
      ...settings,
      permissions: permissionCategories,
    })
  }, [permissionCategories])



  const handleAddRule = (categoryKey: string) => {
    const currentCategory = permissionCategories.find(cat => cat.category === categoryKey)
    if (!currentCategory) return
    
    const newRules = [...currentCategory.rules, { pattern: '', level: 'ask' as const }]
    
    setPermissionCategories(prev =>
      prev.map(cat =>
        cat.category === categoryKey ? { ...cat, rules: newRules } : cat
      )
    )
  }

  const handleRemoveRule = (categoryKey: string, index: number) => {
    const currentCategory = permissionCategories.find(cat => cat.category === categoryKey)
    if (!currentCategory) return
    
    const newRules = currentCategory.rules.filter((_, i) => i !== index)
    
    setPermissionCategories(prev =>
      prev.map(cat =>
        cat.category === categoryKey ? { ...cat, rules: newRules } : cat
      )
    )
  }

  const handleRuleChange = (categoryKey: string, index: number, field: keyof PermissionRule, value: string) => {
    const currentCategory = permissionCategories.find(cat => cat.category === categoryKey)
    if (!currentCategory) return
    
    const newRules = [...currentCategory.rules]
    newRules[index] = { ...newRules[index], [field]: value }
    
    setPermissionCategories(prev =>
      prev.map(cat =>
        cat.category === categoryKey ? { ...cat, rules: newRules } : cat
      )
    )
  }

  const handleMoveRule = (categoryKey: string, index: number, direction: 'up' | 'down') => {
    const currentCategory = permissionCategories.find(cat => cat.category === categoryKey)
    if (!currentCategory) return
    
    const newRules = [...currentCategory.rules]
    
    if (direction === 'up' && index > 0) {
      [newRules[index], newRules[index - 1]] = [newRules[index - 1], newRules[index]]
    } else if (direction === 'down' && index < newRules.length - 1) {
      [newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]]
    }
    
    setPermissionCategories(prev =>
      prev.map(cat =>
        cat.category === categoryKey ? { ...cat, rules: newRules } : cat
      )
    )
  }

  const handleSavePermissions = async () => {
    setSaving(true)
    try {
      // 转换权限配置为OpenCode格式
      const permissionConfig: Record<string, any> = {}
      permissionCategories.forEach(category => {
        if (category.rules.length === 0) return
        
        // 根据OpenCode schema，某些类别只接受字符串值（PermissionAction）
        const stringOnlyCategories = ['webfetch', 'websearch', 'codesearch', 'doom_loop']
        const isStringOnly = stringOnlyCategories.includes(category.category)
        
        if (isStringOnly) {
          // 只接受字符串的类别：只能有一条规则且pattern必须为"*"
          if (category.rules.length > 1) {
            throw new Error(`类别 ${category.category} 只支持单个权限规则（使用 "*" 模式）`)
          }
          if (category.rules[0].pattern !== '*') {
            throw new Error(`类别 ${category.category} 只支持 "*" 模式`)
          }
          permissionConfig[category.category] = category.rules[0].level
        } else {
          // 接受字符串或对象映射的类别
          // 如果只有一条规则且pattern为"*"，可以简化为字符串
          if (category.rules.length === 1 && category.rules[0].pattern === '*') {
            permissionConfig[category.category] = category.rules[0].level
          } else {
            // 使用对象格式
            const rulesObj: Record<string, string> = {}
            category.rules.forEach(rule => {
              if (rule.pattern) {
                rulesObj[rule.pattern] = rule.level
              }
            })
            permissionConfig[category.category] = rulesObj
          }
        }
      })

      const response = await kotlinApi.updateGlobalConfig({
        permission: permissionConfig
      })

      if (response.error) {
        message.error(`保存权限配置失败: ${response.error}`)
      } else {
        message.success('权限配置保存成功')
      }
    } catch (error) {
      console.error('保存权限配置失败:', error)
      message.error('保存权限配置失败')
    } finally {
      setSaving(false)
    }
  }



  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Text style={{ color: 'var(--text-primary)' }}>
          配置不同类别的权限规则。当对话面板中的"自动处理权限"关闭时，将按照这些规则进行权限拦截。
        </Text>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSavePermissions}
          loading={saving}
        >
          保存权限配置
        </Button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Collapse 
          style={{ marginBottom: 16 }}
          items={PERMISSION_CATEGORIES.map(cat => {
            const categoryData = permissionCategories.find(c => c.category === cat.key) || { category: cat.key, rules: [] }
            const rules = categoryData.rules
            
            return {
              key: cat.key,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{cat.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {rules.length} 条规则
                  </span>
                </div>
              ),
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleAddRule(cat.key)}
                        size="small"
                      >
                        添加规则
                      </Button>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        规则匹配顺序：从上到下，第一个匹配的规则生效
                      </Text>
                    </Space>
                  </div>

                  {rules.length === 0 ? (
                    <div style={{ 
                      padding: 24, 
                      textAlign: 'center', 
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 8
                    }}>
                      暂无规则，点击"添加规则"按钮创建第一条规则
                    </div>
                  ) : (
                    <div>
                      {rules.map((rule, index) => (
                        <RuleItem
                          key={index}
                          categoryKey={cat.key}
                          rule={rule}
                          index={index}
                          totalRules={rules.length}
                          onRuleChange={handleRuleChange}
                          onRemoveRule={handleRemoveRule}
                          onMoveRule={handleMoveRule}
                        />
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <Text strong style={{ color: 'var(--text-primary)' }}>规则说明：</Text>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, color: 'var(--text-secondary)' }}>
                      <li><Text type="secondary">规则模式支持通配符：* 匹配任意字符，? 匹配单个字符</Text></li>
                      <li><Text type="secondary">权限级别：允许（自动通过）、询问（提示用户审批）、拒绝（自动拒绝）</Text></li>
                      <li><Text type="secondary">当"自动处理权限"开启时，所有权限请求将自动审批（值为once）</Text></li>
                      <li><Text type="secondary">规则按顺序匹配，第一个匹配的规则生效</Text></li>
                    </ul>
                  </div>
                </>
              )
            }
          })}
        />
      </div>

      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        backgroundColor: 'var(--bg-secondary)', 
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        fontSize: 12,
        flexShrink: 0
      }}>
        <Flex justify="space-between" align="center">
          <div style={{ color: 'var(--text-secondary)' }}>
            ⚠️ 修改权限配置后需要重启服务才能生效
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

export default PermissionsTab