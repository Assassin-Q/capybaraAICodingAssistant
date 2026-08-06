import type { ContextChip } from "@/components/assistant/shared";
import type { PromptAttachment } from "@/lib/opencode";
import type { EmbeddedTextAttachment } from "@/lib/textAttachments";

const textExtensions = new Set(["csv", "json", "jsonc", "log", "md", "mdx", "txt", "xml", "yaml", "yml"]);

export const isTextFile = (file: File): boolean => {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && textExtensions.has(extension));
};

const contextInstructions: Record<ContextChip["action"], string> = {
  add_to_chat: "将下面的代码作为当前任务的上下文。",
  explain_code: "解释下面代码的作用、关键流程和潜在问题。",
  generate_test: "为下面代码生成高质量的单元测试。",
  optimize_code: "分析并优化下面代码，说明修改理由。",
};

export const fileToPromptAttachment = (file: File, name: string): Promise<PromptAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve({ mime: file.type || "application/octet-stream", name, uri: reader.result });
        return;
      }
      reject(new Error(`无法读取附件：${name}`));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取附件：${name}`));
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
      ? `文件：${context.fileName}${context.lineRange ? `（第 ${context.lineRange.start}-${context.lineRange.end} 行）` : ""}`
      : "IDEA 代码片段";
    return `${contextInstructions[context.action]}\n${location}\n\n\`\`\`\n${context.content}\n\`\`\``;
  }).join("\n\n");
