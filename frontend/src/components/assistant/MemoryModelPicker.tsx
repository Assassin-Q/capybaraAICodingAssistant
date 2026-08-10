import { useMemo, useState } from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { modelKey } from "@/components/assistant/shared";
import type { ModelInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface MemoryModelPickerProps {
  disabled?: boolean;
  models: ModelInfo[];
  onChange: (model: ModelInfo) => void;
  value: string;
}

export function MemoryModelPicker({ disabled, models, onChange, value }: MemoryModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const selected = models.find((model) => modelKey(model) === value);
  const grouped = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    models.forEach((model) => groups.set(model.providerID, [...(groups.get(model.providerID) ?? []), model]));
    return [...groups.entries()]
      .map(([providerID, providerModels]) => [
        providerID,
        providerModels.sort((left, right) => left.name.localeCompare(right.name)),
      ] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  }, [models]);

  return (
    <ModelSelector onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setHasInteracted(false); }} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          aria-label={t("s_a66e8eced4")}
          className="h-9 w-full justify-start gap-2 bg-muted/45 px-3 text-xs font-normal hover:bg-muted/70"
          disabled={disabled}
          type="button"
          variant="ghost"
        >
          <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">
            {selected ? `${selected.providerID} / ${selected.name}` : value || t("s_e7afb50375")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        align="start"
        className="w-[min(30rem,calc(100vw-1rem))]"
        onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true); }}
        side="bottom"
        title={t("s_a66e8eced4")}
      >
        <ModelSelectorInput autoFocus placeholder={t("s_6f33db2494")} />
        <ModelSelectorList className="max-h-[min(52vh,22rem)] py-1">
          <ModelSelectorEmpty>{t("s_d89472fe24")}</ModelSelectorEmpty>
          {grouped.map(([providerID, providerModels]) => (
            <ModelSelectorGroup heading={providerID} key={providerID}>
              {providerModels.map((model) => {
                const key = modelKey(model);
                return (
                  <ModelSelectorItem
                    className={cn("min-h-9", open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")}
                    key={key}
                    onMouseMove={() => setHasInteracted(true)}
                    onSelect={() => { onChange(model); setOpen(false); }}
                    value={`${providerID} ${model.name} ${model.id}`}
                  >
                    <ModelSelectorName>{model.name}</ModelSelectorName>
                    <span className="max-w-40 truncate font-mono text-[10px] text-muted-foreground">{model.id}</span>
                    {key === value && <Check className="size-3.5 shrink-0" />}
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
