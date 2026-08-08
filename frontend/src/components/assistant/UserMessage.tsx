import { FileCode2, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getMediaCategory,
} from "@/components/ai-elements/attachments";
import { AttachmentPreviewDialog } from "@/components/ai-elements/attachment-preview-dialog";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import type { UserMessage as UserMessageData } from "@/lib/opencode";

const attachmentData = (message: UserMessageData): AttachmentData[] =>
  (message.files ?? []).map((file, index) => ({
    filename: file.name ?? `附件 ${index + 1}`,
    id: `${message.id}-file-${index}`,
    mediaType: file.mime ?? "application/octet-stream",
    type: "file" as const,
    url: file.uri,
  }));

const isIdeaAttachment = (file: AttachmentData): boolean =>
  file.type === "file" && Boolean(file.mediaType?.startsWith("text/x-idea-") || file.mediaType === "application/x-idea-binary");

const attachmentDescription = (file: AttachmentData): string => {
  if (file.mediaType === "text/x-idea-directory") return "文件夹";
  if (file.mediaType === "text/x-idea-selection") return "代码片段";
  if (file.mediaType === "application/x-idea-binary") return "二进制文件";
  return file.filename?.split(".").pop()?.toUpperCase() ?? "文件";
};

export function UserMessage({ message }: { message: UserMessageData }) {
  const files = attachmentData(message);
  const imageFiles = files.filter((file) => getMediaCategory(file) === "image");
  const documentFiles = files.filter((file) => getMediaCategory(file) !== "image");
  const [preview, setPreview] = useState<AttachmentData>();
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = (file: AttachmentData) => {
    setPreview(file);
    setPreviewOpen(true);
  };

  return (
    <Message className="gap-1.5" from="user">
      {message.text && (
        <MessageContent className="max-w-full">
          <MessageResponse>{message.text}</MessageResponse>
        </MessageContent>
      )}
      {imageFiles.length > 0 && (
        <Attachments className="ml-auto max-w-full justify-end" variant="grid">
          {imageFiles.map((file) => (
            <Attachment
              aria-label={`预览 ${file.filename ?? "附件"}`}
              className="cursor-pointer"
              data={file}
              key={file.id}
              onClick={() => openPreview(file)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPreview(file);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <AttachmentPreview />
              <AttachmentInfo />
            </Attachment>
          ))}
        </Attachments>
      )}
      {documentFiles.length > 0 && (
        <Attachments className="ml-auto max-w-full justify-end" variant="inline">
          {documentFiles.map((file) => {
            const ideaAttachment = isIdeaAttachment(file);
            const attachmentProps = ideaAttachment
              ? { className: "h-10 max-w-[min(100%,19rem)] gap-2 rounded-md border-0 bg-secondary/75 px-1.5 shadow-none hover:bg-secondary" }
              : {
                className: "h-10 max-w-[min(100%,19rem)] cursor-pointer gap-2 rounded-md border-0 bg-secondary/75 px-1.5 shadow-none hover:bg-secondary",
                onClick: () => openPreview(file),
                onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPreview(file);
                  }
                },
                role: "button" as const,
                tabIndex: 0,
              };
            return (
              <Attachment
                aria-label={ideaAttachment ? `${file.filename ?? "附件"}，${attachmentDescription(file)}` : `预览 ${file.filename ?? "附件"}`}
                data={file}
                key={file.id}
                {...attachmentProps}
              >
                <AttachmentPreview
                  className="size-8 bg-muted/70 [&>svg]:size-4"
                  fallbackIcon={file.mediaType === "text/x-idea-directory" ? <FolderOpen className="size-4 text-muted-foreground" /> : <FileCode2 className="size-4 text-muted-foreground" />}
                />
                <AttachmentInfo className="text-xs leading-4" description={attachmentDescription(file)} />
              </Attachment>
            );
          })}
        </Attachments>
      )}
      <AttachmentPreviewDialog attachment={preview?.type === "file" ? preview : undefined} onOpenChange={setPreviewOpen} open={previewOpen} />
    </Message>
  );
}
