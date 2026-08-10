import type { ContextChip } from "@/components/assistant/shared";
import type { PromptInputFile } from "@/components/ai-elements/prompt-input";
import type { PromptAttachment } from "@/lib/opencode";
import type { EmbeddedTextAttachment } from "@/lib/textAttachments";
import { t } from "@/lib/i18n";

const textExtensions = new Set(["csv", "json", "jsonc", "log", "md", "mdx", "txt", "xml", "yaml", "yml"]);

export const isTextFile = (file: File): boolean => {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && textExtensions.has(extension));
};

const contextInstructions: Record<ContextChip["action"], string> = {
  add_to_chat: t("s_c57401eb1d"),
  explain_code: t("s_a19aef03da"),
  generate_test: t("s_f98a9b921b"),
  optimize_code: t("s_1c34089065"),
};

const contextMime = (context: ContextChip): string => {
  if (context.kind === "directory") return "text/x-idea-directory";
  if (context.kind === "selection") return "text/x-idea-selection";
  if (context.kind === "binary") return "application/x-idea-binary";
  return "text/x-idea-file";
};

const contextName = (context: ContextChip, index: number): string => {
  const location = context.fileName?.split(/[\\/]/).filter(Boolean).pop();
  if (context.kind === "directory") return location || t("s_4d74e7f3e4", { p0: index + 1 });
  if (context.kind === "selection") return location ? t("s_8b1eb6107f", { p0: location }) : t("s_ec6eb15adf", { p0: index + 1 });
  return location || t("s_a814b933ae", { p0: index + 1 });
};

const contextContent = (context: ContextChip): string => {
  const location = context.fileName
    ? t("s_aa57b03f07", { p0: context.fileName, p1: context.lineRange ? t("s_e8121a5993", { p0: context.lineRange.start, p1: context.lineRange.end }) : "" })
    : t("s_208eed345a");
  return [contextInstructions[context.action], location, "", context.content].join("\n");
};

export const contextToPromptInputFile = (context: ContextChip, index: number): PromptInputFile => {
  const mime = contextMime(context);
  const name = contextName(context, index);
  const file = new File([contextContent(context)], name, { type: mime });
  return {
    file,
    filename: name,
    id: `idea-context-${context.id}`,
    mediaType: mime,
    type: "file",
    url: URL.createObjectURL(file),
  };
};

export const fileToPromptAttachment = (file: File, name: string): Promise<PromptAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve({ mime: file.type || "application/octet-stream", name, uri: reader.result });
        return;
      }
      reject(new Error(t("s_fb62058e76", { p0: name })));
    };
    reader.onerror = () => reject(reader.error ?? new Error(t("s_fb62058e76", { p0: name })));
    reader.readAsDataURL(file);
  });

export const fileToEmbeddedTextAttachment = async (file: File, name: string): Promise<EmbeddedTextAttachment> => ({
  content: await file.text(),
  mime: file.type.split(";")[0] || "text/plain",
  name,
});

export const contextPrompt = (contexts: ContextChip[]): string =>
  contexts.map((context) => {
    const location = context.fileName
      ? t("s_4be036417f", { p0: context.fileName, p1: context.lineRange ? t("s_e8121a5993", { p0: context.lineRange.start, p1: context.lineRange.end }) : "" })
      : t("s_208eed345a");
    return `${contextInstructions[context.action]}\n${location}\n\n\`\`\`\n${context.content}\n\`\`\``;
  }).join("\n\n");
