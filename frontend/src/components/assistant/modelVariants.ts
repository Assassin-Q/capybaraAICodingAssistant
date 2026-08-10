import type { ModelInfo, ModelRef } from "@/lib/opencode";
import { t } from "@/lib/i18n";

const VARIANT_LABELS: Record<string, string> = {
  default: t("s_c8d09cf955"),
  high: t("s_b096b3f5ac"),
  low: t("s_b9ee259b7f"),
  max: t("s_c34687da2b"),
  medium: t("s_0869071c92"),
  minimal: t("s_db71a9ec61"),
  none: t("s_6c14bd7f6f"),
  thinking: t("s_a6c1499244"),
  xhigh: t("s_e9b58f9ec4"),
};

export const variantLabel = (value?: string): string => {
  if (!value || value === "default") return VARIANT_LABELS.default;
  return VARIANT_LABELS[value.toLowerCase()] ?? value;
};

export const modelVariantIDs = (model?: ModelInfo): string[] =>
  model?.variants
    ? [...new Set(Object.keys(model.variants).filter((variant) => variant !== "default"))]
    : [];

/** True when the model's own config declares a "default" thinking level. */
export const modelHasDefaultVariant = (model?: ModelInfo): boolean =>
  Boolean(model?.variants && Object.prototype.hasOwnProperty.call(model.variants, "default"));

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
