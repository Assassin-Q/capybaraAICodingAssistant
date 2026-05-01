import React, { useState, useEffect } from 'react'
import { Input, Select, Button, Space, Typography, message, Collapse, Flex } from 'antd'
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, SaveOutlined } from '@ant-design/icons'
import type { PermissionCategory, PermissionRule, Settings } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'
import { useLocale } from '../../locales/LocaleContext'

const { Text } = Typography
const { Option } = Select

const PERMISSION_CATEGORIES = [
  { key: 'read' },
  { key: 'edit' },
  { key: 'glob' },
  { key: 'grep' },
  { key: 'list' },
  { key: 'bash' },
  { key: 'task' },
  { key: 'skill' },
  { key: 'lsp' },
  { key: 'webfetch' },
  { key: 'websearch' },
  { key: 'codesearch' },
  { key: 'external_directory' },
  { key: 'doom_loop' },
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
  const { t } = useLocale()
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
        placeholder={t('permissions.patternPlaceholder')}
        style={{ flex: 1 }}
      />
      <Select
        value={rule.level}
        onChange={value => onRuleChange(categoryKey, index, 'level', value)}
        style={{ width: 120 }}
      >
        <Option value="allow">{t('permissions.allow')}</Option>
        <Option value="ask">{t('permissions.ask')}</Option>
        <Option value="deny">{t('permissions.deny')}</Option>
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
  const { t } = useLocale()

  const getCategoryLabel = (key: string): string => {
    const labels: Record<string, string> = {
      read: t('permissions.categoryRead'),
      edit: t('permissions.categoryEdit'),
      glob: t('permissions.categoryGlob'),
      grep: t('permissions.categoryGrep'),
      list: t('permissions.categoryList'),
      bash: t('permissions.categoryBash'),
      task: t('permissions.categoryTask'),
      skill: t('permissions.categorySkill'),
      lsp: t('permissions.categoryLsp'),
      webfetch: t('permissions.categoryWebfetch'),
      websearch: t('permissions.categoryWebSearch'),
      codesearch: t('permissions.categoryCodeSearch'),
      external_directory: t('permissions.categoryExternalDir'),
      doom_loop: t('permissions.categoryDoomLoop'),
    }
    return labels[key] || key
  }
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
        message.error(t('permissions.saveFailed') + ' ' + response.error)
      } else {
        message.success(t('permissions.saveSuccess'))
      }
    } catch (error) {
      console.error('保存权限配置失败:', error)
      message.error(t('permissions.saveFailed'))
    } finally {
      setSaving(false)
    }
  }



  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Text style={{ color: 'var(--text-primary)' }}>
          {t('permissions.manageTitle')}
        </Text>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSavePermissions}
          loading={saving}
        >
          {t('permissions.save')}
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
                  <span>{getCategoryLabel(cat.key)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {rules.length} {t('permissions.ruleCount')}
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
                        {t('permissions.addRule')}
                      </Button>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('permissions.matchOrder')}
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
                      {t('permissions.emptyHint')}
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

                  <div style={{ marginTop: 16, padding: 12, borderRadius: 6 }}>
                    <Text strong style={{ color: 'var(--text-primary)' }}>{t('permissions.rulesHint')}</Text>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, color: 'var(--text-secondary)' }}>
                      <li><Text type="secondary">{t('permissions.wildcardHint')}</Text></li>
                      <li><Text type="secondary">{t('permissions.levelHint')}</Text></li>
                      <li><Text type="secondary">{t('permissions.autoHint')}</Text></li>
                      <li><Text type="secondary">{t('permissions.orderHint')}</Text></li>
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
        // backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        fontSize: 12,
        flexShrink: 0
      }}>
        <Flex justify="space-between" align="center">
          <div style={{ color: 'var(--text-secondary)' }}>
            {'⚠️ ' + t('permissions.restartHint')}
          </div>
           <Button 
            type="primary" 
            size="small"
            loading={restartLoading}
            onClick={async () => {
              setRestartLoading(true)
              try {
                await kotlinApi.restartService()
                message.success(t('permissions.restartSuccess'))
                // 通知父组件刷新数据
                if (onServiceRestart) {
                  await onServiceRestart()
                }
              } catch (error) {
                console.error('重启服务失败:', error)
                 message.error(t('permissions.restartFailed') + ' ' + (error as Error).message)
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

export default PermissionsTab
