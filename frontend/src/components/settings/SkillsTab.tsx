import React, { useState } from 'react'
import { Button, Table, Modal, Space, Radio, Input, Row, Col, Flex, Upload, Tabs, Collapse, Tag, Switch, message } from 'antd'
import { PlusOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons'
import MDEditor from '@uiw/react-md-editor'
import MonacoEditor from '@monaco-editor/react'
import type { SkillConfig, Settings } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'

interface SkillsTabProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  isDark: boolean
  onServiceRestart?: () => Promise<void>
  // State from parent
  showAddSkill: boolean
  setShowAddSkill: React.Dispatch<React.SetStateAction<boolean>>
  isEditingSkill: boolean
  setIsEditingSkill: React.Dispatch<React.SetStateAction<boolean>>
  setEditingSkillId: React.Dispatch<React.SetStateAction<string>>
  editingSkillId: string
  newSkillName: string
  setNewSkillName: React.Dispatch<React.SetStateAction<string>>
  newSkillContent: string
  setNewSkillContent: React.Dispatch<React.SetStateAction<string>>
  skillScope: 'project' | 'global'
  setSkillScope: React.Dispatch<React.SetStateAction<'project' | 'global'>>
  skillDescription: string
  setSkillDescription: React.Dispatch<React.SetStateAction<string>>
  skillVersion: string
  setSkillVersion: React.Dispatch<React.SetStateAction<string>>
  skillTemplates: Array<{filename: string, content: string}>
  setSkillTemplates: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>
  skillGoodExamples: Array<{filename: string, content: string}>
  setSkillGoodExamples: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>
  skillAntiPatterns: Array<{filename: string, content: string}>
  setSkillAntiPatterns: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>
  skillRules: Array<{filename: string, content: string}>
  setSkillRules: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>
  skillScripts: Array<{filename: string, content: string}>
  setSkillScripts: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>
  skillActiveTab: string
  setSkillActiveTab: React.Dispatch<React.SetStateAction<string>>
  loadingSkillFiles: boolean
  savingSkill: boolean
  originalSkillScope: 'project' | 'global'
  // Handlers from parent
  handleAddSkill: () => void
  handleImportSkill: (info: any) => void
  handleUseTemplate: () => void
  resetSkillForm: () => void
  addFile: (
    fileArray: Array<{filename: string, content: string}>, 
    setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, 
    defaultFilename: string
  ) => void
  removeFile: (
    fileArray: Array<{filename: string, content: string}>, 
    setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, 
    index: number
  ) => void
  updateFileName: (
    fileArray: Array<{filename: string, content: string}>, 
    setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, 
    index: number, 
    filename: string
  ) => void
  updateFileContent: (
    fileArray: Array<{filename: string, content: string}>, 
    setFileArray: React.Dispatch<React.SetStateAction<Array<{filename: string, content: string}>>>, 
    index: number, 
    content: string
  ) => void
  handleEditSkill: (skill: SkillConfig) => void
  handleExportSkill: (skill: SkillConfig) => Promise<void>
  fetchSkills: () => Promise<void>
}

const SkillsTab: React.FC<SkillsTabProps> = ({
  settings,
  onSettingsChange,
  isDark,
  onServiceRestart,
  showAddSkill,
  setShowAddSkill,
  isEditingSkill,
  setIsEditingSkill,
  setEditingSkillId,
  editingSkillId: _editingSkillId,
  newSkillName,
  setNewSkillName,
  newSkillContent,
  setNewSkillContent,
  skillScope,
  setSkillScope,
  skillDescription,
  setSkillDescription,
  skillVersion,
  setSkillVersion,
  skillTemplates,
  setSkillTemplates,
  skillGoodExamples,
  setSkillGoodExamples,
  skillAntiPatterns,
  setSkillAntiPatterns,
  skillRules,
  setSkillRules,
  skillScripts,
  setSkillScripts,
  skillActiveTab,
  setSkillActiveTab,
  loadingSkillFiles,
  savingSkill,
  originalSkillScope: _originalSkillScope,
  handleAddSkill,
  handleImportSkill,
  handleUseTemplate,
  resetSkillForm,
  addFile,
  removeFile,
  updateFileName,
  updateFileContent,
  handleEditSkill,
  handleExportSkill,
  fetchSkills,
}) => {
  const [restartLoading, setRestartLoading] = useState(false)

  // 删除技能
  const handleDeleteSkill = async (skill: SkillConfig) => {
    Modal.confirm({
      title: '确认删除技能',
      content: `确定要删除技能 "${skill.name}" 吗？此操作将永久删除技能文件。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        try {
          // Extract skill ID (remove 'skill-' prefix if present)
          const skillId = skill.id.startsWith('skill-') ? skill.id.substring(6) : skill.id
          await kotlinApi.deleteSkill(skillId)
          message.success('技能删除成功')
          // 刷新技能列表
          await fetchSkills()
        } catch (error) {
          console.error('删除技能失败:', error)
          message.error(`删除技能失败: ${(error as Error).message}`)
        }
      },
    })
  }

  // Define columns here to access props
  const skillColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '范围',
      dataIndex: 'scope',
      key: 'scope',
      render: (scope: string) => (
        <Tag color={scope === 'global' ? 'blue' : 'green'}>
          {scope === 'global' ? '全局' : '项目'}
        </Tag>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: SkillConfig) => (
        <Switch
          checked={enabled}
          onChange={checked => {
            const newSkills = settings.skills.map(s =>
              s.id === record.id ? { ...s, enabled: checked } : s
            )
            onSettingsChange({ ...settings, skills: newSkills })
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SkillConfig) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditSkill(record)}
          />
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleExportSkill(record)}
          >
          </Button>
           <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteSkill(record)}
          />
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Flex justify="space-between" style={{ marginBottom: 16 }}>
        <span style={{ color: 'var(--text-secondary)' }}>管理和配置 AI 助手的技能</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowAddSkill(true)}>
          添加技能
        </Button>
      </Flex>

      <Modal
        title={
          <Space>
            {isEditingSkill ? "编辑技能" : "添加新技能"}
            {loadingSkillFiles && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>(加载文件中...)</span>}
          </Space>
        }
        open={showAddSkill}
        centered
        maskClosable={false}
        onCancel={() => {
          setShowAddSkill(false)
          setIsEditingSkill(false)
          setEditingSkillId('')
          resetSkillForm()
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setShowAddSkill(false)
            setIsEditingSkill(false)
            setEditingSkillId('')
            resetSkillForm()
          }}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleAddSkill} disabled={loadingSkillFiles} loading={savingSkill}>
            {isEditingSkill ? "更新" : "保存"}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>技能范围</div>
          <Radio.Group value={skillScope} onChange={e => {
            const newScope = e.target.value as 'project' | 'global'
            setSkillScope(newScope)
          }}>
            <Radio value="project">项目级（保存在当前项目的 .opencode/skills/ 目录）</Radio>
            <Radio value="global">全局（保存在用户配置目录 ~/.config/opencode/skills/）</Radio>
          </Radio.Group>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>技能名称</div>
              <Input
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                placeholder="输入技能名称（英文小写，使用连字符）"
              />
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>版本号</div>
              <Input
                value={skillVersion}
                onChange={e => setSkillVersion(e.target.value)}
                placeholder="例如 1.0.0"
              />
            </Col>
          </Row>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>技能描述</div>
          <Input.TextArea
            value={skillDescription}
            onChange={e => setSkillDescription(e.target.value)}
            placeholder="输入技能描述"
            rows={3}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center">
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>技能内容</div>
            <Space>
              <Upload
                showUploadList={false}
                beforeUpload={() => false}
                onChange={handleImportSkill}
              >
                <Button size="small" icon={<UploadOutlined />}>导入现有技能包</Button>
              </Upload>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleUseTemplate}>
                使用模板
              </Button>
            </Space>
          </Flex>
          <Tabs
            activeKey={skillActiveTab}
            onChange={setSkillActiveTab}
            items={[
              {
                key: 'basic',
                label: '基础信息',
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>技能主文档 (SKILL.md)</div>
                    <MDEditor
                      value={newSkillContent}
                      onChange={value => setNewSkillContent(value || '')}
                      height={300}
                      preview="edit"
                      data-color-mode={isDark ? 'dark' : 'light'}
                      style={{ marginBottom: 16 }}
                    />
                  </div>
                ),
              },
              {
                key: 'templates',
                label: '常用模板',
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>模板内容 (templates/ 目录)</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillTemplates, setSkillTemplates, 'template.md')}
                      >
                        添加模板文件
                      </Button>
                    </div>
                    {skillTemplates.map((file, index) => (
                      <Collapse
                        key={index}
                        size="small"
                        style={{ marginBottom: 8 }}
                        items={[{
                          key: `${index}`,
                          label: (
                            <Space>
                              <span>{file.filename || `文件 ${index + 1}`}</span>
                              {skillTemplates.length > 1 && (
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeFile(skillTemplates, setSkillTemplates, index)
                                  }}
                                />
                              )}
                            </Space>
                          ),
                          children: (
                            <div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件名</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillTemplates, setSkillTemplates, index, e.target.value)}
                                  placeholder="例如：default.md, api-template.md"
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件内容</div>
                                <MDEditor
                                  value={file.content}
                                  onChange={value => updateFileContent(skillTemplates, setSkillTemplates, index, value || '')}
                                  height={200}
                                  preview="edit"
                                  data-color-mode={isDark ? 'dark' : 'light'}
                                />
                              </div>
                            </div>
                          )
                        }]}
                      />
                    ))}
                  </div>
                ),
              },
              {
                key: 'examples',
                label: '优秀/反例',
                children: (
                  <div style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>优秀示例 (examples/ 目录)</div>
                        <div style={{ marginBottom: 16 }}>
                          <Button 
                            type="dashed" 
                            size="small" 
                            icon={<PlusOutlined />}
                            onClick={() => addFile(skillGoodExamples, setSkillGoodExamples, 'good.md')}
                          >
                            添加优秀示例文件
                          </Button>
                        </div>
                        {skillGoodExamples.map((file, index) => (
                          <Collapse
                            key={`good-${index}`}
                            size="small"
                            style={{ marginBottom: 8 }}
                            items={[{
                              key: `${index}`,
                              label: (
                                <Space>
                                  <span>{file.filename || `示例 ${index + 1}`}</span>
                                  {skillGoodExamples.length > 1 && (
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        removeFile(skillGoodExamples, setSkillGoodExamples, index)
                                      }}
                                    />
                                  )}
                                </Space>
                              ),
                              children: (
                                <div>
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件名</div>
                                    <Input
                                      value={file.filename}
                                      onChange={e => updateFileName(skillGoodExamples, setSkillGoodExamples, index, e.target.value)}
                                      placeholder="例如：good.md, example-api.md"
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件内容</div>
                                    <MDEditor
                                      value={file.content}
                                      onChange={value => updateFileContent(skillGoodExamples, setSkillGoodExamples, index, value || '')}
                                      height={150}
                                      preview="edit"
                                      data-color-mode={isDark ? 'dark' : 'light'}
                                    />
                                  </div>
                                </div>
                              )
                            }]}
                          />
                        ))}
                      </Col>
                      <Col span={12}>
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>反模式示例 (examples/ 目录)</div>
                        <div style={{ marginBottom: 16 }}>
                          <Button 
                            type="dashed" 
                            size="small" 
                            icon={<PlusOutlined />}
                            onClick={() => addFile(skillAntiPatterns, setSkillAntiPatterns, 'anti-pattern.md')}
                          >
                            添加反模式文件
                          </Button>
                        </div>
                        {skillAntiPatterns.map((file, index) => (
                          <Collapse
                            key={`anti-${index}`}
                            size="small"
                            style={{ marginBottom: 8 }}
                            items={[{
                              key: `${index}`,
                              label: (
                                <Space>
                                  <span>{file.filename || `反例 ${index + 1}`}</span>
                                  {skillAntiPatterns.length > 1 && (
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        removeFile(skillAntiPatterns, setSkillAntiPatterns, index)
                                      }}
                                    />
                                  )}
                                </Space>
                              ),
                              children: (
                                <div>
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件名</div>
                                    <Input
                                      value={file.filename}
                                      onChange={e => updateFileName(skillAntiPatterns, setSkillAntiPatterns, index, e.target.value)}
                                      placeholder="例如：anti-pattern.md, bad-example.md"
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件内容</div>
                                    <MDEditor
                                      value={file.content}
                                      onChange={value => updateFileContent(skillAntiPatterns, setSkillAntiPatterns, index, value || '')}
                                      height={150}
                                      preview="edit"
                                      data-color-mode={isDark ? 'dark' : 'light'}
                                    />
                                  </div>
                                </div>
                              )
                            }]}
                          />
                        ))}
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'rules',
                label: '规范|规则|禁用词表',
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>规则文档 (references/ 目录)</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillRules, setSkillRules, 'rules.md')}
                      >
                        添加规则文件
                      </Button>
                    </div>
                    {skillRules.map((file, index) => (
                      <Collapse
                        key={index}
                        size="small"
                        style={{ marginBottom: 8 }}
                        items={[{
                          key: `${index}`,
                          label: (
                            <Space>
                              <span>{file.filename || `规则 ${index + 1}`}</span>
                              {skillRules.length > 1 && (
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeFile(skillRules, setSkillRules, index)
                                  }}
                                />
                              )}
                            </Space>
                          ),
                          children: (
                            <div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件名</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillRules, setSkillRules, index, e.target.value)}
                                  placeholder="例如：rules.md, forbidden-words.md, style-guide.md"
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件内容</div>
                                <MDEditor
                                  value={file.content}
                                  onChange={value => updateFileContent(skillRules, setSkillRules, index, value || '')}
                                  height={200}
                                  preview="edit"
                                  data-color-mode={isDark ? 'dark' : 'light'}
                                />
                              </div>
                            </div>
                          )
                        }]}
                      />
                    ))}
                  </div>
                ),
              },
              {
                key: 'scripts',
                label: '可执行脚本',
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>脚本内容 (scripts/ 目录)</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillScripts, setSkillScripts, 'install.sh')}
                      >
                        添加脚本文件
                      </Button>
                    </div>
                    {skillScripts.map((file, index) => (
                      <Collapse
                        key={index}
                        size="small"
                        style={{ marginBottom: 8 }}
                        items={[{
                          key: `${index}`,
                          label: (
                            <Space>
                              <span>{file.filename || `脚本 ${index + 1}`}</span>
                              {skillScripts.length > 1 && (
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeFile(skillScripts, setSkillScripts, index)
                                  }}
                                />
                              )}
                            </Space>
                          ),
                          children: (
                            <div>
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件名</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillScripts, setSkillScripts, index, e.target.value)}
                                  placeholder="例如：install.sh, setup.py, config.sh"
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>文件内容</div>
                                <MonacoEditor
                                  value={file.content}
                                  onChange={value => updateFileContent(skillScripts, setSkillScripts, index, value || '')}
                                  height={200}
                                  language={file.filename.endsWith('.py') ? 'python' : 
                                           file.filename.endsWith('.js') ? 'javascript' : 
                                           file.filename.endsWith('.ts') ? 'typescript' : 'shell'}
                                  theme={isDark ? 'vs-dark' : 'vs'}
                                  options={{
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 14,
                                    lineNumbers: 'on',
                                    wordWrap: 'on',
                                  }}
                                />
                              </div>
                            </div>
                          )
                        }]}
                      />
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>

      <Table
        dataSource={settings.skills}
        columns={skillColumns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
      />
      
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
            ⚠️ 添加、修改、删除技能后需要重启服务才能生效
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
                // 刷新技能列表
                await fetchSkills()
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

export default SkillsTab