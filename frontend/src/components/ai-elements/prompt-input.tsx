import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps, FormEvent, FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { FileUIPart } from "ai";
import { CornerDownLeft, Paperclip, Square, X } from "lucide-react";

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { AttachmentPreviewDialog } from "@/components/ai-elements/attachment-preview-dialog";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type PromptInputFile = FileUIPart & { id: string; file: File };

export interface PromptInputMessage {
  text: string;
  files: PromptInputFile[];
}

export type PromptStatus = "ready" | "submitted" | "streaming" | "error";

const LONG_PASTE_CHARACTER_LIMIT = 4_000;
const LONG_PASTE_LINE_LIMIT = 120;

interface PromptInputContextValue {
  text: string;
  setText: (text: string) => void;
  files: PromptInputFile[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  openFileDialog: () => void;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

const usePromptInput = (): PromptInputContextValue => {
  const context = useContext(PromptInputContext);
  if (!context) {
    throw new Error("PromptInput children must be rendered inside PromptInput");
  }
  return context;
};

export interface PromptInputProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => boolean | void | Promise<boolean | void>;
  onTextChange?: (text: string) => void;
  text?: string;
}

const inferMediaType = (file: File): string => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const imageTypes: Record<string, string> = {
    avif: "image/avif",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return extension && imageTypes[extension] ? imageTypes[extension] : "application/octet-stream";
};

const shouldAttachPastedText = (text: string): boolean =>
  text.length > LONG_PASTE_CHARACTER_LIMIT || text.split(/\r?\n/).length > LONG_PASTE_LINE_LIMIT;

const pastedTextFilename = (): string => {
  const now = new Date();
  const part = (value: number): string => value.toString().padStart(2, "0");
  return `粘贴内容-${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}.txt`;
};

const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const attachmentDetail = (file: PromptInputFile): string => {
  const extension = file.filename?.split(".").pop()?.toUpperCase() || "FILE";
  return `${extension} · ${formatFileSize(file.file.size)}`;
};

export function PromptInput({ className, children, onDragOver, onDrop, onPaste, onSubmit, onTextChange, text: controlledText, ...props }: PromptInputProps) {
  const [uncontrolledText, setUncontrolledText] = useState("");
  const [files, setFiles] = useState<PromptInputFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const submitting = useRef(false);
  const text = controlledText ?? uncontrolledText;

  const setText = useCallback((nextText: string) => {
    if (controlledText === undefined) setUncontrolledText(nextText);
    onTextChange?.(nextText);
  }, [controlledText, onTextChange]);

  const removeFile = useCallback((id: string) => {
    setFiles((current) => {
      return current.filter((file) => file.id !== id);
    });
  }, []);

  const addFiles = useCallback((nextFiles: FileList | File[]) => {
    const additions = Array.from(nextFiles).map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return {
        file,
        filename: file.name,
        id: `${Date.now()}-${index}-${file.name}`,
        mediaType: inferMediaType(file),
        type: "file" as const,
        url,
      };
    });
    setFiles((current) => {
      const combined = [...current, ...additions];
      combined.slice(8).forEach((file) => {
        URL.revokeObjectURL(file.url);
        objectUrls.current.delete(file.url);
      });
      return combined.slice(0, 8);
    });
  }, []);

  const clearFiles = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setFiles([]);
  }, []);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!text.trim() && files.length === 0) {
      return;
    }
    const message = { text, files };
    submitting.current = true;
    try {
      const accepted = await onSubmit(message, event);
      if (accepted === false) return;
      setText("");
      clearFiles();
    } catch {
      // The caller presents the failure; retain the draft so it can be corrected and resent.
    } finally {
      submitting.current = false;
    }
  };

  return (
    <PromptInputContext.Provider value={{
      addFiles,
      files,
      openFileDialog: () => inputRef.current?.click(),
      removeFile,
      setText,
      text,
    }}>
      <form
        className={cn("w-full", className)}
        onDragOver={(event) => {
          onDragOver?.(event);
          if (!event.defaultPrevented && event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          onDrop?.(event);
          if (!event.defaultPrevented && event.dataTransfer.files.length > 0) {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }
        }}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          if (event.clipboardData.files.length > 0) {
            event.preventDefault();
            addFiles(event.clipboardData.files);
            return;
          }
          const pastedText = event.clipboardData.getData("text/plain");
          if (pastedText && shouldAttachPastedText(pastedText)) {
            event.preventDefault();
            addFiles([new File([pastedText], pastedTextFilename(), {
              lastModified: Date.now(),
              type: "text/plain;charset=utf-8",
            })]);
          }
        }}
        onSubmit={handleSubmit}
        {...props}
      >
        <input
          className="hidden"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              addFiles(event.target.files);
            }
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        <InputGroup className="border-0 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-border/70">{children}</InputGroup>
      </form>
    </PromptInputContext.Provider>
  );
}

export function PromptInputTextarea({ className, onChange, onKeyDown, onCompositionStart, onCompositionEnd, ...props }: ComponentProps<"textarea">) {
  const { setText, text } = usePromptInput();
  const isComposing = useRef(false);
  return (
    <InputGroupTextarea
      {...props}
      className={cn("min-h-14 max-h-32 overflow-y-auto", className)}
      onChange={(event) => {
        setText(event.target.value);
        onChange?.(event);
      }}
      onCompositionEnd={(event) => {
        isComposing.current = false;
        onCompositionEnd?.(event);
      }}
      onCompositionStart={(event) => {
        isComposing.current = true;
        onCompositionStart?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.nativeEvent.isComposing) {
          return;
        }
        if (isComposing.current || event.keyCode === 229) {
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      value={text}
    />
  );
}

export function PromptInputFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}

export function PromptInputAttachments({ className }: { className?: string }) {
  const { files, removeFile } = usePromptInput();
  const [previewFile, setPreviewFile] = useState<PromptInputFile>();
  const [previewOpen, setPreviewOpen] = useState(false);

  if (files.length === 0) {
    return null;
  }
  return (
    <>
      <Attachments className={cn("w-full self-start justify-start px-2 pt-2", className)} variant="inline">
      {files.map((file) => (
          <Attachment
            aria-label={`预览 ${file.filename ?? "附件"}`}
            className="h-11 max-w-[min(100%,19rem)] gap-2 border-0 bg-muted/60 px-2 pr-1.5 shadow-none hover:bg-muted"
            data={file}
            key={file.id}
            onClick={() => {
              setPreviewFile(file);
              setPreviewOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setPreviewFile(file);
                setPreviewOpen(true);
              }
            }}
            onRemove={() => removeFile(file.id)}
            role="button"
            tabIndex={0}
          >
            <AttachmentPreview className="size-8 bg-background/75 [&>svg]:size-4" />
            <AttachmentInfo className="text-xs leading-4" description={attachmentDetail(file)} />
            <AttachmentRemove className="size-6 shrink-0 opacity-100 [&>svg]:size-3" label="移除附件" />
          </Attachment>
      ))}
      </Attachments>
      <AttachmentPreviewDialog attachment={previewFile} onOpenChange={setPreviewOpen} open={previewOpen} />
    </>
  );
}

export function PromptInputAttachmentButton({ className, ...props }: Omit<ComponentProps<typeof InputGroupButton>, "size">) {
  const { openFileDialog } = usePromptInput();
  return (
    <InputGroupButton
      aria-label="添加附件"
      className={cn("size-8", className)}
      onClick={openFileDialog}
      size="icon-sm"
      type="button"
      {...props}
    >
      <Paperclip className="size-3.5" />
    </InputGroupButton>
  );
}

export interface PromptInputSubmitProps extends Omit<ComponentProps<typeof InputGroupButton>, "size"> {
  status?: PromptStatus;
  onStop?: () => void;
  children?: ReactNode;
}

export function PromptInputSubmit({ className, children, onClick, onStop, status, ...props }: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming";
  const icon = status === "submitted"
    ? <Spinner />
    : status === "streaming"
      ? <Square className="size-3.5" />
      : status === "error"
        ? <X className="size-3.5" />
        : <CornerDownLeft className="size-3.5" />;

  return (
    <InputGroupButton
      {...props}
      className={cn("size-8", className)}
      onClick={(event) => {
        if (isGenerating && onStop) {
          event.preventDefault();
          onStop();
          return;
        }
        onClick?.(event);
      }}
      size="icon-sm"
      type="submit"
    >
      {children ?? icon}
    </InputGroupButton>
  );
}
