import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, FileCode2, FilePlus2, FolderTree, Globe, Hammer, Navigation, Play, PlugZap, RefreshCw, Save, ScrollText, SearchCode, TerminalSquare, Trash2, TriangleAlert, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import {
  EmptyState,
  SettingsHeader,
  SettingsMessage,
  useConfirm,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import {
  ideaExecutionApi,
  pluginsApi,
  type IdeaBridgeStatus,
  type ManagedPluginFile,
  type ManagedScope,
} from "@/lib/ideaIntegrations";

const templateSource = `import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        console.log("session finished in", project.worktree)
      }
    },
  }
}
`;

interface DraftState {
  content: string;
  location?: string;
  name: string;
  scope: ManagedScope;
}

const bridgeTools = [
  { description: "列出并启动本项目的 Run/Debug 配置", icon: Play, name: "idea_run_configuration" },
  { description: "读取 Run、Debug、Maven、Gradle 控制台输出", icon: ScrollText, name: "idea_read_run_log" },
  { description: "读取 SDK、模块、源码根、依赖和当前打开文件", icon: FolderTree, name: "idea_project_context" },
  { description: "读取当前编辑器光标、选区和附近源码", icon: FileCode2, name: "idea_editor_context" },
  { description: "读取 IDEA 实时错误、警告和 Inspection", icon: TriangleAlert, name: "idea_diagnostics" },
  { description: "通过 PSI 和 IDEA 索引查找符号引用与实现", icon: SearchCode, name: "idea_symbol" },
  { description: "在 IDEA 编辑器中为用户定位文件和代码行", icon: Navigation, name: "idea_navigate" },
  { description: "保存文档并刷新 VFS 索引和项目树", icon: RefreshCw, name: "idea_refresh_project" },
  { description: "用 IDEA 内置 Maven Runner 执行目标", icon: Hammer, name: "idea_maven" },
  { description: "用 IDEA 外部构建系统执行 Gradle 任务", icon: Hammer, name: "idea_gradle" },
  { description: "主动打开并控制独立 JCEF 浏览器，读取用户页面标注", icon: Globe, name: "idea_browser" },
];

function IdeaBridgePanel() {
  const [bridge, setBridge] = useState<IdeaBridgeStatus>();
  const [configurationCount, setConfigurationCount] = useState<number>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { error, notice, report, setError } = useSettingsFeedback();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBridge, configurations] = await Promise.all([
        ideaExecutionApi.bridgeStatus(),
        ideaExecutionApi.configurations(),
      ]);
      setBridge(nextBridge);
      setConfigurationCount(configurations.length);
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      const result = await ideaExecutionApi.setBridgeEnabled(enabled);
      setBridge(result);
      report(result, enabled ? "IDEA 原生桥接已启用" : "IDEA 原生桥接已停用");
      setOpen(true);
    } catch (toggleError) {
      setError(errorMessage(toggleError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Collapsible className="shrink-0 overflow-hidden rounded-md border border-border/50 bg-card/45" onOpenChange={setOpen} open={open}>
      <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/65">
          <TerminalSquare className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium">IDEA 原生桥接</h3>
            <Badge className="shrink-0" variant="secondary">内置</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            向 OpenCode 提供项目索引、编辑器、诊断、运行与构建能力
          </p>
        </div>
        <Switch
          aria-label="启用 IDEA 原生桥接"
          checked={bridge?.enabled ?? false}
          disabled={loading}
          onCheckedChange={(enabled) => void toggle(enabled)}
        />
        <CollapsibleTrigger asChild>
          <Button aria-label={open ? "收起桥接能力" : "展开桥接能力"} size="icon-sm" type="button" variant="ghost">
            <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="border-t border-border/40 bg-muted/10 px-3 py-3">
          <SettingsMessage error={error} notice={notice} />
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant={bridge?.enabled ? "secondary" : "outline"}>{bridge?.enabled ? "已启用" : "已停用"}</Badge>
            <Badge variant={bridge?.mavenAvailable ? "secondary" : "outline"}>Maven {bridge?.mavenAvailable ? "可用" : "不可用"}</Badge>
            <Badge variant={bridge?.gradleAvailable ? "secondary" : "outline"}>Gradle {bridge?.gradleAvailable ? "可用" : "不可用"}</Badge>
            <Badge variant="outline">Run/Debug {configurationCount ?? "—"} 项</Badge>
            <Button aria-label="刷新桥接状态" disabled={loading} onClick={() => void refresh()} size="icon-sm" type="button" variant="ghost">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="mb-2 break-all font-mono text-[10px] text-muted-foreground/75">{bridge?.location}</p>
          {/* Eleven tools rendered inline pushed every other plugin below the fold, so the list
              scrolls inside the card instead of growing it. */}
          <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-background/45">
            {bridgeTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <div className="flex min-w-0 items-start gap-2.5 border-t border-border/35 px-2.5 py-2 first:border-t-0" key={tool.name}>
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <code className="block break-all text-[11px] text-foreground/90">{tool.name}</code>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PluginSettings() {
  const [plugins, setPlugins] = useState<ManagedPluginFile[]>([]);
  const [draft, setDraft] = useState<DraftState>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const { error, notice, report, setError } = useSettingsFeedback();
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPlugins(await pluginsApi.list());
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>, fallback: string) => {
      setBusy(true);
      try {
        const result = await action();
        const ok = report(result, fallback);
        if (ok) await refresh();
        return ok;
      } catch (actionError) {
        setError(errorMessage(actionError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, report, setError]
  );

  const save = async () => {
    if (!draft) return;
    const ok = await runAction(
      () =>
        pluginsApi.save({
          content: draft.content,
          location: draft.location,
          name: draft.name,
          overwrite: Boolean(draft.location),
          scope: draft.scope,
        }),
      "插件已保存"
    );
    if (ok) setDraft(undefined);
  };

  const remove = (plugin: ManagedPluginFile) =>
    confirm.ask({
      confirmLabel: "删除插件",
      description: `将删除文件 ${plugin.location}，操作不可撤销。`,
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction(() => pluginsApi.remove(plugin.location), "插件已删除");
      },
      title: `删除插件「${plugin.name}」`,
    });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SettingsHeader
        actions={
          <>
            <Button
              disabled={busy}
              onClick={() => setDraft({ content: templateSource, name: "my-plugin", scope: "project" })}
              size="sm"
              type="button"
              variant="outline"
            >
              <FilePlus2 className="size-3.5" />
              新建
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runAction(() => pluginsApi.import("project"), "插件已导入")}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="size-3.5" />
              导入
            </Button>
          </>
        }
        description="管理 .opencode/plugins 与 ~/.config/opencode/plugins 下的 OpenCode 插件文件。保存后需要重新加载 OpenCode 才会生效。"
        loading={loading}
        onRefresh={() => void refresh()}
        title="插件"
      />

      <SettingsMessage error={error} notice={notice} />

      <IdeaBridgePanel />

      {draft ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-md border border-border/50 bg-card/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-56"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="插件文件名，例如 my-plugin.ts"
              value={draft.name}
            />
            <Select
              onValueChange={(value) => setDraft({ ...draft, scope: value as ManagedScope })}
              value={draft.scope}
            >
              <SelectTrigger aria-label="插件范围" className="h-9 w-32" disabled={Boolean(draft.location)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">项目</SelectItem>
                <SelectItem value="global">全局</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button disabled={busy} onClick={() => void save()} size="sm" type="button">
                <Save className="size-3.5" />
                保存
              </Button>
              <Button onClick={() => setDraft(undefined)} size="sm" type="button" variant="ghost">
                <X className="size-3.5" />
                取消
              </Button>
            </div>
          </div>
          <Textarea
            className="min-h-0 flex-1 resize-none font-mono text-xs"
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            spellCheck={false}
            value={draft.content}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10">
          {plugins.length === 0 ? (
            <EmptyState icon={<PlugZap className="size-5" />}>还没有安装 OpenCode 插件</EmptyState>
          ) : (
            plugins.map((plugin) => (
              <article
                className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-b-0"
                key={plugin.location}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <PlugZap className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{plugin.name}</h3>
                    <Badge variant="secondary">{plugin.scope === "project" ? "项目" : "全局"}</Badge>
                    <Badge variant="outline">{plugin.language}</Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
                    {plugin.location}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      content: plugin.content,
                      location: plugin.location,
                      name: `${plugin.name}.${plugin.language}`,
                      scope: plugin.scope,
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  编辑
                </Button>
                <Switch
                  aria-label={`启用 ${plugin.name}`}
                  checked={plugin.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) =>
                    void runAction(
                      () => pluginsApi.setEnabled(plugin.location, enabled),
                      enabled ? "插件已启用" : "插件已停用"
                    )
                  }
                />
                <Button
                  aria-label={`删除 ${plugin.name}`}
                  disabled={busy}
                  onClick={() => remove(plugin)}
                  size="icon-sm"
                  title="删除插件"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </article>
            ))
          )}
        </div>
      )}

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
