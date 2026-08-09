export interface ProfessionalRolePreset {
  description: string;
  id: string;
  instructions: string;
  name: string;
}

export interface ProfessionalRoleConfig {
  enabled: boolean;
  instructions: string;
  mcpNames: string[];
  skillNames: string[];
}

export interface ProfessionalRolePreferences {
  enabled: boolean;
  roles: Record<string, ProfessionalRoleConfig>;
  selectedRoleId: string;
}

export const AUTO_PROFESSIONAL_ROLE_ID = "auto";

export const PROFESSIONAL_ROLE_PRESETS: ProfessionalRolePreset[] = [
  {
    id: "architect",
    name: "架构设计师",
    description: "关注模块边界、依赖关系、兼容性和长期演进。",
    instructions: "从系统边界、依赖方向、兼容性和演进成本审视任务；先理解现有架构，再给出最小且可持续的改动。",
  },
  {
    id: "ui-designer",
    name: "UI/UX 设计师",
    description: "关注交互流程、信息层级、响应式布局和可访问性。",
    instructions: "从用户流程、信息层级、交互反馈、响应式布局和可访问性审视界面；保持现有设计体系并验证真实使用效果。",
  },
  {
    id: "frontend",
    name: "前端工程师",
    description: "关注组件边界、状态管理、性能和浏览器行为。",
    instructions: "优先复用现有组件和状态模式，关注交互完整性、渲染性能、类型安全、窄屏适配和异常状态。",
  },
  {
    id: "backend",
    name: "后端工程师",
    description: "关注接口契约、并发、错误恢复和服务边界。",
    instructions: "关注接口契约、数据一致性、并发安全、错误恢复和可观测性；保持服务边界清晰并避免不必要的中转层。",
  },
  {
    id: "database",
    name: "数据库设计师",
    description: "关注数据模型、索引、迁移、事务和查询成本。",
    instructions: "从数据模型、约束、索引、事务、迁移兼容性和查询成本审视改动；优先保证数据正确性与可回滚性。",
  },
  {
    id: "quality",
    name: "测试工程师",
    description: "关注风险、边界条件、回归范围和可验证结果。",
    instructions: "先识别风险和边界条件，再设计最有价值的测试；覆盖失败路径、回归影响和可重复验证步骤。",
  },
  {
    id: "reviewer",
    name: "代码审阅者",
    description: "关注缺陷、回归、安全风险和缺失测试。",
    instructions: "优先发现真实缺陷、行为回归、安全风险和缺失测试；结论需要给出明确证据、位置和修复建议。",
  },
  {
    id: "debugger",
    name: "调试与性能工程师",
    description: "关注复现路径、日志、调用链、资源消耗和根因。",
    instructions: "先建立可复现路径并收集日志、诊断和调用关系，再定位根因；避免只掩盖症状，必要时量化性能变化。",
  },
];

export const findProfessionalRolePreset = (id: string): ProfessionalRolePreset | undefined =>
  PROFESSIONAL_ROLE_PRESETS.find((preset) => preset.id === id);

export const createDefaultProfessionalRolePreferences = (): ProfessionalRolePreferences => ({
  enabled: false,
  roles: Object.fromEntries(PROFESSIONAL_ROLE_PRESETS.map((preset) => [
    preset.id,
    { enabled: true, instructions: preset.instructions, mcpNames: [], skillNames: [] },
  ])),
  selectedRoleId: AUTO_PROFESSIONAL_ROLE_ID,
});

export const buildProfessionalRoleInstructions = (
  preferences: ProfessionalRolePreferences,
  availableSkillNames: string[],
  availableMcpNames: string[]
): string | undefined => {
  if (!preferences.enabled || preferences.selectedRoleId === AUTO_PROFESSIONAL_ROLE_ID) return undefined;
  const preset = findProfessionalRolePreset(preferences.selectedRoleId);
  const config = preferences.roles[preferences.selectedRoleId];
  if (!preset || !config?.enabled) return undefined;
  const skillSet = new Set(availableSkillNames);
  const mcpSet = new Set(availableMcpNames);
  const skills = config.skillNames.filter((name) => skillSet.has(name));
  const mcps = config.mcpNames.filter((name) => mcpSet.has(name));
  return [
    `当前专业角色：${preset.name}。`,
    config.instructions.trim() || preset.instructions,
    "这是专业关注点和能力偏好，不是固定工作流；应根据用户任务自主判断，不相关时不要强行套用。",
    skills.length > 0 ? `任务相关时优先加载这些已安装 Skill：${skills.join("、")}。` : "",
    mcps.length > 0 ? `任务相关时优先使用这些已配置 MCP：${mcps.join("、")}。` : "",
  ].filter(Boolean).join("\n");
};
