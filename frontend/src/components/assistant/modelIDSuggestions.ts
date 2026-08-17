import type { ModelInfo, ProviderCatalog } from "@/lib/opencode";

export interface ModelIDSuggestion {
  model: ModelInfo;
  providerID: string;
}

interface SuggestionInput {
  /** The provider being edited; it owns any id it publishes. */
  editingProviderID: string;
  catalog: ProviderCatalog;
  /** The live V2 catalogue, which knows models no built-in provider lists. */
  models: ModelInfo[];
  query: string;
}

const LIMIT = 8;

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
  const lower = modelID.toLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  return (lower.split("/").pop() ?? "").startsWith(needle) ? 2 : 3;
};

/**
 * Model ids worth offering for what is being typed, one row per id.
 *
 * The list used to be keyed by provider *and* id, so a popular model returned as many rows as
 * there were relays carrying it: typing "deep" filled all eight slots with the same handful of
 * DeepSeek ids, and the provider actually named in those ids never appeared. Collapsing by id and
 * ranking by closeness puts distinct models in the list instead.
 */
export const modelIDSuggestions = ({
  editingProviderID,
  catalog,
  models,
  query,
}: SuggestionInput): ModelIDSuggestion[] => {
  const typed = query.trim();
  const needle = typed.toLowerCase();
  if (needle.length < 2) return [];

  const byID = new Map<string, ModelIDSuggestion>();
  const consider = (model: ModelInfo, providerID: string) => {
    if (model.id === typed || !model.id.toLowerCase().includes(needle)) return;
    const held = byID.get(model.id);
    if (held && authority(held.providerID, model.id, editingProviderID)
      <= authority(providerID, model.id, editingProviderID)) return;
    byID.set(model.id, { model, providerID });
  };

  catalog.all.forEach((provider) =>
    Object.values(provider.models ?? {}).forEach((model) => consider(model, provider.id)));
  models.forEach((model) => consider(model, model.providerID));

  return [...byID.values()]
    .sort((left, right) =>
      closeness(left.model.id, needle) - closeness(right.model.id, needle)
      || left.model.id.localeCompare(right.model.id))
    .slice(0, LIMIT);
};
