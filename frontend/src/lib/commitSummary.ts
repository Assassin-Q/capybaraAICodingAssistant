import { gitApi } from "@/lib/ideaIntegrations";
import { modelRefWithAvailableVariant } from "@/components/assistant/modelVariants";
import { openCodeApi } from "@/lib/opencode";
import type { AssistantMessage, ModelInfo } from "@/lib/opencode";

interface CommitSummaryOptions {
  model?: ModelInfo;
  projectPath?: string;
  variant?: string;
}

const PROMPT_HEADER = [
  "根据下面的 git 改动生成一条中文提交信息。",
  "要求：第一行是不超过 50 个字的摘要，使用祈使语气；如果改动较多，空一行后用 - 列出要点。",
  "只输出提交信息本身，不要解释、不要代码块、不要引号。",
  "",
].join("\n");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const assistantText = (message: AssistantMessage): string =>
  message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

/**
 * Generates a commit message in a throwaway session so the visible conversation stays clean,
 * using whichever model the composer currently has selected.
 */
export async function generateCommitSummary({
  model,
  projectPath,
  variant,
}: CommitSummaryOptions): Promise<string> {
  if (!projectPath) throw new Error("未获取到项目路径");
  if (!model) throw new Error("请先在输入框选择模型");

  const diff = await gitApi.diffSummary();
  if (!diff.available) throw new Error(diff.message ?? "无法读取 Git 改动");
  const body = `${diff.stat}\n\n${diff.nameStatus}`.trim();
  if (!body) throw new Error("没有可总结的改动");

  const modelRef = modelRefWithAvailableVariant(model, variant);
  const session = await openCodeApi.createSession(projectPath, modelRef);
  try {
    await openCodeApi.sendPrompt(session.id, {
      directory: projectPath,
      model: modelRef,
      text: `${PROMPT_HEADER}${body}`,
    });

    // Poll until the run settles; the throwaway session has no tools, so this is quick.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1000);
      const status = await openCodeApi.getSessionStatus(session.id, projectPath);
      if (status.type !== "busy") break;
    }

    const messages = await openCodeApi.getMessages(session.id, projectPath);
    const reply = [...messages]
      .reverse()
      .find((message): message is AssistantMessage => message.type === "assistant");
    const text = reply ? assistantText(reply) : "";
    if (!text) throw new Error("模型没有返回提交信息");
    // Strip stray fencing some models add despite the instruction.
    return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  } finally {
    await openCodeApi.deleteSession(session.id, projectPath).catch(() => undefined);
  }
}
