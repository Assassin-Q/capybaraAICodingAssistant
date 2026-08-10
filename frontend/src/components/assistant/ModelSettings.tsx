import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleAlert, Cpu, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModelVariantEditor } from "@/components/assistant/ModelVariantEditor";
import { normalizedVariantOverrides } from "@/components/assistant/modelVariantConfig";
import type { ModelVariantMap } from "@/components/assistant/modelVariantConfig";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi } from "@/lib/idea";
import { openCodeApi } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import type { ModelVariantLabels } from "@/lib/preferences";
import type { CustomModelConfig, ModelInfo, ModelModality, OpenCodeConfig, ProviderCatalog, ProviderConfig } from "@/lib/opencode";
import { t } from "@/lib/i18n";

interface ModelSettingsProps {
  modelVariantLabels: ModelVariantLabels;
  onChanged: () => void;
  onModelVariantLabelsChange: (labels: ModelVariantLabels) => void;
  projectPath?: string;
}

/** Fallback when neither the user nor the catalog supplies one; the schema demands a number. */
const DEFAULT_MAX_OUTPUT = 8192;

interface ModelDraft {
  context: string;
  /** OpenCode Model.limit requires context AND output; saving without output returns 400. */
  maxOutput: string;
  enabled: boolean;
  id: string;
  inputModalities: ModelModality[];
  name: string;
  outputModalities: ModelModality[];
  reasoning: boolean;
  toolCall: boolean;
  variants: ModelVariantMap;
}

interface ProviderDraft {
  apiKey: string;
  baseURL: string;
  catalogProvider: boolean;
  disabled: boolean;
  id: string;
  name: string;
  npm: string;
  sdkType: SdkType;
}

type SdkType = "openai-responses" | "openai-compatible" | "anthropic";

const sdkOptions: Array<{ description: string; id: SdkType; label: string; npm: string }> = [
  { description: t("s_0a5429258b"), id: "openai-responses", label: "OpenAI Responses", npm: "@ai-sdk/openai" },
  { description: t("s_bd0735704b"), id: "openai-compatible", label: t("s_83a19c76d9"), npm: "@ai-sdk/openai-compatible" },
  { description: "Anthropic Messages API", id: "anthropic", label: "Anthropic", npm: "@ai-sdk/anthropic" },
];

const sdkTypeFromPackage = (npm: string): SdkType => {
  if (npm === "@ai-sdk/openai") return "openai-responses";
  if (npm === "@ai-sdk/anthropic") return "anthropic";
  if (npm === "@ai-sdk/openai-compatible") return "openai-compatible";
  return "openai-compatible";
};

const emptyProvider = (): ProviderDraft => ({
  apiKey: "",
  baseURL: "",
  catalogProvider: false,
  disabled: false,
  id: "",
  name: "",
  npm: "@ai-sdk/openai-compatible",
  sdkType: "openai-compatible",
});

const emptyModel = (): ModelDraft => ({
  context: "",
  maxOutput: "",
  enabled: true,
  id: "",
  inputModalities: ["text"],
  name: "",
  outputModalities: ["text"],
  reasoning: false,
  toolCall: true,
  variants: {},
});

const providerName = (providerID: string, catalog: ProviderCatalog): string =>
  catalog.all.find((provider) => provider.id === providerID)?.name ?? providerID;

const configuredProviderIDs = (config: OpenCodeConfig): string[] => Object.keys(config.provider ?? {});

const toProviderDraft = (id: string, config: OpenCodeConfig, catalog: ProviderCatalog): ProviderDraft => {
  const provider = config.provider?.[id];
  const catalogProvider = catalog.all.find((item) => item.id === id);
  const options = provider?.options ?? {};
  const npm = provider?.npm ?? catalogProvider?.api?.package ?? "@ai-sdk/openai-compatible";
  return {
    apiKey: "",
    baseURL: typeof options.baseURL === "string" ? options.baseURL : catalogProvider?.api?.url ?? "",
    catalogProvider: !provider && Boolean(catalogProvider),
    disabled: config.disabled_providers?.includes(id) === true,
    id,
    name: provider?.name ?? providerName(id, catalog),
    npm,
    sdkType: sdkTypeFromPackage(npm),
  };
};

const draftFromCatalogProvider = (provider: ProviderCatalog["all"][number]): ProviderDraft => {
  const npm = provider.api?.package ?? Object.values(provider.models)[0]?.api?.npm ?? "@ai-sdk/openai-compatible";
  return {
    apiKey: "",
    baseURL: provider.api?.url ?? Object.values(provider.models)[0]?.api?.url ?? "",
    catalogProvider: true,
    disabled: false,
    id: provider.id,
    name: provider.name,
    npm,
    sdkType: sdkTypeFromPackage(npm),
  };
};

const normalizeModalities = (value: ModelModality[] | undefined, fallback: ModelModality[]): ModelModality[] =>
  value && value.length > 0 ? value : fallback;

const modelDraftFromConfig = (
  id: string,
  model: CustomModelConfig,
  catalogModel: ModelInfo | undefined,
  enabled: boolean
): ModelDraft => ({
  context: model.limit?.context || catalogModel?.limit?.context
    ? String(model.limit?.context ?? catalogModel?.limit?.context)
    : "",
  maxOutput: model.limit?.output || catalogModel?.limit?.output
    ? String(model.limit?.output ?? catalogModel?.limit?.output)
    : "",
  enabled,
  id,
  inputModalities: normalizeModalities(
    model.modalities?.input,
    Object.entries(catalogModel?.capabilities?.input ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality).length > 0
      ? Object.entries(catalogModel?.capabilities?.input ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality)
      : model.attachment ? ["text", "image"] : ["text"]
  ),
  name: model.name ?? catalogModel?.name ?? id,
  outputModalities: normalizeModalities(
    model.modalities?.output,
    Object.entries(catalogModel?.capabilities?.output ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality).length > 0
      ? Object.entries(catalogModel?.capabilities?.output ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality)
      : ["text"]
  ),
  reasoning: model.reasoning ?? catalogModel?.capabilities?.reasoning ?? false,
  toolCall: model.tool_call ?? catalogModel?.capabilities?.toolcall ?? true,
  variants: model.variants ?? {},
});

const modelDraftFromCatalog = (model: ModelInfo, enabled: boolean): ModelDraft => ({
  context: model.limit?.context ? String(model.limit.context) : "",
  maxOutput: model.limit?.output ? String(model.limit.output) : "",
  enabled,
  id: model.id,
  inputModalities: normalizeModalities(
    Object.entries(model.capabilities?.input ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality),
    model.capabilities?.attachment ? ["text", "image"] : ["text"]
  ),
  name: model.name,
  outputModalities: normalizeModalities(
    Object.entries(model.capabilities?.output ?? {}).filter(([, active]) => active).map(([key]) => key as ModelModality),
    ["text"]
  ),
  reasoning: model.capabilities?.reasoning === true,
  toolCall: model.capabilities?.toolcall !== false,
  // Thinking levels the provider already publishes, so a matched ID brings its variants along.
  variants: model.variants ?? {},
});
const toModelConfig = (draft: ModelDraft, existing?: CustomModelConfig): CustomModelConfig => ({
  ...existing,
  attachment: draft.inputModalities.includes("image"),
  // The schema marks both keys required. A missing output is what produced
  // "Missing key at [\"provider\"][...][\"limit\"][\"output\"]" on every save.
  limit: draft.context.trim() || draft.maxOutput.trim()
    ? {
      context: Number(draft.context) || existing?.limit?.context || 0,
      output: Number(draft.maxOutput) || existing?.limit?.output || DEFAULT_MAX_OUTPUT,
    }
    : undefined,
  modalities: { input: draft.inputModalities, output: draft.outputModalities },
  name: draft.name.trim() || draft.id.trim(),
  reasoning: draft.reasoning,
  status: "active",
  tool_call: draft.toolCall,
  variants: normalizedVariantOverrides(draft.variants),
});

/** Result of the last action, shown beside the button that triggered it. */
function InlineResult({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null;
  return (
    <span
      className={cn(
        "mr-auto inline-flex min-w-0 items-center gap-1 text-[11px]",
        error ? "text-destructive" : "text-amber-600 dark:text-amber-400"
      )}
    >
      {error ? <CircleAlert className="size-3 shrink-0" /> : <Check className="size-3 shrink-0" />}
      <span className="min-w-0 truncate" title={error || notice}>{error || notice}</span>
    </span>
  );
}

function SettingField({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-xs font-medium text-foreground"><span>{label}</span>{children}</label>;
}

function CapabilityToggle({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange: (checked: boolean) => void }) {
  return <label className="flex min-h-9 items-center gap-2 rounded-md bg-muted/45 px-2 text-xs"><Switch checked={checked} onCheckedChange={onCheckedChange} /><span>{label}</span></label>;
}

const inputModalities: Array<{ id: ModelModality; label: string }> = [
  { id: "text", label: t("s_f1926e9b33") }, { id: "image", label: t("s_be8da62ea1") }, { id: "audio", label: t("s_461189f186") },
  { id: "video", label: t("s_fa4e33b698") }, { id: "pdf", label: "PDF" },
];

const outputModalities: Array<{ id: ModelModality; label: string }> = [
  { id: "text", label: t("s_f1926e9b33") }, { id: "audio", label: t("s_461189f186") },
];

const toggleModality = (items: ModelModality[], item: ModelModality, enabled: boolean): ModelModality[] =>
  enabled ? [...new Set([...items, item])] : items.filter((value) => value !== item);

const modelVariantLabelKey = (providerID: string, modelID: string): string =>
  `${providerID}/${modelID}`;

const cleanVariantLabels = (labels: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(labels)
      .map(([id, label]) => [id.trim(), label.trim()])
      .filter(([id, label]) => id && id !== "default" && label)
  );

export function ModelSettings({
  modelVariantLabels,
  onChanged,
  onModelVariantLabelsChange,
  projectPath,
}: ModelSettingsProps) {
  const [catalog, setCatalog] = useState<ProviderCatalog>({ all: [], connected: [], default: {} });
  const [config, setConfig] = useState<OpenCodeConfig>({});
  const [selectedID, setSelectedID] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [modelDraft, setModelDraft] = useState<ModelDraft>(emptyModel);
  const [modelVariantLabelDraft, setModelVariantLabelDraft] = useState<Record<string, string>>({});
  const [editingModelID, setEditingModelID] = useState<string>();
  const [isNewProvider, setIsNewProvider] = useState(false);
  const [newProviderStep, setNewProviderStep] = useState<"choose" | "details">("choose");
  const [providerSearch, setProviderSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** Closed after a pick; typing again reopens it. */
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [pendingDeleteModelID, setPendingDeleteModelID] = useState<string>();
  const [pendingDeleteProviderID, setPendingDeleteProviderID] = useState<string>();

  const load = async (preferredID?: string) => {
    if (!projectPath) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [nextCatalog, nextConfig] = await Promise.all([
        openCodeApi.listProviderCatalog(projectPath),
        openCodeApi.getConfig(projectPath),
      ]);
      const ids = [...new Set([...nextCatalog.connected, ...configuredProviderIDs(nextConfig)])];
      const nextID = preferredID && ids.includes(preferredID) ? preferredID : ids[0] ?? "";
      setCatalog(nextCatalog);
      setConfig(nextConfig);
      setSelectedID(nextID);
      setIsNewProvider(false);
      setNewProviderStep("choose");
      setProviderSearch("");
      setProviderDraft(nextID ? toProviderDraft(nextID, nextConfig, nextCatalog) : emptyProvider());
      setEditingModelID(undefined);
      setModelDraft(emptyModel());
      setModelVariantLabelDraft({});
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [projectPath]);

  const applyLocalConfig = (nextConfig: OpenCodeConfig, providerID?: string) => {
    setConfig(nextConfig);
    if (providerID) {
      setSelectedID(providerID);
      setProviderDraft(toProviderDraft(providerID, nextConfig, catalog));
      setIsNewProvider(false);
      setNewProviderStep("choose");
    }
  };

  const providerIDs = useMemo(
    () => [...new Set([...catalog.connected, ...configuredProviderIDs(config)])],
    [catalog.connected, config]
  );
  const availableCatalogProviders = useMemo(() => {
    const existing = new Set(providerIDs);
    const term = providerSearch.trim().toLocaleLowerCase();
    const priority: Record<string, number> = { opencode: 0, openai: 1, anthropic: 2, google: 3, openrouter: 4, vercel: 5 };
    return catalog.all
      .filter((provider) => !existing.has(provider.id))
      .filter((provider) => !term || `${provider.name} ${provider.id}`.toLocaleLowerCase().includes(term))
      .sort((left, right) => (priority[left.id] ?? 50) - (priority[right.id] ?? 50) || left.name.localeCompare(right.name));
  }, [catalog.all, providerIDs, providerSearch]);
  const selectedConfig = selectedID ? config.provider?.[selectedID] ?? {} : {};
  const catalogModels = catalog.all.find((provider) => provider.id === selectedID)?.models ?? {};
  const configuredModels = selectedConfig.models ?? {};
  const disabledModelIDs = new Set(selectedConfig.blacklist ?? []);
  const modelIDs = [...new Set([...Object.keys(catalogModels), ...Object.keys(configuredModels), ...disabledModelIDs])]
    .filter((id) => configuredModels[id]?.status !== "deprecated");

  /**
   * Typing an ID the provider already publishes fills in everything we know about it — context,
   * max output, capabilities, modalities and variants — instead of making the user retype the
   * spec by hand. Fields the user already touched are left alone, so it never fights edits.
   */
  const applyModelID = (nextID: string, known?: ModelInfo) => {
    setSuggestionsOpen(!known);
    setModelDraft((current) => {
      const trimmed = nextID.trim();
      const match = known ?? catalogModels[trimmed];
      if (!match) return { ...current, id: nextID };
      const untouched = current.id.trim() === "" || current.id.trim() === trimmed
        ? true
        : !current.context && !current.maxOutput && !current.name;
      if (!untouched) return { ...current, id: nextID };
      const filled = modelDraftFromCatalog(match, current.enabled);
      return { ...filled, id: nextID, name: current.name.trim() || filled.name };
    });
  };

  /**
   * Every model id in the catalog that looks like what is being typed, across all providers.
   * A custom provider has no catalog of its own, so matching only inside it would never suggest
   * anything — which is the case where filling the spec in by hand hurts most.
   */
  const modelIDSuggestions = (query: string): Array<{ model: ModelInfo; providerID: string }> => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const seen = new Set<string>();
    const matches: Array<{ model: ModelInfo; providerID: string }> = [];
    catalog.all.forEach((provider) => {
      Object.values(provider.models ?? {}).forEach((model) => {
        if (matches.length >= 8) return;
        if (!model.id.toLowerCase().includes(needle)) return;
        const key = `${provider.id}/${model.id}`;
        if (seen.has(key) || model.id === query.trim()) return;
        seen.add(key);
        matches.push({ model, providerID: provider.id });
      });
    });
    return matches;
  };

  const draftForModel = (modelID: string): ModelDraft => {
    const enabled = !disabledModelIDs.has(modelID);
    if (configuredModels[modelID]) return modelDraftFromConfig(modelID, configuredModels[modelID], catalogModels[modelID], enabled);
    if (catalogModels[modelID]) return modelDraftFromCatalog(catalogModels[modelID], enabled);
    return { ...emptyModel(), enabled, id: modelID, name: modelID };
  };

  const selectProvider = (id: string) => {
    setSelectedID(id);
    setIsNewProvider(false);
    setProviderDraft(toProviderDraft(id, config, catalog));
    setEditingModelID(undefined);
    setModelDraft(emptyModel());
    setModelVariantLabelDraft({});
    setError("");
    setNotice("");
  };

  const beginNewProvider = () => {
    setSelectedID("");
    setIsNewProvider(true);
    setNewProviderStep("choose");
    setProviderSearch("");
    setProviderDraft(emptyProvider());
    setEditingModelID(undefined);
    setModelDraft(emptyModel());
    setModelVariantLabelDraft({});
    setError("");
    setNotice("");
  };

  const chooseCatalogProvider = (providerID: string) => {
    const provider = catalog.all.find((item) => item.id === providerID);
    if (!provider) return;
    setProviderDraft(draftFromCatalogProvider(provider));
    setNewProviderStep("details");
    setError("");
    setNotice("");
  };

  const chooseCustomProvider = () => {
    setProviderDraft(emptyProvider());
    setNewProviderStep("details");
    setError("");
    setNotice("");
  };

  const toggleModelEditor = (modelID: string) => {
    if (editingModelID === modelID) {
      setEditingModelID(undefined);
      setModelVariantLabelDraft({});
      return;
    }
    setEditingModelID(modelID);
    setModelDraft(draftForModel(modelID));
    setModelVariantLabelDraft({
      ...(modelVariantLabels[modelVariantLabelKey(providerDraft.id || selectedID, modelID)] ?? {}),
    });
  };

  const saveProvider = async () => {
    const id = providerDraft.id.trim();
    if (!projectPath || !id) return setError(t("s_7a38131dea"));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const disabledProviders = new Set(config.disabled_providers ?? []);
      providerDraft.disabled ? disabledProviders.add(id) : disabledProviders.delete(id);
      if (providerDraft.catalogProvider) {
        if (providerDraft.apiKey.trim()) {
          await openCodeApi.setProviderAuth(id, providerDraft.apiKey.trim(), projectPath);
        }
        await openCodeApi.updateConfig({ disabled_providers: [...disabledProviders] }, projectPath);
        applyLocalConfig({ ...config, disabled_providers: [...disabledProviders] }, id);
        onChanged();
        return;
      }
      const existing = config.provider?.[id] ?? {};
      const selectedSdk = sdkOptions.find((option) => option.id === providerDraft.sdkType);
      const npm = selectedSdk?.npm ?? providerDraft.npm.trim();
      const provider: ProviderConfig = {
        ...existing,
        name: providerDraft.name.trim() || id,
        npm,
        options: {
          ...(existing.options ?? {}),
          ...(providerDraft.baseURL.trim() ? { baseURL: providerDraft.baseURL.trim() } : {}),
          ...(providerDraft.apiKey.trim() ? { apiKey: providerDraft.apiKey.trim() } : {}),
        },
      };
      const saved = await ideaApi.saveProvider(id, provider);
      setNotice(saved.message ?? t("s_df3e8b58a7"));
      await openCodeApi.updateConfig({ disabled_providers: [...disabledProviders] }, projectPath);
      applyLocalConfig({
        ...config,
        disabled_providers: [...disabledProviders],
        provider: { ...(config.provider ?? {}), [id]: provider },
      }, id);
      onChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveModel = async () => {
    const providerID = providerDraft.id.trim();
    const modelID = modelDraft.id.trim();
    if (!projectPath || !providerID || !modelID) return setError(t("s_17ccd8beb5"));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const existing = config.provider?.[providerID] ?? {};
      const renamedFrom = editingModelID !== "new" && editingModelID !== modelID ? editingModelID : "";
      const blacklist = new Set(existing.blacklist ?? []);
      if (renamedFrom) blacklist.delete(renamedFrom);
      modelDraft.enabled ? blacklist.delete(modelID) : blacklist.add(modelID);
      const models = { ...(existing.models ?? {}) };
      const previous = models[renamedFrom || modelID];
      if (renamedFrom) delete models[renamedFrom];
      const nextProvider = {
        ...existing,
        blacklist: [...blacklist],
        models: { ...models, [modelID]: toModelConfig({ ...modelDraft, id: modelID }, previous) },
      };
      const saved = await ideaApi.saveProvider(providerID, nextProvider);
      setNotice(saved.message ?? t("s_df3e8b58a7"));
      applyLocalConfig({ ...config, provider: { ...(config.provider ?? {}), [providerID]: nextProvider } }, providerID);
      setEditingModelID(modelID);
      setModelDraft({ ...modelDraft, id: modelID });
      const labelKey = modelVariantLabelKey(providerID, modelID);
      const cleanedLabels = cleanVariantLabels(modelVariantLabelDraft);
      const nextVariantLabels = { ...modelVariantLabels };
      if (Object.keys(cleanedLabels).length > 0) nextVariantLabels[labelKey] = cleanedLabels;
      else delete nextVariantLabels[labelKey];
      onModelVariantLabelsChange(nextVariantLabels);
      onChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const setModelEnabled = async (modelID: string, enabled: boolean) => {
    const providerID = providerDraft.id.trim();
    if (!projectPath || !providerID) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const existing = config.provider?.[providerID] ?? {};
      const blacklist = new Set(existing.blacklist ?? []);
      enabled ? blacklist.delete(modelID) : blacklist.add(modelID);
      const nextProvider = { ...existing, blacklist: [...blacklist] };
      // PATCH /config discards provider edits; the plugin writes them to opencode.jsonc instead.
      const saved = await ideaApi.saveProvider(providerID, nextProvider);
      setNotice(saved.message ?? t("s_df3e8b58a7"));
      applyLocalConfig({ ...config, provider: { ...(config.provider ?? {}), [providerID]: nextProvider } }, providerID);
      onChanged();
    } catch (toggleError) {
      setError(errorMessage(toggleError));
    } finally {
      setSaving(false);
    }
  };

  /**
   * OpenCode's `PATCH /config` has no delete primitive, so the whole provider map minus this
   * entry is sent and the result is read back. If the server merged instead of replacing, the
   * provider is only disabled and the user is told the entry is still in opencode.jsonc rather
   * than being shown a success that did not happen.
   */
  const deleteProvider = async () => {
    const providerID = pendingDeleteProviderID;
    if (!projectPath || !providerID) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Edits opencode.jsonc directly — PATCH /config only merges and cannot remove a key.
      const removal = await ideaApi.removeProvider(providerID);
      if (!removal.success) {
        setError(removal.message ?? t("s_2b3b7fd6c6", { p0: providerID }));
        return;
      }

      const verified = await openCodeApi.getConfig(projectPath).catch(() => config);
      setPendingDeleteProviderID(undefined);
      applyLocalConfig(verified, configuredProviderIDs(verified)[0] ?? "");
      setSelectedID(configuredProviderIDs(verified)[0] ?? catalog.connected[0] ?? "");
      onChanged();
      // OpenCode caches config at startup, so the list only settles after a reload.
      setError(removal.message ?? "");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const deleteModel = async () => {
    const providerID = providerDraft.id.trim();
    const modelID = pendingDeleteModelID;
    if (!projectPath || !providerID || !modelID) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const existing = config.provider?.[providerID] ?? {};
      const blacklist = [...new Set([...(existing.blacklist ?? []), modelID])];
      const models = {
        ...(existing.models ?? {}),
        [modelID]: { ...(existing.models?.[modelID] ?? {}), status: "deprecated" as const },
      };
      const nextProvider = { ...existing, blacklist, models };
      const saved = await ideaApi.saveProvider(providerID, nextProvider);
      setNotice(saved.message ?? t("s_df3e8b58a7"));
      const nextConfig: OpenCodeConfig = { ...config, provider: { ...(config.provider ?? {}), [providerID]: nextProvider } };
      const nextVariantLabels = { ...modelVariantLabels };
      delete nextVariantLabels[modelVariantLabelKey(providerID, modelID)];
      onModelVariantLabelsChange(nextVariantLabels);
      setPendingDeleteModelID(undefined);
      setEditingModelID(undefined);
      applyLocalConfig(nextConfig, providerID);
      onChanged();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const removeProviderCredential = async () => {
    const id = providerDraft.id.trim();
    if (!id) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await openCodeApi.removeProviderAuth(id, projectPath);
      setCatalog((current) => ({ ...current, connected: current.connected.filter((providerID) => providerID !== id) }));
      onChanged();
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setSaving(false);
    }
  };

  const modelEditor = (
    <div className="grid gap-4 bg-muted/25 px-3 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SettingField label={t("s_2b7c96b260")}>
          <div className="relative">
            <Input disabled={Boolean(editingModelID) && editingModelID !== "new" && Boolean(catalogModels[editingModelID ?? ""])} onChange={(event) => applyModelID(event.target.value)} placeholder={t("s_695f4de76f")} title={t("s_f273d83ecf")} value={modelDraft.id} />
            {editingModelID === "new" && suggestionsOpen && modelIDSuggestions(modelDraft.id).length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {modelIDSuggestions(modelDraft.id).map(({ model, providerID }) => (
                  <button
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
                    key={`${providerID}/${model.id}`}
                    onClick={() => applyModelID(model.id.split("/").pop() ?? model.id, model)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px]">{model.id}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{model.name}</span>
                    </span>
                    <Badge variant="outline">{providerName(providerID, catalog)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingField>
        <SettingField label={t("s_75ae6a8a7d")}><Input onChange={(event) => setModelDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("s_38719c9968")} value={modelDraft.name} /></SettingField>
        <SettingField label={t("s_da083e745f")}><Input inputMode="numeric" onChange={(event) => setModelDraft((current) => ({ ...current, context: event.target.value }))} placeholder={t("s_0a303c4a30")} value={modelDraft.context} /></SettingField>
        <SettingField label={t("s_880c229522")}><Input inputMode="numeric" onChange={(event) => setModelDraft((current) => ({ ...current, maxOutput: event.target.value }))} placeholder={String(DEFAULT_MAX_OUTPUT)} value={modelDraft.maxOutput} /></SettingField>
        <div className="grid gap-2 pt-5"><CapabilityToggle checked={modelDraft.enabled} label={t("s_6d02e09e27")} onCheckedChange={(enabled) => setModelDraft((current) => ({ ...current, enabled }))} /></div>
        <CapabilityToggle checked={modelDraft.reasoning} label={t("s_5b9e4cfc4d")} onCheckedChange={(reasoning) => setModelDraft((current) => ({ ...current, reasoning }))} />
        <CapabilityToggle checked={modelDraft.toolCall} label={t("s_bc0f4e16a9")} onCheckedChange={(toolCall) => setModelDraft((current) => ({ ...current, toolCall }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-xs font-medium">{t("s_487296a07f")}</p>
          <div className="grid grid-cols-2 gap-2">
            {inputModalities.map((item) => (
              <CapabilityToggle
                checked={modelDraft.inputModalities.includes(item.id)}
                key={item.id}
                label={item.label}
                onCheckedChange={(enabled) => setModelDraft((current) => ({
                  ...current,
                  inputModalities: toggleModality(current.inputModalities, item.id, enabled),
                }))}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-medium">{t("s_68a9c25a41")}</p>
          <div className="grid grid-cols-2 gap-2">
            {outputModalities.map((item) => (
              <CapabilityToggle
                checked={modelDraft.outputModalities.includes(item.id)}
                key={item.id}
                label={item.label}
                onCheckedChange={(enabled) => setModelDraft((current) => ({
                  ...current,
                  outputModalities: toggleModality(current.outputModalities, item.id, enabled),
                }))}
              />
            ))}
          </div>
        </div>
      </div>
      <ModelVariantEditor
        effective={editingModelID && editingModelID !== "new" ? catalogModels[editingModelID]?.variants ?? {} : {}}
        labels={modelVariantLabelDraft}
        onChange={(variants) => setModelDraft((current) => ({ ...current, variants }))}
        onLabelsChange={setModelVariantLabelDraft}
        overrides={modelDraft.variants}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InlineResult error={error} notice={notice} />
        <Button onClick={() => { setEditingModelID(undefined); setModelVariantLabelDraft({}); }} size="sm" type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
        <Button disabled={saving} onClick={() => void saveModel()} size="sm" type="button">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {saving ? t("s_6644f06197") : t("s_5db70c89b3")}
        </Button>
      </div>
    </div>
  );

  const providerForm = (
    <>
      <div className="flex min-w-0 items-center gap-2 pb-4">
        {isNewProvider && <Button aria-label={t("s_3a52815329")} className="size-7" onClick={() => setNewProviderStep("choose")} size="icon-sm" title={t("s_11d0241540")} type="button" variant="ghost"><ArrowLeft className="size-3.5" /></Button>}
        <Cpu className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{isNewProvider ? providerDraft.name || t("s_eecf139e11") : providerName(selectedID, catalog)}</h3>
        {!isNewProvider && <Badge variant="secondary">{providerDraft.disabled ? t("s_6c7dcbb73a") : t("s_25d2843150")}</Badge>}
      </div>

      {providerDraft.catalogProvider ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-md bg-muted/35 px-3 py-3 sm:grid-cols-2">
            <div><p className="text-[11px] text-muted-foreground">{t("s_4ce9ed14e3")}</p><p className="mt-1 truncate font-mono text-xs">{providerDraft.id}</p></div>
            <div><p className="text-[11px] text-muted-foreground">{t("s_12975e6c28")}</p><p className="mt-1 truncate font-mono text-xs">{providerDraft.npm || "OpenCode native"}</p></div>
            {providerDraft.baseURL && <div className="sm:col-span-2"><p className="text-[11px] text-muted-foreground">{t("s_26b27709ce")}</p><p className="mt-1 break-all font-mono text-xs">{providerDraft.baseURL}</p></div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingField label="API Key"><div className="relative"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={isNewProvider ? t("s_cc63b124df") : t("s_f72dee10c7")} type={showKey ? "text" : "password"} value={providerDraft.apiKey} /><Button aria-label={showKey ? t("s_f3d9423a57") : t("s_caddc83f01")} className="absolute right-1 top-1" onClick={() => setShowKey((value) => !value)} size="icon-xs" title={showKey ? t("s_f3d9423a57") : t("s_caddc83f01")} type="button" variant="ghost">{showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button></div></SettingField>
            <label className="flex items-end gap-2 pb-2 text-xs"><Switch checked={!providerDraft.disabled} onCheckedChange={(checked) => setProviderDraft((current) => ({ ...current, disabled: !checked }))} />{t("s_4c519b46e8")}</label>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingField label={t("s_4ce9ed14e3")}><Input disabled={!isNewProvider} onChange={(event) => setProviderDraft((current) => ({ ...current, id: event.target.value.trim() }))} placeholder={t("s_4c7a7eac7f")} value={providerDraft.id} /></SettingField>
          <SettingField label={t("s_75ae6a8a7d")}><Input onChange={(event) => setProviderDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("s_15df463d1a")} value={providerDraft.name} /></SettingField>
          <SettingField label={t("s_e56c552b72")}><Select onValueChange={(value: SdkType) => { const option = sdkOptions.find((item) => item.id === value); setProviderDraft((current) => ({ ...current, npm: option?.npm ?? current.npm, sdkType: value })); }} value={providerDraft.sdkType}><SelectTrigger className="w-full border-border/60 shadow-none"><SelectValue /></SelectTrigger><SelectContent className="border-0 ring-1 ring-border/40">{sdkOptions.map((option) => <SelectItem key={option.id} value={option.id}><span className="flex flex-col"><span>{option.label}</span><span className="text-[10px] text-muted-foreground">{option.description}</span></span></SelectItem>)}</SelectContent></Select></SettingField>
          <SettingField label="Base URL"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, baseURL: event.target.value }))} placeholder="https://api.example.com/v1" value={providerDraft.baseURL} /></SettingField>
          <SettingField label="API Key"><div className="relative"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={t("s_f72dee10c7")} type={showKey ? "text" : "password"} value={providerDraft.apiKey} /><Button aria-label={showKey ? t("s_f3d9423a57") : t("s_caddc83f01")} className="absolute right-1 top-1" onClick={() => setShowKey((value) => !value)} size="icon-xs" title={showKey ? t("s_f3d9423a57") : t("s_caddc83f01")} type="button" variant="ghost">{showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button></div></SettingField>
          <label className="flex items-end gap-2 pb-2 text-xs"><Switch checked={!providerDraft.disabled} onCheckedChange={(checked) => setProviderDraft((current) => ({ ...current, disabled: !checked }))} />{t("s_4c519b46e8")}</label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {!isNewProvider && providerDraft.catalogProvider && <Button disabled={saving} onClick={() => void removeProviderCredential()} size="sm" type="button" variant="ghost">{t("s_1bc09d8e22")}</Button>}
        {!isNewProvider && !providerDraft.catalogProvider && (
          <Button
            disabled={saving}
            onClick={() => setPendingDeleteProviderID(providerDraft.id || selectedID)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5 text-destructive" />
            {t("s_b57bfcf3cb")}
          </Button>
        )}
        <InlineResult error={error} notice={notice} />
        <Button disabled={saving} onClick={() => void saveProvider()} size="sm" type="button">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {saving ? t("s_6644f06197") : t("s_c599dafee4")}
        </Button>
      </div>

      {!isNewProvider && <div className="mt-7 border-t border-border/50 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">{t("s_c271d29118")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("s_3d1a044ba9")}</p></div><Button onClick={() => { setEditingModelID("new"); setModelDraft(emptyModel()); setModelVariantLabelDraft({}); }} size="sm" type="button" variant="ghost"><Plus className="size-3.5" />{t("s_532a64e19c")}</Button></div>
        <div className="mt-3 divide-y divide-border/50 bg-muted/20">
          {editingModelID === "new" && modelEditor}
          {modelIDs.length === 0 && editingModelID !== "new" ? <p className="p-4 text-sm text-muted-foreground">{t("s_f031ba1927")}</p> : modelIDs.map((id) => {
            const model = draftForModel(id);
            // The provider marks retired models "deprecated"; the composer filters those out, so
            // showing them here as plain "enabled" made the two lists silently disagree.
            const deprecated = catalogModels[id]?.status === "deprecated" || configuredModels[id]?.status === "deprecated";
            // Written to opencode.jsonc but not in the catalog OpenCode has loaded — the file is
            // only read at startup, so this row exists on disk and nowhere else yet.
            const awaitingRestart = !catalogModels[id] && Boolean(configuredModels[id]);
            return <div key={id}>
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggleModelEditor(id)} type="button">
                  <span className={cn("size-1.5 shrink-0 rounded-full", deprecated ? "bg-muted-foreground/60" : model.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{model.name}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{id}</span></span>
                  {deprecated && <Badge title={t("s_613b1a65d5")} variant="outline">{t("s_64170be710")}</Badge>}
                  {!deprecated && awaitingRestart && (
                    <Badge title={t("s_80560ed849")} variant="outline">
                      {t("s_f866545e31")}
                    </Badge>
                  )}
                  {model.context && <Badge variant="secondary">{model.context}</Badge>}
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", editingModelID === id && "rotate-180")} />
                </button>
                {/* A deprecated model cannot be used at all, so the toggle reads off and locked
                    rather than claiming the model is enabled. */}
                <Switch aria-label={deprecated ? t("s_d3c699452f", { p0: model.name }) : t("s_693267a874", { p0: model.enabled ? t("s_d989e55188") : t("s_d4e9ca3dd4"), p1: model.name })} checked={model.enabled && !deprecated} disabled={saving || deprecated} onCheckedChange={(enabled) => void setModelEnabled(id, enabled)} size="sm" title={deprecated ? t("s_b639c59e68") : undefined} />
                <Button aria-label={t("s_30c5686d43", { p0: model.name })} className="size-8 shrink-0" disabled={saving} onClick={() => setPendingDeleteModelID(id)} size="icon-sm" title={t("s_fdd3167c8b")} type="button" variant="ghost"><Trash2 className="size-3.5 text-muted-foreground" /></Button>
              </div>
              {editingModelID === id && modelEditor}
            </div>;
          })}
        </div>
      </div>}
    </>
  );

  return (
    <>
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{t("s_ec4725bd2f")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("s_1540ca93f6")}</p></div><Button aria-label={t("s_d8e2d46b57")} disabled={loading} onClick={() => void load(selectedID)} size="icon-sm" title={t("s_38108eaa1d")} type="button" variant="ghost"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button></header>
      {error && <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span></div>}
      {!error && notice && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{notice}</span>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="flex max-h-44 min-h-0 flex-col rounded-md bg-muted/30 p-1.5 md:max-h-none">
          <div className="flex h-9 shrink-0 items-center justify-between gap-1 px-2"><p className="truncate text-[11px] font-medium text-muted-foreground">{t("s_703c9eb0f0")}</p><Button aria-label={t("s_3f55a222ea")} className="size-7 shrink-0" onClick={beginNewProvider} size="icon-sm" title={t("s_3f55a222ea")} type="button" variant={isNewProvider ? "secondary" : "ghost"}><Plus className="size-3.5" /></Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{providerIDs.map((id) => <Button className="mb-0.5 w-full justify-start gap-2 px-2" key={id} onClick={() => selectProvider(id)} size="sm" type="button" variant={id === selectedID && !isNewProvider ? "secondary" : "ghost"}><span className={cn("size-1.5 shrink-0 rounded-full", config.disabled_providers?.includes(id) ? "bg-muted-foreground" : "bg-emerald-500")} /><span className="truncate">{providerName(id, catalog)}</span></Button>)}</div>
        </aside>
        <div className={cn("flex min-h-0 min-w-0 flex-col overscroll-contain pr-1", isNewProvider && newProviderStep === "choose" ? "overflow-hidden" : "overflow-y-auto")}>
          {isNewProvider && newProviderStep === "choose" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div><h3 className="text-base font-semibold">{t("s_3f55a222ea")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("s_26bf5af93c")}</p></div>
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input className="pl-8" onChange={(event) => setProviderSearch(event.target.value)} placeholder={t("s_59c9decbe2")} value={providerSearch} /></div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/20 p-1">
                <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent" onClick={chooseCustomProvider} type="button"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background"><Plus className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t("s_eecf139e11")}</span><span className="block text-xs text-muted-foreground">{t("s_19d54ed4ec")}</span></span></button>
                {availableCatalogProviders.map((provider) => {
                  const modelCount = Object.keys(provider.models).length;
                  return <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent" key={provider.id} onClick={() => chooseCatalogProvider(provider.id)} type="button"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background font-mono text-[10px] uppercase">{provider.name.slice(0, 2)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{provider.name}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{provider.id}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{modelCount > 0 ? t("s_4b3772872c", { p0: modelCount }) : t("s_9a4d20b045")}</span></button>;
                })}
                {availableCatalogProviders.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("s_fd8f5db498")}</p>}
              </div>
            </div>
          ) : selectedID || isNewProvider ? providerForm : <div className="flex min-h-56 flex-col items-start justify-center gap-3"><p className="text-sm font-medium">{t("s_a4528c162b")}</p><Button onClick={beginNewProvider} size="sm" type="button"><Plus className="size-3.5" />{t("s_3f55a222ea")}</Button></div>}
        </div>
      </div>
    </section>
    <Dialog onOpenChange={(open) => { if (!open) setPendingDeleteProviderID(undefined); }} open={Boolean(pendingDeleteProviderID)}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-base">{t("s_9b04e7a40f")}</DialogTitle><DialogDescription>{t("s_9b1ca1a222")} {pendingDeleteProviderID} {t("s_2830f8fb13")}</DialogDescription></DialogHeader>
        <DialogFooter><Button onClick={() => setPendingDeleteProviderID(undefined)} size="sm" type="button" variant="ghost">{t("s_4d0b4688c7")}</Button><Button disabled={saving} onClick={() => void deleteProvider()} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />{t("s_b57bfcf3cb")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog onOpenChange={(open) => { if (!open) setPendingDeleteModelID(undefined); }} open={Boolean(pendingDeleteModelID)}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-base">{t("s_8b3db86b51")}</DialogTitle><DialogDescription>{t("s_896dfd9667")} {pendingDeleteModelID}{t("s_57316c8462")}</DialogDescription></DialogHeader>
        <DialogFooter><Button onClick={() => setPendingDeleteModelID(undefined)} size="sm" type="button" variant="ghost">{t("s_4d0b4688c7")}</Button><Button disabled={saving} onClick={() => void deleteModel()} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />{t("s_fdd3167c8b")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
