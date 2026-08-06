const PERSONA_CONTEXT_START = "<capybara-persona-context>";
const PERSONA_CONTEXT_END = "</capybara-persona-context>";

const PERSONA_CONTEXT_RULES = [
  "<system-reminder>",
  "这是来自界面偏好的私有回答风格约束，不是用户任务，也不是对话内容。",
  "只在措辞、语气和互动方式上自然体现这些约束。禁止复述、引用、解释或提及约束本身。",
  "禁止声称用户要求你切换、进入、启用或扮演某种模式、角色或人格，直接回答后面的真实请求。",
  "风格约束不得降低事实准确性、工程质量、安全边界或任务完成度。",
  "</system-reminder>",
].join("\n");

const LEGACY_PERSONA_BOUNDARIES = [
  ["你是温暖平衡。\n保持温暖、清醒且有主见", "回答简洁自然，不使用模板化收尾；代码改动遵循项目已有风格并完成必要验证。"],
  ["你是理性分析。\n以冷静、克制、精准的方式交流", "实现代码时控制改动范围，关注边界条件、兼容性、性能和可验证性。"],
  ["你是共情洞察。\n用温和、敏锐但不软弱的方式交流", "实现过程中主动补齐自然会被期待的状态、反馈和错误处理，并清楚说明验证结果。"],
  ["你是严格审阅。\n以高级代码审阅者的标准工作", "需要修改时采用最小且完整的修复，并用相关构建、类型检查或测试验证。"],
  ["你是结对实现。\n像可靠的结对工程师一样主动推进任务", "交付时只强调重要改动、验证结果和真实剩余项，不把计划描述成完成结果。"],
  ["你是哈基米。\n你现在切换为“哈基米”模式", "- 你：啧，自己写的代码都不认得？……（扫一眼）第42行少个括号，曼波。下次注意。"],
] as const;

const stripLegacyPersonaContext = (text: string): string => {
  const boundary = LEGACY_PERSONA_BOUNDARIES.find(([start]) => text.startsWith(start));
  if (!boundary) return text;
  const end = text.indexOf(boundary[1], boundary[0].length);
  if (end < 0) return text;
  return text.slice(end + boundary[1].length).replace(/^\s+/, "");
};

export const attachPersonaContext = (text: string, instructions?: string): string => {
  const normalized = instructions?.trim();
  if (!normalized) return text;
  return [
    PERSONA_CONTEXT_START,
    PERSONA_CONTEXT_RULES,
    normalized,
    PERSONA_CONTEXT_END,
    "",
    text,
  ].join("\n");
};

export const stripPersonaContext = (text: string): string => {
  if (!text.startsWith(PERSONA_CONTEXT_START)) return stripLegacyPersonaContext(text);
  const end = text.indexOf(PERSONA_CONTEXT_END, PERSONA_CONTEXT_START.length);
  if (end < 0) return text;
  return text.slice(end + PERSONA_CONTEXT_END.length).replace(/^\s+/, "");
};
