import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface PreviewableAttachment {
  file?: File;
  filename?: string;
  mediaType?: string;
  url?: string;
}

interface AttachmentPreviewDialogProps {
  attachment?: PreviewableAttachment;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const textExtensions = new Set(["csv", "json", "jsonc", "log", "md", "mdx", "txt", "xml", "yaml", "yml"]);

const isTextAttachment = (attachment: PreviewableAttachment): boolean => {
  if (attachment.mediaType?.startsWith("text/")) return true;
  if (attachment.mediaType === "application/json" || attachment.mediaType === "application/xml") return true;
  const extension = attachment.filename?.split(".").pop()?.toLowerCase();
  return Boolean(extension && textExtensions.has(extension));
};

const readAttachmentText = async (attachment: PreviewableAttachment): Promise<string> => {
  if (attachment.file) return attachment.file.text();
  if (!attachment.url) throw new Error("附件地址不可用");
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`读取附件失败（${response.status}）`);
  return response.text();
};

export function AttachmentPreviewDialog({ attachment, onOpenChange, open }: AttachmentPreviewDialogProps) {
  const [text, setText] = useState("");
  const [textError, setTextError] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const image = Boolean(attachment?.mediaType?.startsWith("image/") && attachment.url);
  const textFile = Boolean(attachment && isTextAttachment(attachment));

  useEffect(() => {
    if (!open || !attachment || !textFile) return;
    let cancelled = false;
    setText("");
    setTextError("");
    setTextLoading(true);
    void readAttachmentText(attachment)
      .then((content) => {
        if (!cancelled) setText(content);
      })
      .catch((error: unknown) => {
        if (!cancelled) setTextError(error instanceof Error ? error.message : "读取附件失败");
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment, open, textFile]);

  if (!open || !attachment) return null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={cn(
        "max-h-[90vh] gap-0 overflow-hidden border-border/50 p-0 shadow-lg",
        image ? "w-fit max-w-[min(90vw,64rem)]" : "max-w-[min(90vw,52rem)]"
      )}>
        <DialogTitle className={cn("truncate px-4 pt-4 pr-12 text-sm font-medium", image && "sr-only")}>
          {attachment.filename ?? "附件预览"}
        </DialogTitle>
        {image ? (
          <img
            alt={attachment.filename ?? "图片附件"}
            className="max-h-[86vh] max-w-full object-contain"
            src={attachment.url}
          />
        ) : textFile ? (
          <div className="mt-3 min-h-0 border-t border-border/50 bg-muted/25">
            {textLoading ? (
              <div className="flex min-h-40 items-center justify-center text-muted-foreground">
                <Spinner className="size-4" />
              </div>
            ) : textError ? (
              <div className="flex min-h-40 items-center justify-center px-6 text-sm text-destructive">{textError}</div>
            ) : (
              <pre className="max-h-[76vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground">{text}</pre>
            )}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center px-6 text-sm text-muted-foreground">当前附件类型暂不支持预览</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
