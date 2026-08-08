import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleAlert, Cpu, Eye, EyeOff, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";

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
import { openCodeApi } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import type { ModelVariantLabels } from "@/lib/preferences";
import type { CustomModelConfig, ModelInfo, ModelModality, OpenCodeConfig, ProviderCatalog, ProviderConfig } from "@/lib/opencode";

interface ModelSettingsProps {
  modelVariantLabels: ModelVariantLabels;
  onChanged: () => void;
  onModelVariantLabelsChange: (labels: ModelVariantLabels) => void;
  projectPath?: string;
}

interface ModelDraft {
  context: string;
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
  { description: "OpenAI Responses API，适合原生 OpenAI 推理模型", id: "openai-responses", label: "OpenAI Responses", npm: "@ai-sdk/openai" },
  { description: "OpenAI Chat Completions 兼容接口", id: "openai-compatible", label: "OpenAI 兼容", npm: "@ai-sdk/openai-compatible" },
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
  variants: {},
});
const toModelConfig = (draft: ModelDraft, existing?: CustomModelConfig): CustomModelConfig => ({
  ...existing,
  attachment: draft.inputModalities.includes("image"),
  limit: draft.context.trim() ? { context: Number(draft.context) || undefined } : undefined,
  modalities: { input: draft.inputModalities, output: draft.outputModalities },
  name: draft.name.trim() || draft.id.trim(),
  reasoning: draft.reasoning,
  status: "active",
  tool_call: draft.toolCall,
  variants: normalizedVariantOverrides(draft.variants),
});

function SettingField({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-xs font-medium text-foreground"><span>{label}</span>{children}</label>;
}

function CapabilityToggle({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange: (checked: boolean) => void }) {
  return <label className="flex min-h-9 items-center gap-2 rounded-md bg-muted/45 px-2 text-xs"><Switch checked={checked} onCheckedChange={onCheckedChange} /><span>{label}</span></label>;
}

const inputModalities: Array<{ id: ModelModality; label: string }> = [
  { id: "text", label: "文本" }, { id: "image", label: "图片" }, { id: "audio", label: "音频" },
  { id: "video", label: "视频" }, { id: "pdf", label: "PDF" },
];

const outputModalities: Array<{ id: ModelModality; label: string }> = [
  { id: "text", label: "文本" }, { id: "audio", label: "音频" },
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
  const [showKey, setShowKey] = useState(false);
  const [pendingDeleteModelID, setPendingDeleteModelID] = useState<string>();
  const [pendingDeleteProviderID, setPendingDeleteProviderID] = useState<string>();

  const load = async (preferredID?: string) => {
    if (!projectPath) return;
    setLoading(true);
    setError("");
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
  };

  const chooseCatalogProvider = (providerID: string) => {
    const provider = catalog.all.find((item) => item.id === providerID);
    if (!provider) return;
    setProviderDraft(draftFromCatalogProvider(provider));
    setNewProviderStep("details");
    setError("");
  };

  const chooseCustomProvider = () => {
    setProviderDraft(emptyProvider());
    setNewProviderStep("details");
    setError("");
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
    if (!projectPath || !id) return setError("请填写供应商 ID");
    setSaving(true);
    setError("");
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
      await openCodeApi.updateConfig({ disabled_providers: [...disabledProviders], provider: { [id]: provider } }, projectPath);
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
    if (!projectPath || !providerID || !modelID) return setError("请先选择供应商并填写模型 ID");
    setSaving(true);
    setError("");
    try {
      const existing = config.provider?.[providerID] ?? {};
      const blacklist = new Set(existing.blacklist ?? []);
      modelDraft.enabled ? blacklist.delete(modelID) : blacklist.add(modelID);
      const nextProvider = {
        ...existing,
        blacklist: [...blacklist],
        models: { ...(existing.models ?? {}), [modelID]: toModelConfig({ ...modelDraft, id: modelID }, existing.models?.[modelID]) },
      };
      await openCodeApi.updateConfig({
        provider: {
          [providerID]: nextProvider,
        },
      }, projectPath);
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
    try {
      const existing = config.provider?.[providerID] ?? {};
      const blacklist = new Set(existing.blacklist ?? []);
      enabled ? blacklist.delete(modelID) : blacklist.add(modelID);
      const nextProvider = { ...existing, blacklist: [...blacklist] };
      await openCodeApi.updateConfig({ provider: { [providerID]: nextProvider } }, projectPath);
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
    try {
      const remaining = Object.fromEntries(
        Object.entries(config.provider ?? {}).filter(([id]) => id !== providerID)
      );
      const disabledProviders = [...new Set([...(config.disabled_providers ?? []), providerID])];
      await openCodeApi.updateConfig({ disabled_providers: disabledProviders, provider: remaining }, projectPath);

      const verified = await openCodeApi.getConfig(projectPath);
      const stillPresent = Object.keys(verified.provider ?? {}).includes(providerID);
      setPendingDeleteProviderID(undefined);
      applyLocalConfig(verified, Object.keys(verified.provider ?? {})[0] ?? "");
      setSelectedID(configuredProviderIDs(verified)[0] ?? catalog.connected[0] ?? "");
      onChanged();
      if (stillPresent) {
        setError(
          `OpenCode 未删除 ${providerID}，已改为停用。该条目仍在 opencode.jsonc 中，可手动删除后重启服务。`
        );
      }
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
    try {
      const existing = config.provider?.[providerID] ?? {};
      const blacklist = [...new Set([...(existing.blacklist ?? []), modelID])];
      const models = {
        ...(existing.models ?? {}),
        [modelID]: { ...(existing.models?.[modelID] ?? {}), status: "deprecated" as const },
      };
      const nextProvider = { ...existing, blacklist, models };
      await openCodeApi.updateConfig({
        provider: {
          [providerID]: nextProvider,
        },
      }, projectPath);
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
        <SettingField label="模型 ID"><Input disabled={editingModelID !== "new"} onChange={(event) => setModelDraft((current) => ({ ...current, id: event.target.value }))} placeholder="例如 gpt-5.5" value={modelDraft.id} /></SettingField>
        <SettingField label="显示名称"><Input onChange={(event) => setModelDraft((current) => ({ ...current, name: event.target.value }))} placeholder="模型名称" value={modelDraft.name} /></SettingField>
        <SettingField label="上下文大小"><Input inputMode="numeric" onChange={(event) => setModelDraft((current) => ({ ...current, context: event.target.value }))} placeholder="例如 200000" value={modelDraft.context} /></SettingField>
        <div className="grid gap-2 pt-5"><CapabilityToggle checked={modelDraft.enabled} label="启用此模型" onCheckedChange={(enabled) => setModelDraft((current) => ({ ...current, enabled }))} /></div>
        <CapabilityToggle checked={modelDraft.reasoning} label="支持思考" onCheckedChange={(reasoning) => setModelDraft((current) => ({ ...current, reasoning }))} />
        <CapabilityToggle checked={modelDraft.toolCall} label="支持工具调用" onCheckedChange={(toolCall) => setModelDraft((current) => ({ ...current, toolCall }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-xs font-medium">输入模态</p>
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
          <p className="text-xs font-medium">输出模态</p>
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
      <div className="flex justify-end gap-2"><Button onClick={() => { setEditingModelID(undefined); setModelVariantLabelDraft({}); }} size="sm" type="button" variant="ghost">取消</Button><Button disabled={saving} onClick={() => void saveModel()} size="sm" type="button"><Check className="size-3.5" />保存模型</Button></div>
    </div>
  );

  const providerForm = (
    <>
      <div className="flex min-w-0 items-center gap-2 pb-4">
        {isNewProvider && <Button aria-label="返回供应商列表" className="size-7" onClick={() => setNewProviderStep("choose")} size="icon-sm" title="返回" type="button" variant="ghost"><ArrowLeft className="size-3.5" /></Button>}
        <Cpu className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{isNewProvider ? providerDraft.name || "自定义供应商" : providerName(selectedID, catalog)}</h3>
        {!isNewProvider && <Badge variant="secondary">{providerDraft.disabled ? "已停用" : "已启用"}</Badge>}
      </div>

      {providerDraft.catalogProvider ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-md bg-muted/35 px-3 py-3 sm:grid-cols-2">
            <div><p className="text-[11px] text-muted-foreground">供应商 ID</p><p className="mt-1 truncate font-mono text-xs">{providerDraft.id}</p></div>
            <div><p className="text-[11px] text-muted-foreground">内置适配器</p><p className="mt-1 truncate font-mono text-xs">{providerDraft.npm || "OpenCode native"}</p></div>
            {providerDraft.baseURL && <div className="sm:col-span-2"><p className="text-[11px] text-muted-foreground">默认地址</p><p className="mt-1 break-all font-mono text-xs">{providerDraft.baseURL}</p></div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingField label="API Key"><div className="relative"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={isNewProvider ? "输入供应商 API Key" : "留空则保留现有凭据"} type={showKey ? "text" : "password"} value={providerDraft.apiKey} /><Button aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} className="absolute right-1 top-1" onClick={() => setShowKey((value) => !value)} size="icon-xs" title={showKey ? "隐藏 API Key" : "显示 API Key"} type="button" variant="ghost">{showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button></div></SettingField>
            <label className="flex items-end gap-2 pb-2 text-xs"><Switch checked={!providerDraft.disabled} onCheckedChange={(checked) => setProviderDraft((current) => ({ ...current, disabled: !checked }))} />启用此供应商</label>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingField label="供应商 ID"><Input disabled={!isNewProvider} onChange={(event) => setProviderDraft((current) => ({ ...current, id: event.target.value.trim() }))} placeholder="例如 company-api" value={providerDraft.id} /></SettingField>
          <SettingField label="显示名称"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 公司 API" value={providerDraft.name} /></SettingField>
          <SettingField label="接口协议"><Select onValueChange={(value: SdkType) => { const option = sdkOptions.find((item) => item.id === value); setProviderDraft((current) => ({ ...current, npm: option?.npm ?? current.npm, sdkType: value })); }} value={providerDraft.sdkType}><SelectTrigger className="w-full border-border/60 shadow-none"><SelectValue /></SelectTrigger><SelectContent className="border-0 ring-1 ring-border/40">{sdkOptions.map((option) => <SelectItem key={option.id} value={option.id}><span className="flex flex-col"><span>{option.label}</span><span className="text-[10px] text-muted-foreground">{option.description}</span></span></SelectItem>)}</SelectContent></Select></SettingField>
          <SettingField label="Base URL"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, baseURL: event.target.value }))} placeholder="https://api.example.com/v1" value={providerDraft.baseURL} /></SettingField>
          <SettingField label="API Key"><div className="relative"><Input onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder="留空则保留现有凭据" type={showKey ? "text" : "password"} value={providerDraft.apiKey} /><Button aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} className="absolute right-1 top-1" onClick={() => setShowKey((value) => !value)} size="icon-xs" title={showKey ? "隐藏 API Key" : "显示 API Key"} type="button" variant="ghost">{showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button></div></SettingField>
          <label className="flex items-end gap-2 pb-2 text-xs"><Switch checked={!providerDraft.disabled} onCheckedChange={(checked) => setProviderDraft((current) => ({ ...current, disabled: !checked }))} />启用此供应商</label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {!isNewProvider && providerDraft.catalogProvider && <Button disabled={saving} onClick={() => void removeProviderCredential()} size="sm" type="button" variant="ghost">移除凭据</Button>}
        {!isNewProvider && !providerDraft.catalogProvider && (
          <Button
            disabled={saving}
            onClick={() => setPendingDeleteProviderID(providerDraft.id || selectedID)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5 text-destructive" />
            移除供应商
          </Button>
        )}
        <Button disabled={saving} onClick={() => void saveProvider()} size="sm" type="button"><Save className="size-3.5" />保存供应商</Button>
      </div>

      {!isNewProvider && <div className="mt-7 border-t border-border/50 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">模型列表</h3><p className="mt-1 text-xs text-muted-foreground">展开后直接在当前模型下面编辑。</p></div><Button onClick={() => { setEditingModelID("new"); setModelDraft(emptyModel()); setModelVariantLabelDraft({}); }} size="sm" type="button" variant="ghost"><Plus className="size-3.5" />添加模型</Button></div>
        <div className="mt-3 divide-y divide-border/50 bg-muted/20">
          {editingModelID === "new" && modelEditor}
          {modelIDs.length === 0 && editingModelID !== "new" ? <p className="p-4 text-sm text-muted-foreground">尚未配置模型</p> : modelIDs.map((id) => {
            const model = draftForModel(id);
            return <div key={id}>
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggleModelEditor(id)} type="button">
                  <span className={cn("size-1.5 shrink-0 rounded-full", model.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{model.name}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{id}</span></span>
                  {model.context && <Badge variant="secondary">{model.context}</Badge>}
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", editingModelID === id && "rotate-180")} />
                </button>
                <Switch aria-label={`${model.enabled ? "停用" : "启用"}模型 ${model.name}`} checked={model.enabled} disabled={saving} onCheckedChange={(enabled) => void setModelEnabled(id, enabled)} size="sm" />
                <Button aria-label={`移除模型 ${model.name}`} className="size-8 shrink-0" disabled={saving} onClick={() => setPendingDeleteModelID(id)} size="icon-sm" title="移除模型" type="button" variant="ghost"><Trash2 className="size-3.5 text-muted-foreground" /></Button>
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
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">模型设置</h2><p className="mt-1 text-sm text-muted-foreground">管理已连接供应商，并从 OpenCode 内置目录添加新的服务。</p></div><Button aria-label="刷新模型配置" disabled={loading} onClick={() => void load(selectedID)} size="icon-sm" title="刷新" type="button" variant="ghost"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button></header>
      {error && <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span></div>}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="flex max-h-44 min-h-0 flex-col rounded-md bg-muted/30 p-1.5 md:max-h-none">
          <div className="flex h-9 shrink-0 items-center justify-between gap-1 px-2"><p className="truncate text-[11px] font-medium text-muted-foreground">供应商</p><Button aria-label="添加供应商" className="size-7 shrink-0" onClick={beginNewProvider} size="icon-sm" title="添加供应商" type="button" variant={isNewProvider ? "secondary" : "ghost"}><Plus className="size-3.5" /></Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{providerIDs.map((id) => <Button className="mb-0.5 w-full justify-start gap-2 px-2" key={id} onClick={() => selectProvider(id)} size="sm" type="button" variant={id === selectedID && !isNewProvider ? "secondary" : "ghost"}><span className={cn("size-1.5 shrink-0 rounded-full", config.disabled_providers?.includes(id) ? "bg-muted-foreground" : "bg-emerald-500")} /><span className="truncate">{providerName(id, catalog)}</span></Button>)}</div>
        </aside>
        <div className={cn("flex min-h-0 min-w-0 flex-col overscroll-contain pr-1", isNewProvider && newProviderStep === "choose" ? "overflow-hidden" : "overflow-y-auto")}>
          {isNewProvider && newProviderStep === "choose" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div><h3 className="text-base font-semibold">添加供应商</h3><p className="mt-1 text-xs text-muted-foreground">优先选择 OpenCode 内置供应商；只有自建兼容接口需要完整配置。</p></div>
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input className="pl-8" onChange={(event) => setProviderSearch(event.target.value)} placeholder="搜索供应商名称或 ID" value={providerSearch} /></div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/20 p-1">
                <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent" onClick={chooseCustomProvider} type="button"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background"><Plus className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">自定义供应商</span><span className="block text-xs text-muted-foreground">配置 OpenAI Responses、OpenAI 兼容或 Anthropic 接口</span></span></button>
                {availableCatalogProviders.map((provider) => {
                  const modelCount = Object.keys(provider.models).length;
                  return <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent" key={provider.id} onClick={() => chooseCatalogProvider(provider.id)} type="button"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background font-mono text-[10px] uppercase">{provider.name.slice(0, 2)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{provider.name}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{provider.id}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{modelCount > 0 ? `${modelCount} 模型` : "配置后加载"}</span></button>;
                })}
                {availableCatalogProviders.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的内置供应商</p>}
              </div>
            </div>
          ) : selectedID || isNewProvider ? providerForm : <div className="flex min-h-56 flex-col items-start justify-center gap-3"><p className="text-sm font-medium">还没有可用供应商</p><Button onClick={beginNewProvider} size="sm" type="button"><Plus className="size-3.5" />添加供应商</Button></div>}
        </div>
      </div>
    </section>
    <Dialog onOpenChange={(open) => { if (!open) setPendingDeleteProviderID(undefined); }} open={Boolean(pendingDeleteProviderID)}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-base">移除这个供应商？</DialogTitle><DialogDescription>将从配置中删除 {pendingDeleteProviderID} 及其模型。若 OpenCode 不支持删除配置项，会退回为停用并提示你手动清理。</DialogDescription></DialogHeader>
        <DialogFooter><Button onClick={() => setPendingDeleteProviderID(undefined)} size="sm" type="button" variant="ghost">取消</Button><Button disabled={saving} onClick={() => void deleteProvider()} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />移除供应商</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog onOpenChange={(open) => { if (!open) setPendingDeleteModelID(undefined); }} open={Boolean(pendingDeleteModelID)}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-base">移除这个模型？</DialogTitle><DialogDescription>将从当前供应商的可用模型中隐藏 {pendingDeleteModelID}，OpenCode 后续不会再加载它。</DialogDescription></DialogHeader>
        <DialogFooter><Button onClick={() => setPendingDeleteModelID(undefined)} size="sm" type="button" variant="ghost">取消</Button><Button disabled={saving} onClick={() => void deleteModel()} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />移除模型</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
