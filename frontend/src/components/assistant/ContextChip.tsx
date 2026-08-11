import { FileCode2, FolderOpen, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { actionLabels } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData } from "@/components/assistant/shared";
import { t } from "@/lib/i18n";

export function ContextChip({ context, onRemove }: { context: ContextChipData; onRemove: () => void }) {
  const location = context.fileName
    ? context.fileName + (context.lineRange ? ":" + context.lineRange.start + "-" + context.lineRange.end : "")
    : t("s_208eed345a");
  // A skill chip shows the skill name, not its file path — every skill file is called SKILL.md.
  const Icon = context.kind === "skill" ? Sparkles : context.kind === "directory" ? FolderOpen : FileCode2;
  const kindLabel = context.kind === "skill" ? t("skill.chipLabel") : context.kind === "directory" ? t("s_46ecac2910") : context.kind === "selection" ? t("s_41f497eb47") : actionLabels()[context.action];
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted/45 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate" title={context.kind === "skill" ? context.content : undefined}>{location}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{kindLabel}</span>
      <Button aria-label={t("s_6cf73fcf0c")} className="-mr-1 size-5 shrink-0" onClick={onRemove} size="icon" title={t("s_6cf73fcf0c")} type="button" variant="ghost"><X className="size-3" /></Button>
    </div>
  );
}
