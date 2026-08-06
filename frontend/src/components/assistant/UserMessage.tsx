import { useState } from "react";

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
    <Message from="user">
      <MessageContent className="max-w-full">
        {imageFiles.length > 0 && (
          <Attachments className="max-w-full justify-end" variant="grid">
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
          <Attachments className="max-w-full justify-end" variant="inline">
            {documentFiles.map((file) => (
              <Attachment
                aria-label={`预览 ${file.filename ?? "附件"}`}
                className="h-10 max-w-[min(100%,19rem)] cursor-pointer gap-2 border-0 bg-transparent px-0 shadow-none hover:bg-transparent"
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
                <AttachmentPreview className="size-8 bg-muted/70 [&>svg]:size-4" />
                <AttachmentInfo className="text-xs leading-4" description={file.filename?.split(".").pop()?.toUpperCase() ?? "文件"} />
              </Attachment>
            ))}
          </Attachments>
        )}
        {message.text && <MessageResponse>{message.text}</MessageResponse>}
        <AttachmentPreviewDialog attachment={preview?.type === "file" ? preview : undefined} onOpenChange={setPreviewOpen} open={previewOpen} />
      </MessageContent>
    </Message>
  );
}
