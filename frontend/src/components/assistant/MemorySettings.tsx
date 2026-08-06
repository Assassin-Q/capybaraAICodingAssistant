import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  HardDrive,
  LoaderCircle,
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
  MemoryItem,
  MemorySettingsRequest,
  MemorySystemStatus,
  MemoryUserProfile,
} from "@/lib/idea";

interface MemorySettingsProps {
  onChanged?: () => void;
}

type BusyAction = "add" | "dashboard" | "delete" | "install" | "profile" | "save" | "scan" | "";

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
});

const formatDate = (value?: number | string): string => {
  if (!value) return "尚未执行";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
};

const profileRows = (profile: MemoryUserProfile | null) => [
  { icon: UserRound, items: profile?.profileData?.preferences ?? [], label: "偏好" },
  { icon: Brain, items: profile?.profileData?.patterns ?? [], label: "习惯" },
  { icon: Sparkles, items: profile?.profileData?.workflows ?? [], label: "工作流" },
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

export function MemorySettings({ onChanged }: MemorySettingsProps) {
  const [status, setStatus] = useState<MemorySystemStatus | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [profile, setProfile] = useState<MemoryUserProfile | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
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
    if (!memoryResult.success) throw new Error(memoryResult.error || "读取记忆失败");
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
    setNotice(message ?? "设置已更新");
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
      if (!result.success || !result.status) throw new Error(result.message || "保存记忆设置失败");
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
      if (!result.success || !result.status) throw new Error(result.message || "安装记忆插件失败");
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
      if (!result.success || !result.status) throw new Error(result.message || "扫描开发环境失败");
      await applyStatus(result.status, result.message);
    } catch (scanError) {
      setError(errorMessage(scanError));
    } finally {
      setBusy("");
    }
  };

  const refreshProfile = async () => {
    if (busy || !status?.pluginReady) return;
    setBusy("profile");
    setError("");
    try {
      const result = await ideaApi.refreshMemoryProfile();
      if (!result.success) throw new Error(result.error || "刷新用户画像失败");
      setProfile(result.data ?? null);
      setNotice(result.message || "用户画像已刷新");
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
      if (!result.success) throw new Error(result.error || "新增记忆失败");
      setNewMemory("");
      setAddOpen(false);
      setNotice("已加入跨项目用户记忆");
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
      if (!result.success) throw new Error(result.error || "删除记忆失败");
      setMemories((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice("记忆已删除");
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
      if (!result.success) throw new Error(result.message || "打开管理面板失败");
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

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-5">
        <div>
          <h2 className="text-lg font-semibold">用户记忆</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            自动沉淀跨会话、跨项目的偏好和技术上下文，并维护本机可复用的开发环境索引。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label="刷新记忆状态" disabled={loading || Boolean(busy)} onClick={() => void refresh()} size="icon-sm" title="刷新" type="button" variant="ghost">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          {status?.pluginReady && <Button onClick={() => void openDashboard()} size="sm" type="button" variant="ghost"><ExternalLink className="size-3.5" />完整管理</Button>}
        </div>
      </header>

      {error && <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span></div>}
      {notice && !error && <div className="mt-4 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-500"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /><span>{notice}</span></div>}

      <section className="grid gap-5 border-b border-border/50 py-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">记忆引擎</h3>
            {status && <Badge variant={status.pluginReady ? "secondary" : "outline"}>{status.pluginReady ? "运行中" : status.installed ? "等待重载" : "未安装"}</Badge>}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            默认使用本地向量存储的 OpenCode Mem。检测到其他社区记忆插件时会保留并展示，不会覆盖用户现有方案。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {status?.plugins.map((plugin) => (
              <div className="min-w-44 rounded-md bg-muted/50 px-3 py-2" key={plugin.id}>
                <div className="flex items-center gap-2"><span className="text-xs font-medium">{plugin.name}</span>{plugin.fullIntegration && <Badge variant="secondary">已接管设置</Badge>}</div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{plugin.description}</p>
              </div>
            ))}
            {status && status.plugins.length === 0 && <span className="text-xs text-muted-foreground">未检测到记忆插件</span>}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {!integrated && <Button disabled={busy === "install"} onClick={() => void install()} size="sm" type="button">
            {busy === "install" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            安装本地记忆
          </Button>}
          <p className="break-all text-[11px] leading-4 text-muted-foreground">存储：{status?.storagePath ?? "正在读取"}</p>
          {status?.restartRequired && <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-500">配置已就绪，重载 OpenCode 服务后开始工作。</p>}
        </div>
      </section>

      <section className="border-b border-border/50 py-6">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">自动整理</h3></div>
        <div className="mt-3 divide-y divide-border/40">
          <ToggleRow checked={status?.enabled ?? true} description="暂停时保留已有数据，但不再注入、捕获或更新用户画像。" disabled={!status || Boolean(busy) || !integrated} label="启用用户记忆" onCheckedChange={(enabled) => void saveSettings({ enabled })} />
          <ToggleRow checked={status?.autoInstall ?? true} description="全局没有任何记忆插件时，自动安装 OpenCode Mem。" disabled={!status || Boolean(busy)} label="缺失时自动安装" onCheckedChange={(autoInstall) => void saveSettings({ autoInstall })} />
          <ToggleRow checked={status?.autoCaptureEnabled ?? true} description="会话空闲后提取可长期复用的技术决策、排错经验和偏好。" disabled={controlsDisabled} label="自动捕获" onCheckedChange={(autoCaptureEnabled) => void saveSettings({ autoCaptureEnabled })} />
          <ToggleRow checked={status?.crossProjectEnabled ?? true} description="检索所有项目的记忆，让个人偏好和通用经验跟随到新工作区。" disabled={controlsDisabled} label="跨项目召回" onCheckedChange={(crossProjectEnabled) => void saveSettings({ crossProjectEnabled })} />
          <ToggleRow checked={status?.profileEnabled ?? true} description="根据长期交互整理沟通偏好、工作习惯和常用工作流。" disabled={controlsDisabled} label="学习用户画像" onCheckedChange={(profileEnabled) => void saveSettings({ profileEnabled })} />
          <ToggleRow checked={status?.environmentSyncEnabled ?? true} description="扫描本机 SDK、运行时和工具路径，并同步为一条受控的全局记忆。" disabled={controlsDisabled} label="同步开发环境" onCheckedChange={(environmentSyncEnabled) => void saveSettings({ environmentSyncEnabled })} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">整理模型供应商<Input disabled={controlsDisabled} onChange={(event) => setProvider(event.target.value)} placeholder="例如 anthropic" value={provider} /></label>
          <label className="grid gap-1.5 text-xs font-medium">模型 ID<Input disabled={controlsDisabled} onChange={(event) => setModel(event.target.value)} placeholder="inherit 或模型 ID" value={model} /></label>
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={controlsDisabled || (!provider.trim() && !model.trim())} onClick={() => void saveSettings({ memoryModel: model.trim(), memoryProvider: provider.trim() })} size="sm" type="button" variant="secondary">保存整理模型</Button></div>
      </section>

      <section className="border-b border-border/50 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><Brain className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">用户画像</h3></div><p className="mt-1 text-xs text-muted-foreground">已分析 {profile?.totalPromptsAnalyzed ?? 0} 条提示，上次更新 {formatDate(profile?.lastAnalyzedAt)}</p></div>
          <Button disabled={!status?.pluginReady || Boolean(busy)} onClick={() => void refreshProfile()} size="sm" type="button" variant="ghost">{busy === "profile" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}重新整理</Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {profileRows(profile).map(({ icon: Icon, items, label }) => <div className="min-w-0" key={label}><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Icon className="size-3.5 text-muted-foreground" />{label}<span className="text-muted-foreground">{items.length}</span></div>{items.length === 0 ? <p className="text-xs text-muted-foreground">尚未形成{label}</p> : <div className="space-y-2">{items.slice(0, 5).map((item, index) => <div className="rounded-md bg-muted/40 px-3 py-2" key={`${label}-${index}`}><p className="text-xs leading-5">{item.description || item.category || "未命名条目"}</p>{item.category && item.description && <p className="mt-1 text-[11px] text-muted-foreground">{item.category}</p>}</div>)}</div>}</div>)}
        </div>
      </section>

      <section className="border-b border-border/50 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><HardDrive className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">本机开发环境</h3></div><p className="mt-1 text-xs text-muted-foreground">上次扫描 {formatDate(status?.lastEnvironmentScan)}，共 {status?.environments.length ?? 0} 项。</p></div>
          <Button disabled={!integrated || Boolean(busy)} onClick={() => void scan()} size="sm" type="button" variant="ghost">{busy === "scan" ? <LoaderCircle className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}扫描并同步</Button>
        </div>
        <EnvironmentVariables className="mt-4 overflow-hidden border-border/50 bg-muted/10" defaultShowValues>
          <EnvironmentVariablesHeader className="border-border/40 px-3 py-2"><EnvironmentVariablesTitle>工具与路径</EnvironmentVariablesTitle><EnvironmentVariablesToggle /></EnvironmentVariablesHeader>
          <EnvironmentVariablesContent className="max-h-80 divide-border/40 overflow-y-auto">
            {status?.environments.map((environment) => <EnvironmentVariable className="items-start px-3 py-2.5" key={environment.id} name={environment.name} value={environment.paths.join(" · ")}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><EnvironmentVariableName className="text-xs font-medium" />{environment.version && <span className="truncate text-[11px] text-muted-foreground">{environment.version}</span>}</div><EnvironmentVariableValue className="mt-1 block break-all text-[11px] leading-4" /></div><Badge variant="outline">{environment.source}</Badge></EnvironmentVariable>)}
            {status?.environments.length === 0 && <p className="px-3 py-5 text-xs text-muted-foreground">尚未扫描开发环境</p>}
          </EnvironmentVariablesContent>
        </EnvironmentVariables>
      </section>

      <section className="py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">最近记忆</h3></div><p className="mt-1 text-xs text-muted-foreground">当前读取 {memories.length} 条，可在完整管理面板中查看项目时间线。</p></div>
          <Button disabled={!status?.pluginReady} onClick={() => setAddOpen(true)} size="sm" type="button"><Plus className="size-3.5" />新增记忆</Button>
        </div>
        <div className="relative mt-4 max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" onChange={(event) => setQuery(event.target.value)} placeholder="筛选内容、项目或标签" value={query} /></div>
        <div className="mt-4 divide-y divide-border/40">
          {filteredMemories.slice(0, 30).map((memory) => <article className="group flex items-start gap-3 py-3" key={memory.id}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{memory.displayName && <span className="text-xs font-medium">{memory.displayName}</span>}{memory.projectName && <Badge variant="outline">{memory.projectName}</Badge>}{memory.memoryType && <Badge variant="secondary">{memory.memoryType}</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground/90">{memory.content}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(memory.updatedAt ?? memory.createdAt)}</p></div><Button aria-label="删除记忆" className="opacity-60 group-hover:opacity-100" onClick={() => setDeleteTarget(memory)} size="icon-sm" title="删除" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button></article>)}
          {!loading && filteredMemories.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">没有匹配的记忆</p>}
        </div>
      </section>

      <Dialog onOpenChange={setAddOpen} open={addOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>新增全局记忆</DialogTitle><DialogDescription>适合记录稳定偏好、通用环境约束和需要跨项目保留的经验，不要写入密钥。</DialogDescription></DialogHeader><Textarea autoFocus className="min-h-36" onChange={(event) => setNewMemory(event.target.value)} placeholder="例如：所有前端项目优先使用 pnpm，并在提交前运行 TypeScript 类型检查。" value={newMemory} /><DialogFooter><Button onClick={() => setAddOpen(false)} type="button" variant="ghost">取消</Button><Button disabled={!newMemory.trim() || busy === "add"} onClick={() => void addMemory()} type="button">{busy === "add" && <LoaderCircle className="size-3.5 animate-spin" />}加入记忆</Button></DialogFooter></DialogContent></Dialog>

      <Dialog onOpenChange={(open) => !open && setDeleteTarget(null)} open={Boolean(deleteTarget)}><DialogContent><DialogHeader><DialogTitle>删除这条记忆？</DialogTitle><DialogDescription>删除后不会再参与跨项目检索和用户画像整理，此操作无法撤销。</DialogDescription></DialogHeader><div className="max-h-32 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-xs leading-5">{deleteTarget?.content}</div><DialogFooter><Button onClick={() => setDeleteTarget(null)} type="button" variant="ghost">取消</Button><Button disabled={busy === "delete"} onClick={() => void deleteMemory()} type="button" variant="destructive">{busy === "delete" && <LoaderCircle className="size-3.5 animate-spin" />}删除</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
