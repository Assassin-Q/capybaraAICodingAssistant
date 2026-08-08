import type { ModelInfo, ModelRef } from "@/lib/opencode";

const VARIANT_LABELS: Record<string, string> = {
  default: "默认",
  high: "高",
  low: "低",
  max: "极高",
  medium: "中",
  minimal: "极低",
  none: "关闭",
  thinking: "思考",
  xhigh: "超高",
};

export const variantLabel = (value?: string): string => {
  if (!value || value === "default") return VARIANT_LABELS.default;
  return VARIANT_LABELS[value.toLowerCase()] ?? value;
};

export const modelVariantIDs = (model?: ModelInfo): string[] =>
  model?.variants
    ? [...new Set(Object.keys(model.variants).filter((variant) => variant !== "default"))]
    : [];

export const modelSupportsVariant = (model: ModelInfo | undefined, variant?: string): boolean =>
  !variant || variant === "default" || modelVariantIDs(model).includes(variant);

export const modelRefWithAvailableVariant = (
  model: ModelInfo,
  variant?: string,
): ModelRef => ({
  id: model.id,
  providerID: model.providerID,
  ...(modelSupportsVariant(model, variant) && variant && variant !== "default" ? { variant } : {}),
});
