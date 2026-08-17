import { Check, Copy, FileCode2, FolderOpen } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import type { UserMessage as UserMessageData } from "@/lib/opencode";
import { attachmentSource, baseMediaType } from "@/lib/attachmentSource";
import { ideaApi } from "@/lib/idea";
import { stripPromptAugmentations } from "@/lib/promptAugmentation";
import { t } from "@/lib/i18n";

const attachmentData = (message: UserMessageData): AttachmentData[] =>
  (message.files ?? []).map((file, index) => ({
    filename: file.name ?? t("s_15ff0a654b", { p0: index + 1 }),
    id: `${message.id}-file-${index}`,
    mediaType: file.mime ?? "application/octet-stream",
    type: "file" as const,
    url: file.uri,
  }));

const isIdeaAttachment = (file: AttachmentData): boolean =>
  file.type === "file"
  && (baseMediaType(file.mediaType).startsWith("text/x-idea-")
    || baseMediaType(file.mediaType) === "application/x-idea-binary");

const attachmentDescription = (file: AttachmentData): string => {
  const media = baseMediaType(file.mediaType);
  if (media === "text/x-idea-directory") return t("s_46ecac2910");
  if (media === "text/x-idea-selection") return t("s_41f497eb47");
  if (media === "application/x-idea-binary") return t("s_a1a0e61a02");
  return file.filename?.split(".").pop()?.toUpperCase() ?? t("s_49deaf7da2");
};

export function UserMessage({ message }: { message: UserMessageData }) {
  // What the user typed, without the context the client appended for the model.
  const text = stripPromptAugmentations(message.text ?? "");
  const files = attachmentData(message);
  const imageFiles = files.filter((file) => getMediaCategory(file) === "image");
  const documentFiles = files.filter((file) => getMediaCategory(file) !== "image");
  const [preview, setPreview] = useState<AttachmentData>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const openPreview = (file: AttachmentData) => {
    setPreview(file);
    setPreviewOpen(true);
  };

  const copyText = () => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => undefined);
  };

  return (
    <Message className="gap-1.5" from="user">
      {text && (
        <MessageContent className="max-w-full">
          <MessageResponse>{text}</MessageResponse>
        </MessageContent>
      )}
      {imageFiles.length > 0 && (
        <Attachments className="ml-auto max-w-full justify-end" variant="grid">
          {imageFiles.map((file) => (
            <Attachment
              aria-label={t("s_f14ca938f0", { p0: file.filename ?? t("s_99f6fe6c41") })}
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
            /*
             * A chip that names a file in this project opens it, exactly like the reference chip
             * above the composer — selecting the range when the attachment was a selection. These
             * used to be inert: the file was right there in the message and clicking it did
             * nothing. Anything else keeps the preview dialog, since there is nowhere to go.
             */
            const source = attachmentSource(file.mediaType);
            const activate = source
              ? () => void ideaApi.navigate({
                column: 1,
                endLine: source.lineRange?.end,
                line: source.lineRange?.start ?? 1,
                path: source.path,
                selectInProject: baseMediaType(file.mediaType) === "text/x-idea-directory",
              }).catch(() => undefined)
              : ideaAttachment ? undefined : () => openPreview(file);
            const attachmentProps = activate
              ? {
                className: "h-10 max-w-[min(100%,19rem)] cursor-pointer gap-2 rounded-md border-0 bg-secondary/75 px-1.5 shadow-none hover:bg-secondary",
                onClick: activate,
                onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate();
                  }
                },
                role: "button" as const,
                tabIndex: 0,
              }
              : { className: "h-10 max-w-[min(100%,19rem)] gap-2 rounded-md border-0 bg-secondary/75 px-1.5 shadow-none hover:bg-secondary" };
            return (
              <Attachment
                aria-label={ideaAttachment ? `${file.filename ?? t("s_99f6fe6c41")}，${attachmentDescription(file)}` : t("s_f14ca938f0", { p0: file.filename ?? t("s_99f6fe6c41") })}
                data={file}
                key={file.id}
                {...attachmentProps}
              >
                <AttachmentPreview
                  className="size-8 bg-muted/70 [&>svg]:size-4"
                  fallbackIcon={baseMediaType(file.mediaType) === "text/x-idea-directory" ? <FolderOpen className="size-4 text-muted-foreground" /> : <FileCode2 className="size-4 text-muted-foreground" />}
                />
                <AttachmentInfo className="text-xs leading-4" description={attachmentDescription(file)} />
              </Attachment>
            );
          })}
        </Attachments>
      )}
      {/* Last child on purpose: attachments render above it, so a message with files can never
          cover the button. The row keeps its height whether or not the button is visible, so
          hovering a message does not shift the conversation under the pointer. */}
      {text && (
        <div className="ml-auto flex h-6 items-center">
          <Button
            aria-label={t("message.copy")}
            className="size-6 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            onClick={copyText}
            size="icon-sm"
            title={copied ? t("message.copied") : t("message.copy")}
            type="button"
            variant="ghost"
          >
            {copied ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      )}
      <AttachmentPreviewDialog attachment={preview?.type === "file" ? preview : undefined} onOpenChange={setPreviewOpen} open={previewOpen} />
    </Message>
  );
}
