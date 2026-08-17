import { Bot, FileCode2, FolderOpen, Server, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContextChip as ContextChipData } from "@/components/assistant/shared";
import { ideaApi } from "@/lib/idea";
import { t } from "@/lib/i18n";

const baseName = (value: string): string =>
  value.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? value;

export function ContextChip({ context, onRemove }: { context: ContextChipData; onRemove: () => void }) {
  const fullPath = context.fileName ?? t("s_208eed345a");
  const displayName = context.kind === "skill" || context.kind === "agent" || context.kind === "mcp"
    ? fullPath
    : baseName(fullPath);
  const lineRange = context.lineRange
    ? `${context.lineRange.start}${context.lineRange.end !== context.lineRange.start ? `-${context.lineRange.end}` : ""}`
    : "";
  // Brackets on the chip, where the range reads as a label of its own; the colon form stays in
  // the location string, which is the conventional `path:line` an editor understands.
  const lineLabel = lineRange ? `[${lineRange}]` : "";
  const fullLocation = `${fullPath}${lineRange ? `:${lineRange}` : ""}`;
  const Icon = context.kind === "agent"
    ? Bot
    : context.kind === "mcp"
      ? Server
      : context.kind === "skill"
        ? Sparkles
        : context.kind === "directory"
          ? FolderOpen
          : FileCode2;
  const kindLabel = context.kind === "skill"
    ? t("skill.chipLabel")
    : context.kind === "mcp"
      ? "MCP"
      : context.kind === "agent"
        ? t("s_16bb55f008")
        : context.kind === "directory"
          ? t("s_46ecac2910")
          : context.kind === "selection"
            ? t("s_41f497eb47")
            : t("s_49deaf7da2");
  const canNavigate = Boolean(context.fileName)
    && context.kind !== "skill"
    && context.kind !== "agent"
    && context.kind !== "mcp";
  const navigate = () => {
    if (!canNavigate || !context.fileName) return;
    void ideaApi.navigate({
      column: 1,
      // The chip stands for a region, so the editor selects it rather than only landing on
      // its first line.
      endLine: context.lineRange?.end,
      line: context.lineRange?.start ?? 1,
      path: context.fileName,
      selectInProject: context.kind === "directory",
    }).catch(() => undefined);
  };

  return (
    <div className="group flex min-w-0 max-w-full items-center gap-1 rounded-md bg-muted/45 px-1.5 py-1 text-xs text-muted-foreground">
      <button
        aria-label={`${kindLabel}: ${fullLocation}`}
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded px-0.5 text-left outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-default"
        disabled={!canNavigate}
        onClick={navigate}
        title={fullLocation}
        type="button"
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{displayName}</span>
        {lineLabel && <span className="shrink-0 font-mono text-[10px] text-foreground/75">{lineLabel}</span>}
        <span className="shrink-0 text-[10px] text-muted-foreground">{kindLabel}</span>
      </button>
      <Button
        aria-label={t("s_6cf73fcf0c")}
        className="-mr-1 size-5 shrink-0"
        onClick={onRemove}
        size="icon"
        title={t("s_6cf73fcf0c")}
        type="button"
        variant="ghost"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
