import { CornerDownRight, FileText, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PromptInputFile, PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { t } from "@/lib/i18n";

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
  if (item.files.length === 1) return item.files[0].filename ?? t("s_99f6fe6c41");
  return t("s_a4a8c0f56c", { p0: item.files.length });
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
    <section aria-label={t("s_221811cad0")} className="mb-2 space-y-1">
      {items.length > 1 && (
        <div className="flex h-6 items-center justify-between px-1 text-[10px] text-muted-foreground">
          <span>{t("s_13bc7a77c4")} {items.length} {t("s_bce2ef6151")}</span>
          <Button aria-label={t("s_4a5a1c9614")} className="h-6 gap-1 px-1.5 text-[10px]" onClick={onClear} size="sm" type="button" variant="ghost">
            <X className="size-3" />{t("s_84fcd70d42")}
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
            <CornerDownRight className="size-3" />{t("s_cfb281f66b")}
          </span>
          <Button aria-label={t("s_1bfc99157e")} className="size-7 shrink-0 text-muted-foreground opacity-70 hover:bg-background/70 hover:text-foreground group-hover/queue:opacity-100" onClick={() => onEdit(item)} size="icon" title={t("s_a7f814c0a4")} type="button" variant="ghost">
            <Pencil className="size-3.5" />
          </Button>
          <Button aria-label={t("s_a015a34564")} className="size-7 shrink-0 text-muted-foreground opacity-70 hover:bg-background/70 hover:text-foreground group-hover/queue:opacity-100" onClick={() => onDelete(item.id)} size="icon" title={t("s_3755f56f2f")} type="button" variant="ghost">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </section>
  );
}
