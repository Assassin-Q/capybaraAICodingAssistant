import type { IdeContextEvent } from "@/lib/idea";
import type { AssistantToolPart, ModelRef, SessionInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";

export type RunStatus = "ready" | "submitted" | "streaming" | "error";

export interface ContextChip extends IdeContextEvent {
  addedAt: number;
}

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
export const actionLabels = (): Record<IdeContextEvent["action"], string> => ({
  add_to_chat: t("s_471f0dcad9"),
  explain_code: t("s_625cb72e0e"),
  generate_test: t("s_519ea0b247"),
  optimize_code: t("s_59c4239b75"),
});

export const modelKey = (model: ModelRef): string => model.providerID + "/" + model.id;

export const sessionName = (session: SessionInfo): string => {
  const title = session.title?.trim();
  if (!title) return t("s_db44360cd0");
  const generated = /^new session\s*-\s*(.+)$/i.exec(title);
  return generated ? t("s_fd3701e50f") + generated[1] : title;
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
      return t("s_b120657aa7", { p0: variant || t("s_d9c32a4c3d"), p1: provider && model ? `${provider}/${model}` : t("s_a0af8f7df5") });
    }
    for (const key of ["message", "detail", "reason"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    for (const key of ["error", "data", "cause"]) {
      const value = record[key];
      if (value && value !== error) {
        const nested = errorMessage(value);
        if (nested !== t("s_e4a6220d8f")) return nested;
      }
    }
  }
  return t("s_e4a6220d8f");
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
