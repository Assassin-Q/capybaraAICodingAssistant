import { useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Cpu, Gauge, Globe2, SlidersHorizontal } from "lucide-react";

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
        <Button aria-label="选择模型" className={cn("h-7 min-w-0 max-w-[13rem] gap-1 rounded-md bg-transparent px-1.5 text-[11px] hover:bg-muted/70", className)} size="sm" title="选择模型" type="button" variant="ghost">
          <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected?.name ?? "选择模型"}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true); }} title="选择模型">
        <ModelSelectorInput autoFocus placeholder="搜索模型" />
        <ModelSelectorList className="max-h-[min(56vh,24rem)] py-1">
          <ModelSelectorEmpty>没有可用模型</ModelSelectorEmpty>
          {grouped.map(([id, providerModels]) => (
            <ModelSelectorGroup heading={providerLabel(id)} key={id}>
              {providerModels.map((model) => {
                  const key = modelKey(model);
                  return (
                    <ModelSelectorItem className={cn("min-h-9", open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")} key={key} onMouseMove={() => setHasInteracted(true)} onSelect={() => { onChange(key); setOpen(false); }} value={model.name + " " + key}>
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      {model.status === "active" && id.includes("free") && <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">免费</Badge>}
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
              管理模型
            </Button>
          </div>
        )}
      </ModelSelectorContent>
    </ModelSelector>
  );
}

interface VariantPickerProps {
  className?: string;
  onChange: (value: string | undefined) => void;
  value?: string;
  variants: string[];
}

export function VariantPicker({ className, onChange, value, variants }: VariantPickerProps) {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const options = ["default", ...variants.filter((variant) => variant !== "default")];
  return (
    <ModelSelector onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setHasInteracted(false); }} open={open}>
      <ModelSelectorTrigger asChild>
        <Button aria-label="选择思考强度" className={cn("h-7 min-w-14 gap-1 rounded-md bg-transparent px-1.5 text-[11px] hover:bg-muted/70", className)} size="sm" title="选择思考强度" type="button" variant="ghost">
          <Gauge className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{variantLabel(value)}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="w-[calc(100vw-1rem)] max-w-xs" onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) setHasInteracted(true); }} title="选择思考强度">
        <ModelSelectorList>
          <ModelSelectorGroup heading="思考强度">
            {options.map((option) => (
              <ModelSelectorItem className={cn(open && !hasInteracted && "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground")} key={option} onMouseMove={() => setHasInteracted(true)} onSelect={() => { onChange(option === "default" ? undefined : option); setOpen(false); }} value={option}>
                <ModelSelectorName>{variantLabel(option)}</ModelSelectorName>
                {option === "default" && <span className="text-[10px] text-muted-foreground">使用模型默认设置</span>}
                {option === (value ?? "default") && <Check className="ml-1 size-3.5 shrink-0" />}
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
      aria-label={`切换主智能体，当前为 ${selected.id}`}
      className={cn("h-7 max-w-[9rem] gap-1.5 rounded-full bg-muted/55 px-2 text-[11px] font-normal hover:bg-muted", className)}
      onClick={cycle}
      size="sm"
      title={primaryAgents.length > 1 ? "切换主智能体" : `当前智能体：${selected.id}`}
      type="button"
      variant="ghost"
    >
      <Bot className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{selected.id}</span>
      {primaryAgents.length > 1 && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", statusColor)} />}
    </Button>
  );
}

export function NetworkToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <Button
      aria-label={enabled ? "关闭联网" : "开启联网"}
      aria-pressed={enabled}
      className={cn("h-7 gap-1 rounded-md px-1.5 text-[11px] hover:bg-muted/70", enabled && "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15")}
      onClick={() => onChange(!enabled)}
      size="sm"
      title={enabled ? "联网已开启" : "联网已关闭"}
      type="button"
      variant="ghost"
    >
      <Globe2 className="size-3.5" />
      <span>联网</span>
    </Button>
  );
}
