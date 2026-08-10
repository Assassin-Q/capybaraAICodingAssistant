import { useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Cpu, Gauge, SlidersHorizontal } from "lucide-react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { variantLabel } from "@/components/assistant/modelVariants";
import { modelKey } from "@/components/assistant/shared";
import type { AgentInfo, ModelInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface ModelPickerProps {
  className?: string;
  models: ModelInfo[];
  onManage?: () => void;
  onChange: (value: string) => void;
  value: string;
}

const providerLabel = (providerID: string): string => {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    opencode: "OpenCode",
    openai: "OpenAI",
  };
  return labels[providerID] ?? providerID;
};

export function ModelPicker({ className, models, onManage, onChange, value }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const selected = models.find((model) => modelKey(model) === value);
  const grouped = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    models.forEach((model) => groups.set(model.providerID, [...(groups.get(model.providerID) ?? []), model]));
    return [...groups.entries()]
      .map(([id, providerModels]) => [id, providerModels.sort((left, right) => left.name.localeCompare(right.name))] as const)
      .sort(([left], [right]) => providerLabel(left).localeCompare(providerLabel(right)));
  }, [models]);

  return (
    <ModelSelector onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setHasInteracted(false); }} open={open}>
      <ModelSelectorTrigger asChild>
        <Button aria-label={t("s_4e769dd289")} className={cn("h-7 min-w-0 max-w-[13rem] gap-1 rounded-md bg-transparent px-1.5 text-[11px] hover:bg-muted/70", className)} size="sm" title={t("s_4e769dd289")} type="button" variant="ghost">
          <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected?.name ?? t("s_4e769dd289")}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true); }} title={t("s_4e769dd289")}>
        <ModelSelectorInput autoFocus placeholder={t("s_df55862785")} />
        <ModelSelectorList className="max-h-[min(56vh,24rem)] py-1">
          <ModelSelectorEmpty>{t("s_c4955439d0")}</ModelSelectorEmpty>
          {grouped.map(([id, providerModels]) => (
            <ModelSelectorGroup heading={providerLabel(id)} key={id}>
              {providerModels.map((model) => {
                  const key = modelKey(model);
                  return (
                    <ModelSelectorItem className={cn("min-h-9", open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")} key={key} onMouseMove={() => setHasInteracted(true)} onSelect={() => { onChange(key); setOpen(false); }} value={model.name + " " + key}>
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      {model.status === "active" && id.includes("free") && <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">{t("s_aa571eee00")}</Badge>}
                      {model.family && <span className="max-w-24 truncate text-[10px] text-muted-foreground">{model.family}</span>}
                      {key === value && <Check className="ml-1 size-3.5 shrink-0" />}
                    </ModelSelectorItem>
                  );
                })}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
        {onManage && (
          <div className="border-t border-border/50 p-1">
            <Button className="h-8 w-full justify-start gap-2 px-2 text-xs" onClick={() => { setOpen(false); onManage(); }} type="button" variant="ghost">
              <SlidersHorizontal className="size-3.5" />
              {t("s_1d1e297e8c")}
            </Button>
          </div>
        )}
      </ModelSelectorContent>
    </ModelSelector>
  );
}

interface VariantPickerProps {
  className?: string;
  /** Only offer 默认 when the model actually declares a "default" variant. */
  hasDefault?: boolean;
  labels?: Record<string, string>;
  onChange: (value: string | undefined) => void;
  value?: string;
  variants: string[];
}

export function VariantPicker({ className, hasDefault = false, labels = {}, onChange, value, variants }: VariantPickerProps) {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const providerVariants = [...new Set(variants.filter((variant) => variant !== "default"))];
  if (providerVariants.length === 0) return null;
  // A model that publishes no "default" level has no such thing to fall back to — offering it
  // sent an unknown variant to the provider.
  const options = hasDefault ? ["default", ...providerVariants] : providerVariants;
  const selectedValue = value && options.includes(value) ? value : options[0] ?? "default";
  const displayLabel = (option: string): string => labels[option]?.trim() || variantLabel(option);
  return (
    <ModelSelector onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setHasInteracted(false); }} open={open}>
      <ModelSelectorTrigger asChild>
        <Button aria-label={t("s_00487b9418")} className={cn("h-7 min-w-14 gap-1 rounded-md bg-transparent px-1.5 text-[11px] hover:bg-muted/70", className)} size="sm" title={t("s_00487b9418")} type="button" variant="ghost">
          <Gauge className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{displayLabel(selectedValue)}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="w-[calc(100vw-1rem)] max-w-xs" onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true); }} title={t("s_00487b9418")}>
        <ModelSelectorList>
          <ModelSelectorGroup heading={t("s_6164ce65e8")}>
            {options.map((option) => (
              <ModelSelectorItem className={cn(open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")} key={option} onMouseMove={() => setHasInteracted(true)} onSelect={() => { onChange(option === "default" ? undefined : option); setOpen(false); }} value={option}>
                <ModelSelectorName>{displayLabel(option)}</ModelSelectorName>
                <span className="font-mono text-[10px] text-muted-foreground">{option}</span>
                {option === selectedValue && <Check className="ml-1 size-3.5 shrink-0" />}
              </ModelSelectorItem>
            ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

interface AgentPickerProps {
  agents: AgentInfo[];
  className?: string;
  onChange: (value: string) => void;
  value: string;
}

export function AgentPicker({ agents, className, onChange, value }: AgentPickerProps) {
  const primaryAgents = useMemo(
    () => agents.filter((agent) => !agent.hidden && !agent.disabled && agent.mode === "primary"),
    [agents]
  );
  const selectedIndex = Math.max(0, primaryAgents.findIndex((agent) => agent.id === value));
  const selected = primaryAgents[selectedIndex] ?? primaryAgents[0];
  const cycle = () => {
    if (primaryAgents.length === 0) return;
    onChange(primaryAgents[(selectedIndex + 1) % primaryAgents.length].id);
  };

  if (!selected) return null;
  const statusColor = selected.id.toLowerCase().includes("plan") ? "bg-amber-500" : "bg-emerald-500";
  return (
    <Button
      aria-label={t("s_ec6202b53b", { p0: selected.id })}
      className={cn("h-7 max-w-[9rem] gap-1.5 rounded-full bg-muted/55 px-2 text-[11px] font-normal hover:bg-muted", className)}
      onClick={cycle}
      size="sm"
      title={primaryAgents.length > 1 ? t("s_5e14bf4cc7") : t("s_536ba1bd61", { p0: selected.id })}
      type="button"
      variant="ghost"
    >
      <Bot className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{selected.id}</span>
      {primaryAgents.length > 1 && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", statusColor)} />}
    </Button>
  );
}
