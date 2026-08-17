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
import { t } from "@/lib/i18n";

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
  /** Isolates unsent attachments between conversation tabs. */
  draftKey?: string;
  /** Lets the attachment store discard files belonging to closed tabs. */
  openDraftKeys?: string[];
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
  return t("s_99565ae69d", { p0: now.getFullYear(), p1: part(now.getMonth() + 1), p2: part(now.getDate()), p3: part(now.getHours()), p4: part(now.getMinutes()), p5: part(now.getSeconds()) });
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

export function PromptInput({ className, children, draftKey = "default", onDragOver, onDrop, onPaste, onSubmit, onTextChange, openDraftKeys, text: controlledText, ...props }: PromptInputProps) {
  const [uncontrolledText, setUncontrolledText] = useState("");
  const [filesByDraft, setFilesByDraft] = useState<Record<string, PromptInputFile[]>>({});
  const files = filesByDraft[draftKey] ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const submitting = useRef(false);
  const text = controlledText ?? uncontrolledText;
  /** Read inside async submit handling, where `text` would be the value captured at submit time. */
  const textRef = useRef(text);
  textRef.current = text;

  const setText = useCallback((nextText: string) => {
    if (controlledText === undefined) setUncontrolledText(nextText);
    onTextChange?.(nextText);
  }, [controlledText, onTextChange]);

  const removeFile = useCallback((id: string) => {
    setFilesByDraft((current) => ({
      ...current,
      [draftKey]: (current[draftKey] ?? []).filter((file) => file.id !== id),
    }));
  }, [draftKey]);

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
    setFilesByDraft((current) => {
      const combined = [...(current[draftKey] ?? []), ...additions];
      combined.slice(8).forEach((file) => {
        URL.revokeObjectURL(file.url);
        objectUrls.current.delete(file.url);
      });
      return { ...current, [draftKey]: combined.slice(0, 8) };
    });
  }, [draftKey]);

  /**
   * Takes the attachments out of the composer without revoking their object URLs, so they can be
   * put back if the send turns out to be rejected. Revoking is [releaseFiles]' job, once the
   * prompt is safely on its way.
   */
  const detachFiles = useCallback(() => {
    setFilesByDraft((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  }, [draftKey]);

  const restoreFiles = useCallback((entries: PromptInputFile[]) => {
    setFilesByDraft((current) => ({ ...current, [draftKey]: entries }));
  }, [draftKey]);

  const releaseFiles = useCallback((entries: PromptInputFile[]) => {
    entries.forEach((file) => {
      URL.revokeObjectURL(file.url);
      objectUrls.current.delete(file.url);
    });
  }, []);

  useEffect(() => {
    if (!openDraftKeys) return;
    const valid = new Set(openDraftKeys);
    setFilesByDraft((current) => {
      const removed = Object.entries(current).filter(([key]) => !valid.has(key));
      if (removed.length === 0) return current;
      removed.forEach(([, entries]) => entries.forEach((file) => {
        URL.revokeObjectURL(file.url);
        objectUrls.current.delete(file.url);
      }));
      return Object.fromEntries(Object.entries(current).filter(([key]) => valid.has(key)));
    });
  }, [openDraftKeys]);

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
    /**
     * The composer empties the moment the prompt is handed over, not when the send finishes.
     *
     * It used to wait for the whole chain, which now includes the vision fallback describing an
     * attached image — several seconds during which the bubble was already in the conversation
     * while the same text and attachment still sat in the box, as if nothing had been sent.
     */
    setText("");
    detachFiles();
    const restoreDraft = () => {
      // Only if the user has not started composing something else in the meantime; their new
      // text outranks a draft we are putting back.
      if (!textRef.current.trim()) setText(message.text);
      if (message.files.length > 0) restoreFiles(message.files);
    };
    try {
      const accepted = await onSubmit(message, event);
      if (accepted === false) restoreDraft();
      else releaseFiles(message.files);
    } catch {
      // The caller presents the failure; the draft comes back so it can be corrected and resent.
      restoreDraft();
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
            aria-label={t("s_f14ca938f0", { p0: file.filename ?? t("s_99f6fe6c41") })}
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
            <AttachmentRemove className="size-6 shrink-0 opacity-100 [&>svg]:size-3" label={t("s_8f3ea228b8")} />
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
      aria-label={t("s_dba9e8228b")}
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
