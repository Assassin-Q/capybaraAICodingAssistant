import { CornerDownRight, FileText, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PromptInputFile, PromptInputMessage } from "@/components/ai-elements/prompt-input";

export interface QueuedPrompt extends PromptInputMessage {
  id: string;
}

interface PromptQueueProps {
  items: QueuedPrompt[];
  onClear: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: QueuedPrompt) => void;
}

const previewText = (item: QueuedPrompt): string => {
  const text = item.text.trim();
  if (text) return text;
  if (item.files.length === 1) return item.files[0].filename ?? "附件";
  return `${item.files.length} 个附件`;
};

const fileLabel = (file: PromptInputFile): string => file.filename ?? file.file.name;

function QueueAttachment({ file }: { file: PromptInputFile }) {
  const isImage = (file.mediaType ?? file.file.type).startsWith("image/");
  if (isImage && file.url) {
    return <img alt="" className="size-8 shrink-0 rounded-md object-cover" src={file.url} />;
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/75 text-muted-foreground">
      <FileText className="size-3.5" />
    </span>
  );
}

export function PromptQueue({ items, onClear, onDelete, onEdit }: PromptQueueProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="待发送消息" className="mb-2 space-y-1">
      {items.length > 1 && (
        <div className="flex h-6 items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>待发送 {items.length} 条</span>
          <Button aria-label="清空待发送消息" className="h-6 gap-1 px-1.5 text-[10px]" onClick={onClear} size="sm" type="button" variant="ghost">
            <X className="size-3" />清空
          </Button>
        </div>
      )}
      {items.map((item) => (
        <div className="group/queue flex min-w-0 items-center gap-2 rounded-lg bg-muted/45 px-2 py-1.5 ring-1 ring-border/20" key={item.id}>
          {item.files[0] && <QueueAttachment file={item.files[0]} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs leading-5">{previewText(item)}</p>
            {item.files.length > 0 && (
              <p className="truncate text-[10px] leading-4 text-muted-foreground">
                {item.files.map(fileLabel).join("、")}
              </p>
            )}
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
            <CornerDownRight className="size-3" />排队
          </span>
          <Button aria-label="编辑待发送消息" className="size-7 shrink-0 text-muted-foreground opacity-70 hover:bg-background/70 hover:text-foreground group-hover/queue:opacity-100" onClick={() => onEdit(item)} size="icon" title="编辑" type="button" variant="ghost">
            <Pencil className="size-3.5" />
          </Button>
          <Button aria-label="删除待发送消息" className="size-7 shrink-0 text-muted-foreground opacity-70 hover:bg-background/70 hover:text-foreground group-hover/queue:opacity-100" onClick={() => onDelete(item.id)} size="icon" title="删除" type="button" variant="ghost">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </section>
  );
}
