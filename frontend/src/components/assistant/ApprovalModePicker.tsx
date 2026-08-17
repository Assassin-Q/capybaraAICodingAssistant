import { useState } from "react";
import { Check, ChevronDown, ShieldCheck, ShieldQuestion, Sparkles } from "lucide-react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { approvalModeOptions, type ApprovalMode } from "@/lib/approvalMode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useAssistantOverlayDismiss } from "@/lib/assistantOverlays";

const modeIcon = (mode: ApprovalMode) => {
  if (mode === "full") return ShieldCheck;
  if (mode === "auto") return Sparkles;
  return ShieldQuestion;
};

export function ApprovalModePicker({
  className,
  onChange,
  value,
}: {
  className?: string;
  onChange: (value: ApprovalMode) => void;
  value: ApprovalMode;
}) {
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ApprovalMode | null>(null);
  const selected = approvalModeOptions().find((item) => item.id === value) ?? approvalModeOptions()[0];
  const SelectedIcon = modeIcon((selected?.id ?? "ask") as ApprovalMode);

  const moveActive = (direction: 1 | -1) => {
    const currentIndex = approvalModeOptions().findIndex((option) => option.id === activeMode);
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : approvalModeOptions().length - 1)
      : (currentIndex + direction + approvalModeOptions().length) % approvalModeOptions().length;
    setActiveMode(approvalModeOptions()[nextIndex]?.id ?? null);
  };

  const close = () => {
    setActiveMode(null);
    setOpen(false);
  };
  useAssistantOverlayDismiss(close);

  return (
    <ModelSelector
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setActiveMode(null);
      }}
      open={open}
    >
      <ModelSelectorTrigger asChild>
        <Button
          aria-label={t("s_af1dd55710", { p0: selected?.label ?? "" })}
          className={cn("h-7 max-w-[8.5rem] gap-1.5 rounded-full bg-muted/55 px-2 text-[11px] font-normal hover:bg-muted", className)}
          size="sm"
          title={selected ? t("s_480773099d", { p0: selected.label, p1: selected.description }) : t("s_1072712e57")}
          type="button"
          variant="ghost"
        >
          <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected?.label ?? t("s_1072712e57")}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        className="w-[min(21rem,calc(100vw-1rem))] border-border/50 shadow-lg"
        key={open ? "approval-open" : "approval-closed"}
        onKeyDownCapture={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            moveActive(event.key === "ArrowDown" ? 1 : -1);
            return;
          }
          if (event.key === "Enter" && activeMode) {
            event.preventDefault();
            event.stopPropagation();
            onChange(activeMode);
            close();
          }
        }}
        onMouseLeave={() => setActiveMode(null)}
        title={t("s_820c291999")}
      >
        <ModelSelectorList className="p-1">
          <ModelSelectorGroup heading={t("s_1072712e57")}>
            {approvalModeOptions().map((option) => {
              const Icon = modeIcon(option.id);
              return (
                <ModelSelectorItem
                  className={cn(
                    "items-start gap-2 py-1.5 data-[selected=true]:bg-transparent data-[selected=true]:text-foreground",
                    activeMode === option.id && "bg-accent! text-accent-foreground!",
                  )}
                  key={option.id}
                  onMouseMove={() => setActiveMode(option.id)}
                  onSelect={() => {
                    onChange(option.id);
                    close();
                  }}
                  value={`${option.label} ${option.description}`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <ModelSelectorName className="text-xs font-medium">{option.label}</ModelSelectorName>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{option.description}</p>
                  </div>
                  {option.id === value && <Check className="mt-0.5 size-3.5 shrink-0" />}
                </ModelSelectorItem>
              );
            })}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
