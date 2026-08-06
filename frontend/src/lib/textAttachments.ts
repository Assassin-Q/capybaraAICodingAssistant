import type { PromptAttachment } from "@/lib/opencodeTypes";

export interface EmbeddedTextAttachment {
  content: string;
  mime: string;
  name: string;
}

const OPEN_TAG = "attached_text_file";
const EMBEDDED_TEXT_PATTERN = new RegExp(
  `<${OPEN_TAG} name="([^"]+)" mime="([^"]+)">\\n([\\s\\S]*?)\\n<\\/${OPEN_TAG}>`,
  "g"
);

const decodeAttribute = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const appendTextAttachments = (text: string, attachments: EmbeddedTextAttachment[]): string => {
  if (attachments.length === 0) return text;
  const blocks = attachments.map((attachment) =>
    `<${OPEN_TAG} name="${encodeURIComponent(attachment.name)}" mime="${encodeURIComponent(attachment.mime)}">\n${attachment.content}\n</${OPEN_TAG}>`
  );
  return [text.trim(), ...blocks].filter(Boolean).join("\n\n");
};

export const extractTextAttachments = (text: string): { files: PromptAttachment[]; text: string } => {
  const files: PromptAttachment[] = [];
  const visibleText = text.replace(
    EMBEDDED_TEXT_PATTERN,
    (_match, encodedName: string, encodedMime: string, content: string) => {
      const mime = decodeAttribute(encodedMime) || "text/plain";
      files.push({
        mime,
        name: decodeAttribute(encodedName) || "粘贴内容.txt",
        uri: `data:${mime};charset=utf-8,${encodeURIComponent(content)}`,
      });
      return "";
    }
  );
  return {
    files,
    text: visibleText.replace(/\n{3,}/g, "\n\n").trim(),
  };
};
