import React, { useState } from 'react'
import { Button, Table, Modal, Space, Radio, Input, Row, Col, Flex, Upload, Tabs, Collapse, Tag, Switch, message } from 'antd'
import { PlusOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons'
import MDEditor from '@uiw/react-md-editor'
import MonacoEditor from '@monaco-editor/react'
import type { SkillConfig, Settings } from '../../types'
import { kotlinApi } from '../../utils/kotlinApi'
import { useLocale } from '../../locales/LocaleContext'

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
  const { t } = useLocale()
  const [restartLoading, setRestartLoading] = useState(false)

  // 删除技能
  const handleDeleteSkill = async (skill: SkillConfig) => {
    Modal.confirm({
      title: t('skills.deleteTitle'),
      content: t('skills.deleteContent', { name: skill.name }),
      okText: t('skills.deleteOk'),
      okType: 'danger',
      cancelText: t('skills.deleteCancel'),
      async onOk() {
        try {
          // Extract skill ID (remove 'skill-' prefix if present)
          const skillId = skill.id.startsWith('skill-') ? skill.id.substring(6) : skill.id
          await kotlinApi.deleteSkill(skillId)
          message.success(t('skills.deleteSuccess'))
          // 刷新技能列表
          await fetchSkills()
        } catch (error) {
          console.error('删除技能失败:', error)
          message.error(`${t('skills.deleteFailed')} ${(error as Error).message}`)
        }
      },
    })
  }

  // Define columns here to access props
  const skillColumns = [
    {
      title: t('skills.columnName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('skills.columnDesc'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: t('skills.columnScope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (scope: string) => (
        <Tag color={scope === 'global' ? 'blue' : 'green'}>
          {scope === 'global' ? t('skills.global') : t('skills.project')}
        </Tag>
      ),
    },
    {
      title: t('skills.columnEnabled'),
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
      title: t('skills.columnActions'),
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
        <span style={{ color: 'var(--text-secondary)' }}>{t('skills.manageTitle')}</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowAddSkill(true)}>
          {t('skills.addSkill')}
        </Button>
      </Flex>

      <Modal
        title={
          <Space>
            {isEditingSkill ? t('skills.editTitle') : t('skills.addNewTitle')}
            {loadingSkillFiles && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('skills.loadingFile')}</span>}
          </Space>
        }
        open={showAddSkill}
        centered
        mask={{ closable: false }}
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
            {t('common.cancel')}
          </Button>,
          <Button key="save" type="primary" onClick={handleAddSkill} disabled={loadingSkillFiles} loading={savingSkill}>
            {isEditingSkill ? t('common.update') : t('common.save')}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.scopeLabel')}</div>
          <Radio.Group value={skillScope} onChange={e => {
            const newScope = e.target.value as 'project' | 'global'
            setSkillScope(newScope)
          }}>
            <Radio value="project">{t('skills.scopeProjectDesc')}</Radio>
            <Radio value="global">{t('skills.scopeGlobalDesc')}</Radio>
          </Radio.Group>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.skillName')}</div>
              <Input
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                placeholder={t('skills.placeholderName')}
              />
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.versionLabel')}</div>
              <Input
                value={skillVersion}
                onChange={e => setSkillVersion(e.target.value)}
                placeholder={t('skills.placeholderVersion')}
              />
            </Col>
          </Row>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.skillDesc')}</div>
          <Input.TextArea
            value={skillDescription}
            onChange={e => setSkillDescription(e.target.value)}
            placeholder={t('skills.placeholderDesc')}
            rows={3}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center">
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.skillContent')}</div>
            <Space>
              <Upload
                showUploadList={false}
                beforeUpload={() => false}
                onChange={handleImportSkill}
              >
                <Button size="small" icon={<UploadOutlined />}>{t('skills.importPackage')}</Button>
              </Upload>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleUseTemplate}>
                {t('skills.useTemplate')}
              </Button>
            </Space>
          </Flex>
          <Tabs
            activeKey={skillActiveTab}
            onChange={setSkillActiveTab}
            items={[
              {
                key: 'basic',
                label: t('skills.basicInfo'),
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.skillDoc')}</div>
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
                label: t('skills.commonTemplates'),
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.templateDir')}</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillTemplates, setSkillTemplates, 'template.md')}
                      >
                         {t('skills.addTemplateFile')}
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
                              <span>{file.filename || t('skills.fileLabel', { index: String(index + 1) })}</span>
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
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileName')}</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillTemplates, setSkillTemplates, index, e.target.value)}
                                  placeholder={t('skills.placeholderTemplateFile')}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileContent')}</div>
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
                label: t('skills.goodExamples'),
                children: (
                  <div style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.goodExamplesTitle')}</div>
                        <div style={{ marginBottom: 16 }}>
                          <Button 
                            type="dashed" 
                            size="small" 
                            icon={<PlusOutlined />}
                            onClick={() => addFile(skillGoodExamples, setSkillGoodExamples, 'good.md')}
                          >
                            {t('skills.addGoodExample')}
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
                                  <span>{file.filename || t('skills.exampleLabel', { index: String(index + 1) })}</span>
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
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileName')}</div>
                                    <Input
                                      value={file.filename}
                                      onChange={e => updateFileName(skillGoodExamples, setSkillGoodExamples, index, e.target.value)}
                                      placeholder={t('skills.placeholderGoodExample')}
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileContent')}</div>
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
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.badExamplesTitle')}</div>
                        <div style={{ marginBottom: 16 }}>
                          <Button 
                            type="dashed" 
                            size="small" 
                            icon={<PlusOutlined />}
                            onClick={() => addFile(skillAntiPatterns, setSkillAntiPatterns, 'anti-pattern.md')}
                          >
                            {t('skills.addBadExample')}
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
                                  <span>{file.filename || t('skills.badExampleLabel', { index: String(index + 1) })}</span>
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
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileName')}</div>
                                    <Input
                                      value={file.filename}
                                      onChange={e => updateFileName(skillAntiPatterns, setSkillAntiPatterns, index, e.target.value)}
                                      placeholder={t('skills.placeholderBadExample')}
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileContent')}</div>
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
                label: t('skills.rulesLabel'),
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.rulesTitle')}</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillRules, setSkillRules, 'rules.md')}
                        >
                          {t('skills.addRuleFile')}
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
                              <span>{file.filename || t('skills.ruleLabel', { index: String(index + 1) })}</span>
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
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileName')}</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillRules, setSkillRules, index, e.target.value)}
                                  placeholder={t('skills.placeholderRule')}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileContent')}</div>
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
                label: t('skills.scriptsLabel'),
                children: (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{t('skills.scriptsTitle')}</div>
                    <div style={{ marginBottom: 16 }}>
                      <Button 
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={() => addFile(skillScripts, setSkillScripts, 'install.sh')}
                        >
                          {t('skills.addScriptFile')}
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
                              <span>{file.filename || t('skills.scriptLabel', { index: String(index + 1) })}</span>
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
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileName')}</div>
                                <Input
                                  value={file.filename}
                                  onChange={e => updateFileName(skillScripts, setSkillScripts, index, e.target.value)}
                                  placeholder={t('skills.placeholderScript')}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('skills.fileContent')}</div>
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
        // backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        fontSize: 12
      }}>
        <Flex justify="space-between" align="center">
          <div style={{ color: 'var(--text-secondary)' }}>
            {t('skills.restartHint')}
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
                // 刷新技能列表
                await fetchSkills()
                // 通知父组件刷新数据
                if (onServiceRestart) {
                  await onServiceRestart()
                }
              } catch (error) {
                console.error('重启服务失败:', error)
                 message.error(`${t('model.restartFailed')}${(error as Error).message}`)
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

export default SkillsTab