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
    const tag = typeof record._tag === "string" ? record._tag : typeof record.name === "string" ? record.name : "";
    if (tag.includes("VariantUnavailable")) {
      const provider = typeof record.providerID === "string" ? record.providerID : "";
      const model = typeof record.modelID === "string" ? record.modelID : "";
      const variant = typeof record.variant === "string" ? record.variant : "";
      return `思考档位“${variant || "未知"}”不适用于 ${provider && model ? `${provider}/${model}` : "当前模型"}`;
    }
    for (const key of ["message", "detail", "reason"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    for (const key of ["error", "data", "cause"]) {
      const value = record[key];
      if (value && value !== error) {
        const nested = errorMessage(value);
        if (nested !== "请求失败，请检查 OpenCode 服务") return nested;
      }
    }
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
