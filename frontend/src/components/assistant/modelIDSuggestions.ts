import type { ModelInfo, ProviderCatalog } from "@/lib/opencode";

export interface ModelIDSuggestion {
  model: ModelInfo;
  providerID: string;
}

export interface ModelIDSuggestionIndexEntry extends ModelIDSuggestion {
  searchable: string;
}

interface SuggestionInput {
  /** The provider being edited; it owns any id it publishes. */
  editingProviderID: string;
  index: ModelIDSuggestionIndexEntry[];
  query: string;
}

/**
 * How likely a provider is to be the authority on a model id, lowest wins.
 *
 * An id such as `deepseek/deepseek-v4-flash` names its origin in the id itself, so the provider
 * whose own id matches that namespace outranks a relay that merely resells it.
 */
const authority = (providerID: string, modelID: string, editingProviderID: string): number => {
  if (providerID === editingProviderID) return 0;
  const namespace = modelID.includes("/") ? modelID.split("/")[0].toLowerCase() : "";
  return namespace && namespace === providerID.toLowerCase() ? 1 : 2;
};

/** How closely an id matches what was typed, lowest wins. */
const closeness = (modelID: string, needle: string): number => {
  if (modelID === needle) return 0;
  if (modelID.startsWith(needle)) return 1;
  return (modelID.split("/").pop() ?? "").startsWith(needle) ? 2 : 3;
};

/**
 * Scores both contiguous and non-contiguous matches. This lets short queries such as `gpt4t`
 * find `gpt-4-turbo`, while exact substrings still rank ahead of loose subsequences.
 */
const fuzzyScore = (searchable: string, needle: string): number | undefined => {
  const substringAt = searchable.indexOf(needle);
  if (substringAt >= 0) return substringAt;

  let searchAt = 0;
  let firstMatch = -1;
  let gaps = 0;
  for (const character of needle) {
    const matchAt = searchable.indexOf(character, searchAt);
    if (matchAt < 0) return undefined;
    if (firstMatch < 0) firstMatch = matchAt;
    else gaps += matchAt - searchAt;
    searchAt = matchAt + 1;
  }
  return 100 + firstMatch + gaps;
};

/**
 * Builds the expensive cross-provider search document only when catalogue data changes, not on
 * every key press. Original casing is preserved deliberately so filtering is case-sensitive.
 */
export const buildModelIDSuggestionIndex = (
  catalog: ProviderCatalog,
  models: ModelInfo[]
): ModelIDSuggestionIndexEntry[] => {
  const entries = new Map<string, ModelIDSuggestionIndexEntry>();
  const providerNames = new Map(catalog.all.map((provider) => [provider.id, provider.name]));
  const add = (model: ModelInfo, providerID: string) => {
    entries.set(`${providerID}/${model.id}`, {
      model,
      providerID,
      searchable: `${model.id} ${model.name} ${providerID} ${providerNames.get(providerID) ?? ""}`,
    });
  };

  catalog.all.forEach((provider) =>
    Object.values(provider.models ?? {}).forEach((model) => add(model, provider.id)));
  models.forEach((model) => add(model, model.providerID));
  return [...entries.values()];
};

/**
 * Model ids worth offering for what is being typed, across every known provider.
 *
 * Catalog and live V2 data can repeat the same provider/model pair, so those exact duplicates are
 * collapsed. Different providers serving the same model remain visible because the provider is a
 * meaningful choice when configuring a custom relay.
 */
export const modelIDSuggestions = ({
  editingProviderID,
  index,
  query,
}: SuggestionInput): ModelIDSuggestion[] => {
  const typed = query.trim();
  const needle = typed;
  if (needle.length < 2) return [];

  return index
    .map((entry) => ({ ...entry, score: fuzzyScore(entry.searchable, needle) }))
    .filter((entry): entry is ModelIDSuggestionIndexEntry & { score: number } =>
      entry.model.id !== typed && entry.score !== undefined)
    .sort((left, right) =>
      left.score - right.score
      || closeness(left.model.id, needle) - closeness(right.model.id, needle)
      || authority(left.providerID, left.model.id, editingProviderID) - authority(right.providerID, right.model.id, editingProviderID)
      || left.providerID.localeCompare(right.providerID)
      || left.model.id.localeCompare(right.model.id))
    .map(({ model, providerID }) => ({ model, providerID }));
};
