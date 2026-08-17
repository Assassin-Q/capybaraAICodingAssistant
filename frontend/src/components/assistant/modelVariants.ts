import type { ModelInfo, ModelRef } from "@/lib/opencode";
import { t } from "@/lib/i18n";

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const variantLabels = (): Record<string, string> => ({
  default: t("s_c8d09cf955"),
  high: t("s_b096b3f5ac"),
  low: t("s_b9ee259b7f"),
  max: t("s_c34687da2b"),
  medium: t("s_0869071c92"),
  minimal: t("s_db71a9ec61"),
  none: t("s_6c14bd7f6f"),
  thinking: t("s_a6c1499244"),
  xhigh: t("s_e9b58f9ec4"),
});

export const variantLabel = (value?: string): string => {
  if (!value || value === "default") return variantLabels().default;
  return variantLabels()[value.toLowerCase()] ?? value;
};

export const modelVariantIDs = (model?: ModelInfo): string[] =>
  model?.variants
    ? [...new Set(Object.keys(model.variants).filter((variant) => variant !== "default"))]
    : [];

/** True when the model's own config declares a "default" thinking level. */
export const modelHasDefaultVariant = (model?: ModelInfo): boolean =>
  Boolean(model?.variants && Object.prototype.hasOwnProperty.call(model.variants, "default"));

/**
 * Whether the selection is safe to keep.
 *
 * An absent `variants` means the catalogue did not say, which is not the same as saying there are
 * none: `/api/model` is fetched alongside the legacy provider list and a momentary failure there
 * leaves models carrying no variant information at all. Treating that as "unsupported" made the
 * guard silently drop a thinking level the user had picked. An explicitly empty set still means
 * the model has none, so that case is still rejected.
 */
export const modelSupportsVariant = (model: ModelInfo | undefined, variant?: string): boolean =>
  !variant
  || variant === "default"
  || model?.variants === undefined
  || modelVariantIDs(model).includes(variant);

export const modelRefWithAvailableVariant = (
  model: ModelInfo,
  variant?: string,
): ModelRef => ({
  id: model.id,
  providerID: model.providerID,
  ...(modelSupportsVariant(model, variant) && variant && variant !== "default"
    ? { variant }
    : {}),
});
