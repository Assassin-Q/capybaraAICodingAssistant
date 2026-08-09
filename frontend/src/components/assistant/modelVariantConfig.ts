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

/**
 * @param order the user's own ordering (the label map's key order). Anything not listed there
 * keeps a stable alphabetical position at the end.
 *
 * This used to sort alphabetically unconditionally, which silently discarded any reordering the
 * editor wrote back — dragging a row appeared to do nothing.
 */
export const variantIDs = (
  effective: ModelVariantMap,
  overrides: ModelVariantMap,
  order: string[] = [],
): string[] => {
  const rank = new Map(order.filter((id) => id !== "default").map((id, index) => [id, index]));
  return [...new Set([...Object.keys(effective), ...Object.keys(overrides)])]
    .filter((id) => id !== "default")
    .sort((left, right) => {
      const leftRank = rank.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.localeCompare(right);
    });
};

export const normalizedVariantOverrides = (variants: ModelVariantMap): ModelVariantMap | undefined => {
  const entries = Object.entries(variants).filter(([id]) => id.trim() && id !== "default");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
