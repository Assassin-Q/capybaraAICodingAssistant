import { FileCode2, FolderOpen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { actionLabels } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData } from "@/components/assistant/shared";

export function ContextChip({ context, onRemove }: { context: ContextChipData; onRemove: () => void }) {
  const location = context.fileName
    ? context.fileName + (context.lineRange ? ":" + context.lineRange.start + "-" + context.lineRange.end : "")
    : "IDEA 代码片段";
  const Icon = context.kind === "directory" ? FolderOpen : FileCode2;
  const kindLabel = context.kind === "directory" ? "文件夹" : context.kind === "selection" ? "代码片段" : actionLabels[context.action];
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted/45 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{location}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{kindLabel}</span>
      <Button aria-label="移除上下文" className="-mr-1 size-5 shrink-0" onClick={onRemove} size="icon" title="移除上下文" type="button" variant="ghost"><X className="size-3" /></Button>
    </div>
  );
}
