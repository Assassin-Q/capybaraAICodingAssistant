import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  activeVariantBody,
  variantIDs,
} from "@/components/assistant/modelVariantConfig";
import type { ModelVariantMap } from "@/components/assistant/modelVariantConfig";
import { variantLabel } from "@/components/assistant/modelVariants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ModelVariantEditorProps {
  effective: ModelVariantMap;
  labels: Record<string, string>;
  onChange: (variants: ModelVariantMap) => void;
  onLabelsChange: (labels: Record<string, string>) => void;
  overrides: ModelVariantMap;
}

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export function ModelVariantEditor({
  effective,
  labels,
  onChange,
  onLabelsChange,
  overrides,
}: ModelVariantEditorProps) {
  const [newVariantID, setNewVariantID] = useState("");
  const [newVariantLabel, setNewVariantLabel] = useState("");
  const ids = variantIDs(effective, overrides);
  const trimmedNewID = newVariantID.trim();
  const trimmedNewLabel = newVariantLabel.trim();
  const canAdd = Boolean(
    trimmedNewID
    && trimmedNewLabel
    && trimmedNewID !== "default"
    && !ids.includes(trimmedNewID)
  );

  const addVariant = () => {
    if (!canAdd) return;
    onChange({ ...overrides, [trimmedNewID]: {} });
    onLabelsChange({ ...labels, [trimmedNewID]: trimmedNewLabel });
    setNewVariantID("");
    setNewVariantLabel("");
  };

  const updateLabel = (id: string, label: string) => {
    onLabelsChange({ ...labels, [id]: label });
  };

  const disableVariant = (id: string) => {
    onChange({ ...overrides, [id]: { ...activeVariantBody(id, effective, overrides), disabled: true } });
  };

  const clearOverride = (id: string) => {
    const nextOverrides = { ...overrides };
    delete nextOverrides[id];
    onChange(nextOverrides);
    if (!hasOwn(effective, id)) {
      const nextLabels = { ...labels };
      delete nextLabels[id];
      onLabelsChange(nextLabels);
    }
  };

  return (
    <section className="grid gap-3">
      <div>
        <p className="text-xs font-medium">思考档位</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          档位能力来自 OpenCode；这里只维护档位 key 和界面显示名称。
        </p>
      </div>

      <div className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(7rem,1.2fr)_2rem] items-end gap-2">
        <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground">
          档位 key
          <Input
            className="h-8 min-w-0 font-mono text-xs"
            onChange={(event) => setNewVariantID(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addVariant();
              }
            }}
            placeholder="例如 high"
            value={newVariantID}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground">
          显示名称
          <Input
            className="h-8 min-w-0 text-xs"
            onChange={(event) => setNewVariantLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addVariant();
              }
            }}
            placeholder="例如 高"
            value={newVariantLabel}
          />
        </label>
        <Button
          aria-label="添加思考档位"
          className="size-8"
          disabled={!canAdd}
          onClick={addVariant}
          size="icon-sm"
          title="添加档位"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="divide-y divide-border/40 bg-muted/20">
        <div className="grid min-h-11 grid-cols-[minmax(6rem,0.8fr)_minmax(7rem,1.2fr)_auto] items-center gap-2 px-3 py-2">
          <Input className="h-8 min-w-0 font-mono text-xs" disabled value="default" />
          <Input className="h-8 min-w-0 text-xs" disabled value="默认" />
          <Badge className="justify-self-end text-[10px] font-normal" variant="secondary">系统</Badge>
        </div>
        {ids.map((id) => {
          const body = activeVariantBody(id, effective, overrides);
          const disabled = body.disabled === true;
          const hasOverride = hasOwn(overrides, id);
          const displayLabel = hasOwn(labels, id) ? labels[id] : variantLabel(id);
          return (
            <div
              className={cn(
                "grid min-h-11 grid-cols-[minmax(6rem,0.8fr)_minmax(7rem,1.2fr)_auto] items-center gap-2 px-3 py-2",
                disabled && "opacity-60"
              )}
              key={id}
            >
              <Input className="h-8 min-w-0 font-mono text-xs" disabled value={id} />
              <Input
                aria-label={`${id} 的显示名称`}
                className="h-8 min-w-0 text-xs"
                disabled={disabled}
                onChange={(event) => updateLabel(id, event.target.value)}
                placeholder={variantLabel(id)}
                value={displayLabel}
              />
              <div className="flex items-center justify-end gap-1">
                <Badge className="hidden text-[10px] font-normal sm:inline-flex" variant="secondary">
                  {disabled ? "已停用" : hasOverride ? "用户配置" : "OpenCode"}
                </Badge>
                {hasOverride && (
                  <Button
                    aria-label={`清除档位 ${id} 的用户配置`}
                    className="size-7"
                    onClick={() => clearOverride(id)}
                    size="icon-sm"
                    title="恢复 OpenCode 配置"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
                {!disabled && (
                  <Button
                    aria-label={`停用档位 ${id}`}
                    className="size-7"
                    onClick={() => disableVariant(id)}
                    size="icon-sm"
                    title="停用档位"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {ids.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            当前模型没有可用档位，可以在上方添加档位 key 和显示名称。
          </p>
        )}
      </div>
    </section>
  );
}
