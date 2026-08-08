import { useEffect, useState } from "react";
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
import { ideaApi } from "@/lib/idea";
import { approvalModeOptions, type ApprovalMode } from "@/lib/approvalMode";
import { cn } from "@/lib/utils";

interface ModeRule {
  id: string;
  label: string;
  allow: string[];
  ask: string[];
}

const modeIcon = (mode: ApprovalMode) => {
  if (mode === "full") return ShieldCheck;
  if (mode === "auto") return Sparkles;
  return ShieldQuestion;
};

/** Fallback used only until the plugin's rules arrive, or when running outside IDEA. */
const fallbackRules: ModeRule[] = approvalModeOptions.map((option) => ({
  allow: [],
  ask: [],
  id: option.id,
  label: option.label,
}));

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
  const [hasInteracted, setHasInteracted] = useState(false);
  const [rules, setRules] = useState<ModeRule[]>(fallbackRules);

  // The plugin owns the enforcement table, so the picker renders from it rather than
  // from a second copy that could drift out of sync.
  useEffect(() => {
    let cancelled = false;
    void ideaApi
      .getApprovalModeRules()
      .then((response) => {
        if (!cancelled && response.modes?.length) setRules(response.modes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = rules.find((item) => item.id === value) ?? rules[0];
  const SelectedIcon = modeIcon((selected?.id ?? "ask") as ApprovalMode);
  const askSummary = (rule: ModeRule) =>
    rule.ask.length > 0 ? `仍需确认：${rule.ask.join("、")}` : "仍需确认：无，全部自动执行";

  return (
    <ModelSelector
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setHasInteracted(false);
      }}
      open={open}
    >
      <ModelSelectorTrigger asChild>
        <Button
          aria-label={`审批模式：${selected?.label ?? ""}`}
          className={cn("h-7 max-w-[8.5rem] gap-1.5 rounded-full bg-muted/55 px-2 text-[11px] font-normal hover:bg-muted", className)}
          size="sm"
          title={selected ? `审批模式：${selected.label}\n自动执行：${selected.allow.join("、")}\n${askSummary(selected)}` : "审批模式"}
          type="button"
          variant="ghost"
        >
          <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected?.label ?? "审批模式"}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        className="w-[min(21rem,calc(100vw-1rem))] border-border/50 shadow-lg"
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true);
        }}
        title="选择审批模式"
      >
        <ModelSelectorList className="p-1">
          <ModelSelectorGroup heading="审批模式">
            {rules.map((rule) => {
              const Icon = modeIcon(rule.id as ApprovalMode);
              return (
                <ModelSelectorItem
                  className={cn("items-start gap-2 py-1.5", open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")}
                  key={rule.id}
                  onMouseMove={() => setHasInteracted(true)}
                  onSelect={() => {
                    onChange(rule.id as ApprovalMode);
                    setOpen(false);
                  }}
                  // Kept off the row to stay compact; hovering reveals what still asks.
                  title={askSummary(rule)}
                  value={`${rule.label} ${rule.allow.join(" ")} ${rule.ask.join(" ")}`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <ModelSelectorName className="text-xs font-medium">{rule.label}</ModelSelectorName>
                    {rule.allow.length > 0 && (
                      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                        自动执行：{rule.allow.join("、")}
                      </p>
                    )}
                  </div>
                  {rule.id === value && <Check className="mt-0.5 size-3.5 shrink-0" />}
                </ModelSelectorItem>
              );
            })}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
