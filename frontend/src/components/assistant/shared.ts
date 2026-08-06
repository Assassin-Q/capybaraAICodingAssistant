import type { IdeContextEvent } from "@/lib/idea";
import type { AssistantToolPart, ModelRef, SessionInfo } from "@/lib/opencode";

export type RunStatus = "ready" | "submitted" | "streaming" | "error";

export interface ContextChip extends IdeContextEvent {
  addedAt: number;
}

export const actionLabels: Record<IdeContextEvent["action"], string> = {
  add_to_chat: "加入对话",
  explain_code: "解释代码",
  generate_test: "生成测试",
  optimize_code: "优化代码",
};

export const modelKey = (model: ModelRef): string => model.providerID + "/" + model.id;

export const sessionName = (session: SessionInfo): string => {
  const title = session.title?.trim();
  if (!title) return "新会话";
  const generated = /^new session\s*-\s*(.+)$/i.exec(title);
  return generated ? "新会话 · " + generated[1] : title;
};

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const data = record.data && typeof record.data === "object"
      ? record.data as Record<string, unknown>
      : undefined;
    const message = data?.message ?? record.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "请求失败，请检查 OpenCode 服务";
};

export const formatToolValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const toolState = (
  state: AssistantToolPart["state"]["status"]
): "input-streaming" | "input-available" | "output-available" | "output-error" => {
  if (state === "pending") return "input-streaming";
  if (state === "running") return "input-available";
  if (state === "error") return "output-error";
  return "output-available";
};
