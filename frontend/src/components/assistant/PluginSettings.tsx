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
import { t } from "@/lib/i18n";
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
  { description: t("s_054f5caff5"), icon: Play, name: "idea_run_configuration" },
  { description: t("s_9d18262d07"), icon: ScrollText, name: "idea_read_run_log" },
  { description: t("s_124a851d69"), icon: FolderTree, name: "idea_project_context" },
  { description: t("s_fbba759af4"), icon: FileCode2, name: "idea_editor_context" },
  { description: t("s_12da0c7ab0"), icon: TriangleAlert, name: "idea_diagnostics" },
  { description: t("s_f38e84e5d8"), icon: SearchCode, name: "idea_symbol" },
  { description: t("s_7e866ab457"), icon: Navigation, name: "idea_navigate" },
  { description: t("s_cac494be60"), icon: RefreshCw, name: "idea_refresh_project" },
  { description: t("s_ae83382c0c"), icon: Hammer, name: "idea_maven" },
  { description: t("s_a8ecf176f3"), icon: Hammer, name: "idea_gradle" },
  { description: t("s_70f24b5ac8"), icon: Globe, name: "idea_browser" },
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
      report(result, enabled ? t("s_62952e1974") : t("s_d33470489a"));
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
            <h3 className="truncate text-sm font-medium">{t("s_6a0fe5e5d9")}</h3>
            <Badge className="shrink-0" variant="secondary">{t("s_09ceea7644")}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("s_8dbf44f5e0")}
          </p>
        </div>
        <Switch
          aria-label={t("s_f0b4d9b727")}
          checked={bridge?.enabled ?? false}
          disabled={loading}
          onCheckedChange={(enabled) => void toggle(enabled)}
        />
        <CollapsibleTrigger asChild>
          <Button aria-label={open ? t("s_7ed4c0d159") : t("s_43d6ca49ae")} size="icon-sm" type="button" variant="ghost">
            <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="border-t border-border/40 bg-muted/10 px-3 py-3">
          <SettingsMessage error={error} notice={notice} />
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant={bridge?.enabled ? "secondary" : "outline"}>{bridge?.enabled ? t("s_25d2843150") : t("s_6c7dcbb73a")}</Badge>
            <Badge variant={bridge?.mavenAvailable ? "secondary" : "outline"}>Maven {bridge?.mavenAvailable ? t("s_e91365cf9e") : t("s_beff4a1cd1")}</Badge>
            <Badge variant={bridge?.gradleAvailable ? "secondary" : "outline"}>Gradle {bridge?.gradleAvailable ? t("s_e91365cf9e") : t("s_beff4a1cd1")}</Badge>
            <Badge variant="outline">Run/Debug {configurationCount ?? "—"} {t("s_64728a7727")}</Badge>
            <Button aria-label={t("s_f366a46f4b")} disabled={loading} onClick={() => void refresh()} size="icon-sm" type="button" variant="ghost">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="mb-2 break-all font-mono text-[10px] text-muted-foreground/75">{bridge?.location}</p>
          {/* No longer a warning. The panel answers permissions itself the moment the event lands,
              so on a healthy setup this hook is simply never reached — it now only covers requests
              raised while no panel is open. "Never called" stopped being evidence of anything. */}
          <p className="mb-2 text-[10px] text-muted-foreground">
            {t("s_969df6db58")}{bridge?.lastApprovalHook
              ? <span className="font-mono">{bridge.lastApprovalHook}</span>
              : <span>{t("s_cfe4d74e3c")}</span>}
          </p>
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
      t("s_5134898e14")
    );
    if (ok) setDraft(undefined);
  };

  const remove = (plugin: ManagedPluginFile) =>
    confirm.ask({
      confirmLabel: t("s_cdb4524480"),
      description: t("s_d3ba914add", { p0: plugin.location }),
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction(() => pluginsApi.remove(plugin.location), t("s_c447f39bc7"));
      },
      title: t("s_8f5993c2c3", { p0: plugin.name }),
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
              {t("s_0cda8d1c71")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runAction(() => pluginsApi.import("project"), t("s_6796451ada"))}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="size-3.5" />
              {t("s_60e2bcad85")}
            </Button>
          </>
        }
        description={t("s_ab76c86e28")}
        loading={loading}
        onRefresh={() => void refresh()}
        title={t("s_76fcd73275")}
      />

      <SettingsMessage error={error} notice={notice} />

      <IdeaBridgePanel />

      {draft ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-md border border-border/50 bg-card/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-56"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={t("s_834fb3d8c9")}
              value={draft.name}
            />
            <Select
              onValueChange={(value) => setDraft({ ...draft, scope: value as ManagedScope })}
              value={draft.scope}
            >
              <SelectTrigger aria-label={t("s_926c54e983")} className="h-9 w-32" disabled={Boolean(draft.location)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">{t("s_22336e6b89")}</SelectItem>
                <SelectItem value="global">{t("s_a5644f4bbf")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button disabled={busy} onClick={() => void save()} size="sm" type="button">
                <Save className="size-3.5" />
                {t("s_fadf24dbc5")}
              </Button>
              <Button onClick={() => setDraft(undefined)} size="sm" type="button" variant="ghost">
                <X className="size-3.5" />
                {t("s_4d0b4688c7")}
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
            <EmptyState icon={<PlugZap className="size-5" />}>{t("s_ef3a86b765")}</EmptyState>
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
                    <Badge variant="secondary">{plugin.scope === "project" ? t("s_22336e6b89") : t("s_a5644f4bbf")}</Badge>
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
                  {t("s_a7f814c0a4")}
                </Button>
                <Switch
                  aria-label={t("s_7873b24627", { p0: plugin.name })}
                  checked={plugin.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) =>
                    void runAction(
                      () => pluginsApi.setEnabled(plugin.location, enabled),
                      enabled ? t("s_a5a705c50b") : t("s_4a561e9358")
                    )
                  }
                />
                <Button
                  aria-label={t("s_05cefdc56b", { p0: plugin.name })}
                  disabled={busy}
                  onClick={() => remove(plugin)}
                  size="icon-sm"
                  title={t("s_cdb4524480")}
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
