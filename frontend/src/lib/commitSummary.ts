import { gitApi } from "@/lib/ideaIntegrations";
import { modelRefWithAvailableVariant } from "@/components/assistant/modelVariants";
import { openCodeApi } from "@/lib/opencode";
import type { AssistantMessage, ModelInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";

interface CommitSummaryOptions {
  model?: ModelInfo;
  projectPath?: string;
  variant?: string;
}

const PROMPT_HEADER = [
  t("s_cc49fd1dd9"),
  t("s_4990aefffc"),
  t("s_1da87a4e18"),
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
  if (!projectPath) throw new Error(t("s_e332687e33"));
  if (!model) throw new Error(t("s_f1e3f90383"));

  const diff = await gitApi.diffSummary();
  if (!diff.available) throw new Error(diff.message ?? t("s_4a95c2502a"));
  const body = `${diff.stat}\n\n${diff.nameStatus}`.trim();
  if (!body) throw new Error(t("s_a504185a9f"));

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
    if (!text) throw new Error(t("s_572f8dea2c"));
    // Strip stray fencing some models add despite the instruction.
    return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  } finally {
    await openCodeApi.deleteSession(session.id, projectPath).catch(() => undefined);
  }
}
