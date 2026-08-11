import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  FolderCog,
  HardDrive,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  EnvironmentVariable,
  EnvironmentVariableName,
  EnvironmentVariableValue,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
} from "@/components/ai-elements/environment-variables";
import { MemoryEmbeddingSettings } from "@/components/assistant/MemoryEmbeddingSettings";
import { MemoryModelPicker } from "@/components/assistant/MemoryModelPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ideaApi } from "@/lib/idea";
import { cn } from "@/lib/utils";
import type {
  DevelopmentEnvironmentInfo,
  MemoryItem,
  MemorySettingsRequest,
  MemorySystemStatus,
  MemoryUserProfile,
} from "@/lib/idea";
import type { ModelInfo } from "@/lib/opencode";
import { getLocale, t } from "@/lib/i18n";

interface MemorySettingsProps {
  models: ModelInfo[];
  onChanged?: () => void;
}

type BusyAction = "add" | "dashboard" | "delete" | "environment" | "install" | "profile" | "save" | "scan" | "";

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const settingsFromStatus = (status: MemorySystemStatus): MemorySettingsRequest => ({
  autoCaptureEnabled: status.autoCaptureEnabled,
  autoInstall: status.autoInstall,
  crossProjectEnabled: status.crossProjectEnabled,
  enabled: status.enabled,
  environmentSyncEnabled: status.environmentSyncEnabled,
  memoryModel: status.memoryModel,
  memoryProvider: status.memoryProvider,
  profileEnabled: status.profileEnabled,
  storagePath: status.storagePath,
});

const formatDate = (value?: number | string): string => {
  if (!value) return t("s_6da92c1601");
  const date = new Date(value);
  // Formatting followed the Chinese locale even with the panel in English, which is the one place
  // a hardcoded locale survives a translation pass unnoticed.
  const locale = getLocale() === "zh" ? "zh-CN" : "en-US";
  return Number.isNaN(date.getTime()) ? t("s_d9c32a4c3d") : date.toLocaleString(locale, { hour12: false });
};

const profileRows = (profile: MemoryUserProfile | null) => [
  { icon: UserRound, items: profile?.profileData?.preferences ?? [], label: t("s_dfdf11c5fd") },
  { icon: Brain, items: profile?.profileData?.patterns ?? [], label: t("s_0c5992442b") },
  { icon: Sparkles, items: profile?.profileData?.workflows ?? [], label: t("s_cc19798b0c") },
];

interface ToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ checked, description, disabled, label, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function MemorySettings({ models, onChanged }: MemorySettingsProps) {
  const [status, setStatus] = useState<MemorySystemStatus | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [profile, setProfile] = useState<MemoryUserProfile | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [environmentDraft, setEnvironmentDraft] = useState<DevelopmentEnvironmentInfo | null>(null);
  const [environmentDeleteTarget, setEnvironmentDeleteTarget] = useState<DevelopmentEnvironmentInfo | null>(null);
  const [query, setQuery] = useState("");
  const [newMemory, setNewMemory] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const [busy, setBusy] = useState<BusyAction>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadMemoryData = useCallback(async (nextStatus: MemorySystemStatus) => {
    if (!nextStatus.pluginReady) {
      setMemories([]);
      setProfile(null);
      return;
    }
    const [memoryResult, profileResult] = await Promise.all([
      ideaApi.listMemories(),
      ideaApi.getMemoryProfile(),
    ]);
    if (!memoryResult.success) throw new Error(memoryResult.error || t("s_d53ba8c809"));
    setMemories(memoryResult.data?.items ?? []);
    if (profileResult.success) setProfile(profileResult.data ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextStatus = await ideaApi.getMemoryStatus();
      setStatus(nextStatus);
      setProvider(nextStatus.memoryProvider ?? "");
      setModel(nextStatus.memoryModel ?? "");
      setStoragePath(nextStatus.storagePath);
      await loadMemoryData(nextStatus);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadMemoryData]);

  useEffect(() => { void refresh(); }, [refresh]);

  const applyStatus = async (nextStatus: MemorySystemStatus, message?: string) => {
    setStatus(nextStatus);
    setProvider(nextStatus.memoryProvider ?? "");
    setModel(nextStatus.memoryModel ?? "");
    setStoragePath(nextStatus.storagePath);
    setNotice(message ?? t("s_4241b02109"));
    await loadMemoryData(nextStatus);
    onChanged?.();
  };

  const saveSettings = async (patch: Partial<MemorySettingsRequest>) => {
    if (!status || busy) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.updateMemorySettings({ ...settingsFromStatus(status), ...patch });
      if (!result.success || !result.status) throw new Error(result.message || t("s_f0401baae9"));
      await applyStatus(result.status, result.message);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy("");
    }
  };

  const install = async () => {
    if (busy) return;
    setBusy("install");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.installMemorySystem();
      if (!result.success || !result.status) throw new Error(result.message || t("s_a52a292623"));
      await applyStatus(result.status, result.message);
    } catch (installError) {
      setError(errorMessage(installError));
    } finally {
      setBusy("");
    }
  };

  const scan = async () => {
    if (busy) return;
    setBusy("scan");
    setError("");
    try {
      const result = await ideaApi.scanDevelopmentEnvironments(true);
      if (!result.success || !result.status) throw new Error(result.message || t("s_f1e096de79"));
      await applyStatus(result.status, result.message);
    } catch (scanError) {
      setError(errorMessage(scanError));
    } finally {
      setBusy("");
    }
  };

  const persistEnvironments = async (environments: DevelopmentEnvironmentInfo[]) => {
    if (!status || busy) return;
    setBusy("environment");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.saveDevelopmentEnvironments(environments, true);
      if (!result.success || !result.status) throw new Error(result.message || t("s_02d816f46e"));
      setEnvironmentDraft(null);
      setEnvironmentDeleteTarget(null);
      await applyStatus(result.status, result.message);
    } catch (environmentError) {
      setError(errorMessage(environmentError));
    } finally {
      setBusy("");
    }
  };

  const openEnvironmentEditor = (environment?: DevelopmentEnvironmentInfo) => {
    setEnvironmentDraft(environment
      ? { ...environment, paths: [...environment.paths] }
      : {
          id: `manual-${Date.now()}`,
          manual: true,
          name: "",
          paths: [""],
          source: t("s_2a4a4de806"),
          version: "",
        });
  };

  const saveEnvironment = async () => {
    if (!status || !environmentDraft) return;
    const name = environmentDraft.name.trim();
    const paths = environmentDraft.paths.map((path) => path.trim()).filter(Boolean);
    if (!name || paths.length === 0) {
      setError(t("s_497c7cfa99"));
      return;
    }
    const nextEnvironment: DevelopmentEnvironmentInfo = {
      ...environmentDraft,
      manual: true,
      name,
      paths,
      source: t("s_2a4a4de806"),
      version: environmentDraft.version?.trim() || undefined,
    };
    const exists = status.environments.some((environment) => environment.id === nextEnvironment.id);
    const environments = exists
      ? status.environments.map((environment) => environment.id === nextEnvironment.id ? nextEnvironment : environment)
      : [...status.environments, nextEnvironment];
    await persistEnvironments(environments);
  };

  const deleteEnvironment = async () => {
    if (!status || !environmentDeleteTarget) return;
    await persistEnvironments(status.environments.filter((environment) => environment.id !== environmentDeleteTarget.id));
  };

  const refreshProfile = async () => {
    if (busy || !status?.pluginReady) return;
    setBusy("profile");
    setError("");
    try {
      const result = await ideaApi.refreshMemoryProfile();
      if (!result.success) throw new Error(result.error || t("s_e3011be148"));
      setProfile(result.data ?? null);
      setNotice(result.message || t("s_1a41d1e575"));
    } catch (profileError) {
      setError(errorMessage(profileError));
    } finally {
      setBusy("");
    }
  };

  const addMemory = async () => {
    const content = newMemory.trim();
    if (!content || busy) return;
    setBusy("add");
    setError("");
    try {
      const result = await ideaApi.addMemory(content);
      if (!result.success) throw new Error(result.error || t("s_253def22ad"));
      setNewMemory("");
      setAddOpen(false);
      setNotice(t("s_e52b5401db"));
      const memoryResult = await ideaApi.listMemories();
      if (memoryResult.success) setMemories(memoryResult.data?.items ?? []);
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setBusy("");
    }
  };

  const deleteMemory = async () => {
    if (!deleteTarget || busy) return;
    setBusy("delete");
    setError("");
    try {
      const result = await ideaApi.deleteMemory(deleteTarget.id);
      if (!result.success) throw new Error(result.error || t("s_2be1f08d7c"));
      setMemories((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice(t("s_487c083835"));
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy("");
    }
  };

  const openDashboard = async () => {
    if (busy || !status?.pluginReady) return;
    setBusy("dashboard");
    setError("");
    try {
      const result = await ideaApi.openMemoryDashboard();
      if (!result.success) throw new Error(result.message || t("s_70430a7138"));
    } catch (dashboardError) {
      setError(errorMessage(dashboardError));
    } finally {
      setBusy("");
    }
  };

  const filteredMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memories;
    return memories.filter((item) => [item.content, item.displayName, item.projectName, ...(item.tags ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [memories, query]);

  const integrated = status?.plugins.some((plugin) => plugin.fullIntegration) ?? false;
  const controlsDisabled = !status || Boolean(busy) || !integrated;
  const selectedMemoryModelKey = provider && model ? `${provider}/${model}` : "";
  const modelChanged = provider !== (status?.memoryProvider ?? "") || model !== (status?.memoryModel ?? "");
  const storageChanged = storagePath.trim() !== (status?.storagePath ?? "");
  const editingExistingEnvironment = Boolean(environmentDraft && status?.environments.some((environment) => environment.id === environmentDraft.id));

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-5">
        <div>
          <h2 className="text-lg font-semibold">{t("s_3bede49d8d")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("s_2b00f5a6ce")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label={t("s_2e96a307c2")} disabled={loading || Boolean(busy)} onClick={() => void refresh()} size="icon-sm" title={t("s_38108eaa1d")} type="button" variant="ghost">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          {status?.pluginReady && <Button onClick={() => void openDashboard()} size="sm" type="button" variant="ghost"><ExternalLink className="size-3.5" />{t("s_fb987913ba")}</Button>}
        </div>
      </header>

      {error && <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span></div>}
      {notice && !error && <div className="mt-4 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-500"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /><span>{notice}</span></div>}

      <section className="grid gap-5 border-b border-border/50 py-6 md:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("s_97fb12960e")}</h3>
            {status && <Badge variant={status.pluginReady ? "secondary" : "outline"}>{status.pluginReady ? t("s_5942497005") : status.installed ? t("s_1fedf0f4ce") : t("s_6f7dc945ae")}</Badge>}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t("s_902014770b")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(status?.plugins ?? []).map((plugin) => (
              <div className="min-w-44 rounded-md bg-muted/50 px-3 py-2" key={plugin.id}>
                <div className="flex items-center gap-2"><span className="text-xs font-medium">{plugin.name}</span>{plugin.fullIntegration && <Badge variant="secondary">{t("s_673cd296a4")}</Badge>}</div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{plugin.description}</p>
              </div>
            ))}
            {status && status.plugins.length === 0 && <span className="text-xs text-muted-foreground">{t("s_c296a2a618")}</span>}
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3">
          {!integrated && <Button disabled={busy === "install"} onClick={() => void install()} size="sm" type="button">
            {busy === "install" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {t("s_a0c3ce22e1")}
          </Button>}
          <label className="grid gap-1.5 text-xs font-medium">
            <span className="flex items-center gap-1.5"><FolderCog className="size-3.5 text-muted-foreground" />{t("s_dc7cc4071b")}</span>
            <Input disabled={controlsDisabled} onChange={(event) => setStoragePath(event.target.value)} placeholder={t("s_8a2cf2985e")} value={storagePath} />
          </label>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">{t("s_9bc390c6f8")}</p>
            <Button disabled={controlsDisabled || !storagePath.trim() || !storageChanged} onClick={() => void saveSettings({ storagePath: storagePath.trim() })} size="sm" type="button" variant="secondary">{t("s_45561b8ad5")}</Button>
          </div>
          {status?.restartRequired && <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-500">{t("s_05d0a72e19")}</p>}
        </div>
      </section>

      <MemoryEmbeddingSettings onChanged={() => void refresh()} />

      <section className="border-b border-border/50 py-6">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{t("s_7ea0593117")}</h3></div>
        <div className="mt-3 divide-y divide-border/40">
          <ToggleRow checked={status?.enabled ?? true} description={t("s_e208f8da03")} disabled={!status || Boolean(busy) || !integrated} label={t("s_b89301d015")} onCheckedChange={(enabled) => void saveSettings({ enabled })} />
          <ToggleRow checked={status?.autoInstall ?? true} description={t("s_cf45de7a13")} disabled={!status || Boolean(busy)} label={t("s_5e668edc4f")} onCheckedChange={(autoInstall) => void saveSettings({ autoInstall })} />
          <ToggleRow checked={status?.autoCaptureEnabled ?? true} description={t("s_9f6d6428bf")} disabled={controlsDisabled} label={t("s_b6ff4b96a5")} onCheckedChange={(autoCaptureEnabled) => void saveSettings({ autoCaptureEnabled })} />
          <ToggleRow checked={status?.crossProjectEnabled ?? true} description={t("s_a39a2707b6")} disabled={controlsDisabled} label={t("s_d6c26ab834")} onCheckedChange={(crossProjectEnabled) => void saveSettings({ crossProjectEnabled })} />
          <ToggleRow checked={status?.profileEnabled ?? true} description={t("s_2608f5fa8d")} disabled={controlsDisabled} label={t("s_b8ae355f4b")} onCheckedChange={(profileEnabled) => void saveSettings({ profileEnabled })} />
          <ToggleRow checked={status?.environmentSyncEnabled ?? true} description={t("s_4e0858d9a1")} disabled={controlsDisabled} label={t("s_a65c20899b")} onCheckedChange={(environmentSyncEnabled) => void saveSettings({ environmentSyncEnabled })} />
        </div>
        <div className="mt-4 grid gap-1.5">
          <p className="text-xs font-medium">{t("s_f1e2be3258")}</p>
          <MemoryModelPicker
            disabled={controlsDisabled || models.length === 0}
            models={models}
            onChange={(nextModel) => { setProvider(nextModel.providerID); setModel(nextModel.id); }}
            value={selectedMemoryModelKey}
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            {t("s_ba2c499521")}
          </p>
          {status && status.captureCallsTotal > 0 && (
            <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] leading-5 text-muted-foreground">
              {t("s_1a17e730d7")} <b className="font-mono">{status.captureCallsTotal}</b> {t("s_160b4abe5c")} <b className="font-mono">{status.captureCallsThisMonth}</b> {t("s_04482bab8a")}
            </p>
          )}
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={controlsDisabled || !provider.trim() || !model.trim() || !modelChanged} onClick={() => void saveSettings({ memoryModel: model.trim(), memoryProvider: provider.trim() })} size="sm" type="button" variant="secondary">{t("s_895132d584")}</Button></div>
      </section>

      <section className="border-b border-border/50 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><Brain className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{t("s_822dcdf5ff")}</h3></div><p className="mt-1 text-xs text-muted-foreground">{t("s_38d69c8d20")} {profile?.totalPromptsAnalyzed ?? 0} {t("s_8137b500ba")} {formatDate(profile?.lastAnalyzedAt)}</p></div>
          <Button disabled={!status?.pluginReady || Boolean(busy)} onClick={() => void refreshProfile()} size="sm" type="button" variant="ghost">{busy === "profile" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("s_5387b55bb9")}</Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {profileRows(profile).map(({ icon: Icon, items, label }) => <div className="min-w-0" key={label}><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Icon className="size-3.5 text-muted-foreground" />{label}<span className="text-muted-foreground">{items.length}</span></div>{items.length === 0 ? <p className="text-xs text-muted-foreground">{t("s_9fb420b466")}{label}</p> : <div className="space-y-2">{items.slice(0, 5).map((item, index) => <div className="rounded-md bg-muted/40 px-3 py-2" key={`${label}-${index}`}><p className="text-xs leading-5">{item.description || item.category || t("s_7ff24384ed")}</p>{item.category && item.description && <p className="mt-1 text-[11px] text-muted-foreground">{item.category}</p>}</div>)}</div>}</div>)}
        </div>
      </section>

      <section className="border-b border-border/50 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><HardDrive className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{t("s_4b5373fafb")}</h3></div><p className="mt-1 text-xs text-muted-foreground">{t("s_6edb56748b")} {formatDate(status?.lastEnvironmentScan)}{t("s_e6d3975537")} {status?.environments?.length ?? 0} {t("s_224b86cd59")}</p></div>
          <div className="flex items-center gap-1">
            <Button disabled={!integrated || Boolean(busy)} onClick={() => openEnvironmentEditor()} size="sm" type="button" variant="ghost"><Plus className="size-3.5" />{t("s_839137597d")}</Button>
            <Button disabled={!integrated || Boolean(busy)} onClick={() => void scan()} size="sm" type="button" variant="ghost">{busy === "scan" ? <LoaderCircle className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}{t("s_09b02ae9e6")}</Button>
          </div>
        </div>
        <EnvironmentVariables className="mt-4 overflow-hidden border-border/50 bg-muted/10" defaultShowValues>
          <EnvironmentVariablesHeader className="border-border/40 px-3 py-2"><EnvironmentVariablesTitle>{t("s_97791f247a")}</EnvironmentVariablesTitle><EnvironmentVariablesToggle /></EnvironmentVariablesHeader>
          <EnvironmentVariablesContent className="max-h-80 divide-border/40 overflow-y-auto">
            {(status?.environments ?? []).map((environment) => (
              <EnvironmentVariable className="group items-start px-3 py-2.5" key={environment.id} name={environment.name} value={environment.paths.join(" · ")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><EnvironmentVariableName className="text-xs font-medium" />{environment.version && <span className="truncate text-[11px] text-muted-foreground">{environment.version}</span>}</div>
                  <EnvironmentVariableValue className="mt-1 block break-all text-[11px] leading-4" />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{environment.manual ? t("s_2a4a4de806") : environment.source}</Badge>
                  <Button aria-label={t("s_21883020e2", { p0: environment.name })} className="opacity-65 group-hover:opacity-100" disabled={Boolean(busy)} onClick={() => openEnvironmentEditor(environment)} size="icon-xs" title={t("s_d6230a90ed")} type="button" variant="ghost"><PencilLine className="size-3.5" /></Button>
                  <Button aria-label={t("s_05cefdc56b", { p0: environment.name })} className="opacity-65 group-hover:opacity-100" disabled={Boolean(busy)} onClick={() => setEnvironmentDeleteTarget(environment)} size="icon-xs" title={t("s_49209e9ce3")} type="button" variant="ghost"><Trash2 className="size-3.5" /></Button>
                </div>
              </EnvironmentVariable>
            ))}
            {(status?.environments ?? []).length === 0 && <p className="px-3 py-5 text-xs text-muted-foreground">{t("s_a6c6006bdb")}</p>}
          </EnvironmentVariablesContent>
        </EnvironmentVariables>
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{t("s_b9cefcc4be")}</p>
      </section>

      <section className="py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{t("s_37b4767a28")}</h3></div><p className="mt-1 text-xs text-muted-foreground">{t("s_7fefbaff66")} {memories.length} {t("s_a238bf4ca7")}</p></div>
          <Button disabled={!status?.pluginReady} onClick={() => setAddOpen(true)} size="sm" type="button"><Plus className="size-3.5" />{t("s_93ddc16fe9")}</Button>
        </div>
        <div className="relative mt-4 max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" onChange={(event) => setQuery(event.target.value)} placeholder={t("s_d89ba2e4a5")} value={query} /></div>
        <div className="mt-4 divide-y divide-border/40">
          {filteredMemories.slice(0, 30).map((memory) => <article className="group flex items-start gap-3 py-3" key={memory.id}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{memory.displayName && <span className="text-xs font-medium">{memory.displayName}</span>}{memory.projectName && <Badge variant="outline">{memory.projectName}</Badge>}{memory.memoryType && <Badge variant="secondary">{memory.memoryType}</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground/90">{memory.content}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(memory.updatedAt ?? memory.createdAt)}</p></div><Button aria-label={t("s_e56b09f417")} className="opacity-60 group-hover:opacity-100" onClick={() => setDeleteTarget(memory)} size="icon-sm" title={t("s_3755f56f2f")} type="button" variant="ghost"><Trash2 className="size-3.5" /></Button></article>)}
          {!loading && filteredMemories.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">{t("s_98bd35ed62")}</p>}
        </div>
      </section>

      <Dialog onOpenChange={(open) => !open && setEnvironmentDraft(null)} open={Boolean(environmentDraft)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingExistingEnvironment ? t("s_afb081a177") : t("s_5345321aa5")}</DialogTitle>
            <DialogDescription>{t("s_dd3c70b649")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">{t("s_66331089cf")}<Input autoFocus onChange={(event) => setEnvironmentDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder={t("s_89fa80f953")} value={environmentDraft?.name ?? ""} /></label>
            <label className="grid gap-1.5 text-xs font-medium">{t("s_14d6c4d088")}<Input onChange={(event) => setEnvironmentDraft((current) => current ? { ...current, version: event.target.value } : current)} placeholder={t("s_b17ebba6fc")} value={environmentDraft?.version ?? ""} /></label>
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">{t("s_5390991abe")}<Textarea className="min-h-28 resize-y font-mono text-xs leading-5" onChange={(event) => setEnvironmentDraft((current) => current ? { ...current, paths: event.target.value.split(/\r?\n/) } : current)} placeholder={t("s_a1f1c0a64d")} value={(environmentDraft?.paths ?? []).join("\n")} /></label>
          </div>
          <DialogFooter>
            <Button onClick={() => setEnvironmentDraft(null)} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
            <Button disabled={busy === "environment" || !environmentDraft?.name.trim() || !environmentDraft.paths.some((path) => path.trim())} onClick={() => void saveEnvironment()} type="button">{busy === "environment" && <LoaderCircle className="size-3.5 animate-spin" />}{t("s_f9943fa0b9")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setEnvironmentDeleteTarget(null)} open={Boolean(environmentDeleteTarget)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("s_8140b7b527")}</DialogTitle>
            <DialogDescription>{t("s_0f83ccc7d7")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs"><p className="font-medium">{environmentDeleteTarget?.name}</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{(environmentDeleteTarget?.paths ?? []).join(" · ")}</p></div>
          <DialogFooter>
            <Button onClick={() => setEnvironmentDeleteTarget(null)} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
            <Button disabled={busy === "environment"} onClick={() => void deleteEnvironment()} type="button" variant="destructive">{busy === "environment" && <LoaderCircle className="size-3.5 animate-spin" />}{t("s_49209e9ce3")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setAddOpen} open={addOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("s_994606baa5")}</DialogTitle><DialogDescription>{t("s_0123b9469f")}</DialogDescription></DialogHeader><Textarea autoFocus className="min-h-36" onChange={(event) => setNewMemory(event.target.value)} placeholder={t("s_03df5b1b01")} value={newMemory} /><DialogFooter><Button onClick={() => setAddOpen(false)} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button><Button disabled={!newMemory.trim() || busy === "add"} onClick={() => void addMemory()} type="button">{busy === "add" && <LoaderCircle className="size-3.5 animate-spin" />}{t("s_ee13e8e80b")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog onOpenChange={(open) => !open && setDeleteTarget(null)} open={Boolean(deleteTarget)}><DialogContent><DialogHeader><DialogTitle>{t("s_465f55bc0a")}</DialogTitle><DialogDescription>{t("s_e0eb73002d")}</DialogDescription></DialogHeader><div className="max-h-32 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-xs leading-5">{deleteTarget?.content}</div><DialogFooter><Button onClick={() => setDeleteTarget(null)} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button><Button disabled={busy === "delete"} onClick={() => void deleteMemory()} type="button" variant="destructive">{busy === "delete" && <LoaderCircle className="size-3.5 animate-spin" />}{t("s_3755f56f2f")}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
