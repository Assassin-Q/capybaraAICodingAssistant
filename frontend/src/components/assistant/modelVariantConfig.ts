export type ModelVariantMap = Record<string, Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mergeRecords = (
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    result[key] = isRecord(value) && isRecord(result[key])
      ? mergeRecords(result[key] as Record<string, unknown>, value)
      : value;
  });
  return result;
};

export const activeVariantBody = (
  id: string,
  effective: ModelVariantMap,
  overrides: ModelVariantMap
): Record<string, unknown> => {
  const override = overrides[id];
  if (override?.disabled === true) return override;
  return mergeRecords(effective[id] ?? {}, override ?? {});
};

export const variantIDs = (effective: ModelVariantMap, overrides: ModelVariantMap): string[] =>
  [...new Set([...Object.keys(effective), ...Object.keys(overrides)])]
    .filter((id) => id !== "default")
    .sort((left, right) => left.localeCompare(right));

export const normalizedVariantOverrides = (variants: ModelVariantMap): ModelVariantMap | undefined => {
  const entries = Object.entries(variants).filter(([id]) => id.trim() && id !== "default");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
