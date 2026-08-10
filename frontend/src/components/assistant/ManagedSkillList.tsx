import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, PackageOpen, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import {
  EmptyState,
  SettingsHeader,
  SettingsMessage,
  useConfirm,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi } from "@/lib/idea";
import { skillsApi, type ManagedScope, type ManagedSkillInfo } from "@/lib/ideaIntegrations";
import { openCodeApi, setOpenCodeBaseUrl } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface ManagedSkillListProps {
  disabledSkillNames: string[];
  onDisabledSkillNamesChange: (names: string[]) => void;
  projectPath?: string;
  reloadToken?: number;
}

/** Windows hands back both separators and mixed case; comparison needs one shape. */
const normalizePath = (value: string): string => value.replace(/\\/g, "/").toLowerCase();

const sourceLabels: Record<string, string> = {
  agents: "Agents",
  claude: "Claude Code",
  import: "导入",
  opencode: "OpenCode",
};

const scopeFilters: Array<{ id: ManagedScope | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "project", label: "项目" },
  { id: "global", label: "全局" },
];

export function ManagedSkillList({
  disabledSkillNames,
  onDisabledSkillNamesChange,
  projectPath,
  reloadToken,
}: ManagedSkillListProps) {
  const [skills, setSkills] = useState<ManagedSkillInfo[]>([]);
  /** Paths OpenCode has loaded; null means we could not reach it, which is not the same as none. */
  const [loadedPaths, setLoadedPaths] = useState<Set<string> | null>(null);
  const [scope, setScope] = useState<ManagedScope | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { error, notice, report, setError } = useSettingsFeedback();
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [onDisk, live] = await Promise.all([
        skillsApi.list(),
        // null, not [] — swallowing the failure into an empty list made "we could not ask
        // OpenCode" indistinguishable from "OpenCode loaded nothing", which flagged every
        // enabled skill as needing a restart that would have changed nothing.
        projectPath
          ? openCodeApi.listSkills(projectPath).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSkills(onDisk);
      setLoadedPaths(live === null ? null : new Set(live.map((skill) => normalizePath(skill.location))));
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectPath, setError]);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadToken]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return skills
      .filter((skill) => scope === "all" || skill.scope === scope)
      .filter((skill) =>
        `${skill.name} ${skill.description ?? ""} ${skill.location}`
          .toLocaleLowerCase()
          .includes(normalized)
      );
  }, [query, scope, skills]);

  const runAction = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>, fallback: string) => {
      setBusy(true);
      try {
        const result = await action();
        if (report(result, fallback)) await refresh();
      } catch (actionError) {
        setError(errorMessage(actionError));
      } finally {
        setBusy(false);
      }
    },
    [refresh, report, setError]
  );

  const importSkill = (target: ManagedScope) =>
    void runAction(() => skillsApi.import(target), "技能导入完成");

  /**
   * Renaming the file is what OpenCode reads, but that only takes effect on reload — so the
   * local preference is updated too, which hides the skill from slash commands immediately.
   */
  const setEnabled = (skill: ManagedSkillInfo, enabled: boolean) => {
    const next = new Set(disabledSkillNames);
    if (enabled) next.delete(skill.name);
    else next.add(skill.name);
    onDisabledSkillNamesChange([...next]);
    void runAction(
      () => skillsApi.setEnabled(skill.location, enabled),
      enabled ? "技能已启用，OpenCode 重启后加载" : "技能已停用"
    );
  };

  const removeSkill = (skill: ManagedSkillInfo) =>
    confirm.ask({
      confirmLabel: "删除技能",
      description: `将删除目录 ${skill.location.replace(/[\\/]SKILL\.md(\.disabled)?$/, "")} 及其全部文件，操作不可撤销。`,
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction(() => skillsApi.remove(skill.location), "技能已删除");
      },
      title: `删除技能「${skill.name}」`,
    });

  /**
   * Matched on the file path, not the name.
   *
   * Two skills can share a name across scopes — a project copy and a ~/.claude copy of
   * ui-ux-pro-max, say — and name matching then reported the unloaded one as loaded because its
   * twin was. The path is what OpenCode actually loaded, so it is what gets compared.
   */
  const isLoaded = useCallback(
    (skill: ManagedSkillInfo) =>
      loadedPaths !== null && loadedPaths.has(normalizePath(skill.location)),
    [loadedPaths]
  );

  /** Enabled on disk but absent from OpenCode's live list — a reload picks these up. */
  const pendingReload = useMemo(
    () => skills.filter((skill) => skill.enabled && !isLoaded(skill)),
    [isLoaded, skills]
  );

  const restartService = async () => {
    setRestarting(true);
    try {
      const runtime = await ideaApi.restartOpenCode();
      if (runtime.error) {
        setError(runtime.error);
        return;
      }
      if (runtime.baseUrl) setOpenCodeBaseUrl(runtime.baseUrl);
      // Give OpenCode a moment to finish scanning skills before re-reading.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refresh();
    } catch (restartError) {
      setError(errorMessage(restartError));
    } finally {
      setRestarting(false);
    }
  };

  const loadState = (skill: ManagedSkillInfo) => {
    if (!skill.enabled) return { label: "已停用", variant: "outline" as const };
    if (loadedPaths === null) return { label: "无法确认（未连接服务）", variant: "outline" as const };
    if (isLoaded(skill)) return { label: "已加载", variant: "secondary" as const };
    return { label: "待重启服务加载", variant: "outline" as const };
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SettingsHeader
        actions={
          <>
            <Button disabled={busy} onClick={() => importSkill("project")} size="sm" type="button" variant="outline">
              <Download className="size-3.5" />
              导入到项目
            </Button>
            <Button disabled={busy} onClick={() => importSkill("global")} size="sm" type="button" variant="outline">
              <Download className="size-3.5" />
              导入到全局
            </Button>
          </>
        }
        description="扫描 .opencode/skills、~/.config/opencode/skills，以及 Claude Code 兼容的 .claude/skills 和 .agents/skills。仅列出 <根目录>/<名称>/SKILL.md 这一层——嵌套更深的目录 OpenCode 不会加载，因此不显示。「待重启服务加载」表示文件已就位但 OpenCode 还没读到，可到「连接」页重启服务。"
        loading={loading}
        onRefresh={() => void refresh()}
        title="技能"
      />

      <SettingsMessage error={error} notice={notice} />

      {pendingReload.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <RotateCcw className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-xs text-amber-700 dark:text-amber-400">
            有 {pendingReload.length} 个技能已启用但 OpenCode 还没加载
            （{pendingReload.slice(0, 3).map((skill) => skill.name).join("、")}
            {pendingReload.length > 3 ? " 等" : ""}）。重启服务后生效。
          </span>
          <Button disabled={restarting} onClick={() => void restartService()} size="sm" type="button">
            <RotateCcw className={cn("size-3.5", restarting && "animate-spin")} />
            一键重启服务
          </Button>
        </div>
      )}


      <div className="flex flex-wrap items-center gap-2">
        {scopeFilters.map((item) => (
          <Button
            key={item.id}
            onClick={() => setScope(item.id)}
            size="sm"
            type="button"
            variant={scope === item.id ? "secondary" : "ghost"}
          >
            {item.label}
            <span className="ml-1 text-[10px] text-muted-foreground">
              {item.id === "all" ? skills.length : skills.filter((skill) => skill.scope === item.id).length}
            </span>
          </Button>
        ))}
        <div className="relative ml-auto min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索技能..."
            value={query}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10">
        {visible.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-5" />}>没有匹配的技能</EmptyState>
        ) : (
          visible.map((skill) => {
            const state = loadState(skill);
            return (
              <article
                className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-b-0"
                key={skill.location}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Sparkles
                    className={cn(
                      "size-3.5",
                      skill.enabled && isLoaded(skill) ? "text-emerald-500" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                    <Badge variant={state.variant}>{state.label}</Badge>
                    <Badge variant="outline">{skill.scope === "project" ? "项目" : "全局"}</Badge>
                    <Badge variant="outline">{sourceLabels[skill.source] ?? skill.source}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {skill.description ?? "未提供介绍"}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">{skill.location}</p>
                </div>
                <Switch
                  aria-label={`启用 ${skill.name}`}
                  checked={skill.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) => setEnabled(skill, enabled)}
                />
                <Button
                  aria-label={`删除 ${skill.name}`}
                  disabled={busy}
                  onClick={() => removeSkill(skill)}
                  size="icon-sm"
                  title="删除技能"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </article>
            );
          })
        )}
      </div>

      <ConfirmDialog
        busy={busy}
        onOpenChange={(open) => {
          if (!open) confirm.close();
        }}
        request={confirm.request}
      />
    </section>
  );
}
