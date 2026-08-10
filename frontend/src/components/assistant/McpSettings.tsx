import { useCallback, useEffect, useState } from "react";
import { Check, CircleAlert, Link2, Plus, RefreshCw, Server, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/components/assistant/shared";
import { openCodeApi } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import type { McpConfig, McpStatus, OpenCodeConfig } from "@/lib/opencode";
import { t } from "@/lib/i18n";

interface McpSettingsProps {
  onChanged: () => void;
  projectPath?: string;
}

type McpMode = "form" | "json";
type McpType = "local" | "remote";

interface McpDraft {
  arguments: string;
  command: string;
  cwd: string;
  enabled: boolean;
  environment: string;
  headers: string;
  name: string;
  timeout: string;
  type: McpType;
  url: string;
}

const defaultDraft = (): McpDraft => ({
  arguments: "",
  command: "",
  cwd: "",
  enabled: true,
  environment: "{}",
  headers: "{}",
  name: "",
  timeout: "30000",
  type: "remote",
  url: "",
});

const statusLabel: Record<McpStatus["status"], string> = {
  connected: t("s_65fe35c45e"),
  disabled: t("s_6c7dcbb73a"),
  failed: t("s_2c056f182f"),
  needs_auth: t("s_6c3b44bb5a"),
  needs_client_registration: t("s_542f36b21d"),
};

const parseObject = (text: string, label: string): Record<string, string> => {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("s_ae7afee541", { p0: label }));
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

const parseArguments = (text: string): string[] => {
  const value = text.trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(t("s_5becf33bff"));
    }
    return parsed;
  }
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
};

const draftFromConfig = (name: string, config: McpConfig): McpDraft => ({
  arguments: Array.isArray(config.command) ? config.command.slice(1).join("\n") : "",
  command: Array.isArray(config.command) ? config.command[0] ?? "" : "",
  cwd: typeof config.cwd === "string" ? config.cwd : "",
  enabled: config.enabled !== false,
  environment: JSON.stringify(config.environment ?? {}, null, 2),
  headers: JSON.stringify(config.headers ?? {}, null, 2),
  name,
  timeout: config.timeout ? String(config.timeout) : "30000",
  type: config.type,
  url: typeof config.url === "string" ? config.url : "",
});

const configFromDraft = (draft: McpDraft): McpConfig => ({
  ...(draft.type === "local" ? {
    command: [draft.command.trim(), ...parseArguments(draft.arguments)].filter(Boolean),
    ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}),
    environment: parseObject(draft.environment, t("s_8da07705ab")),
  } : {
    headers: parseObject(draft.headers, t("s_7cabf2e2bd")),
    url: draft.url.trim(),
  }),
  enabled: draft.enabled,
  timeout: Number(draft.timeout) || 30000,
  type: draft.type,
});

const jsonFromDraft = (draft: McpDraft): string => JSON.stringify({ [draft.name || "my-mcp-server"]: configFromDraft(draft) }, null, 2);

const normalizeJson = (text: string, currentName: string): { config: McpConfig; name: string } => {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("s_99c2df5e3b"));
  const root = parsed as Record<string, unknown>;
  const entries = Object.entries(root.mcp && typeof root.mcp === "object" ? root.mcp as Record<string, unknown> : root);
  const entry = entries.find(([name]) => name === currentName) ?? entries[0];
  if (!entry || !entry[1] || typeof entry[1] !== "object" || Array.isArray(entry[1])) throw new Error(t("s_8096ca8015"));
  const config = entry[1] as McpConfig;
  if (config.type !== "local" && config.type !== "remote") throw new Error(t("s_5522971175"));
  return { config, name: entry[0] };
};

export function McpSettings({ onChanged, projectPath }: McpSettingsProps) {
  const [config, setConfig] = useState<OpenCodeConfig>({});
  const [statuses, setStatuses] = useState<Record<string, McpStatus>>({});
  const [draft, setDraft] = useState<McpDraft>(defaultDraft);
  const [mode, setMode] = useState<McpMode>("form");
  const [json, setJson] = useState(jsonFromDraft(defaultDraft()));
  const [selectedName, setSelectedName] = useState("");
  /**
   * The editor is a drill-down, not the landing view.
   *
   * Loading used to auto-select the first server, so the page opened straight into a form for
   * something the user had not asked to edit — unlike every other settings section, which shows a
   * list first. Nothing is selected until they pick one or start a new one.
   */
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (preferredName?: string) => {
    if (!projectPath) return;
    setLoading(true);
    setError("");
    try {
      const [nextConfig, nextStatuses] = await Promise.all([openCodeApi.getConfig(projectPath), openCodeApi.listMcp(projectPath)]);
      setConfig(nextConfig);
      setStatuses(nextStatuses);
      const names = Object.keys(nextConfig.mcp ?? {});
      setSelectedName((currentName) => {
        const nextName = preferredName && names.includes(preferredName)
          ? preferredName
          : currentName && names.includes(currentName)
            ? currentName
            : "";
        if (nextName) {
          const nextDraft = draftFromConfig(nextName, nextConfig.mcp?.[nextName] ?? { type: "remote" });
          setDraft(nextDraft);
          setJson(jsonFromDraft(nextDraft));
        } else if (currentName) {
          const nextDraft = defaultDraft();
          setDraft(nextDraft);
          setJson(jsonFromDraft(nextDraft));
        }
        return nextName;
      });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectMcp = (name: string) => {
    const nextDraft = draftFromConfig(name, config.mcp?.[name] ?? { type: "remote" });
    setEditorOpen(true);
    setSelectedName(name);
    setDraft(nextDraft);
    setJson(jsonFromDraft(nextDraft));
    setMode("form");
    setError("");
  };

  const beginNew = () => {
    const nextDraft = defaultDraft();
    setEditorOpen(true);
    setSelectedName("");
    setDraft(nextDraft);
    setJson(jsonFromDraft(nextDraft));
    setMode("form");
    setError("");
  };

  const save = async () => {
    if (!projectPath) return;
    setSaving(true);
    setError("");
    try {
      const resolved = mode === "json" ? normalizeJson(json, draft.name) : { config: configFromDraft(draft), name: draft.name.trim() };
      if (!resolved.name.trim()) throw new Error(t("s_ecab861b55"));
      if (selectedName && resolved.name !== selectedName) throw new Error(t("s_d9ef23ed15"));
      if (resolved.config.type === "remote" && !resolved.config.url) throw new Error(t("s_bc269dcffe"));
      if (resolved.config.type === "local" && (!resolved.config.command || resolved.config.command.length === 0)) throw new Error(t("s_a1bd5f8275"));
      await openCodeApi.updateConfig({ mcp: { [resolved.name]: resolved.config } }, projectPath);
      setSelectedName(resolved.name);
      setDraft(draftFromConfig(resolved.name, resolved.config));
      await refresh(resolved.name);
      onChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const toggleMcp = async (name: string, enabled: boolean) => {
    if (!projectPath) return;
    const current = config.mcp?.[name];
    if (!current) return;
    setSaving(true);
    setError("");
    try {
      const next = { ...current, enabled };
      await openCodeApi.updateConfig({ mcp: { [name]: next } }, projectPath);
      await refresh(name);
      onChanged();
    } catch (toggleError) {
      setError(errorMessage(toggleError));
    } finally {
      setSaving(false);
    }
  };

  const names = Object.keys(config.mcp ?? {});
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{t("s_463f3bc770")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("s_09e517aa88")}</p></div><div className="flex gap-1"><Button aria-label={t("s_6670a6f2f0")} onClick={() => void refresh()} size="icon-sm" title={t("s_38108eaa1d")} type="button" variant="ghost"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button><Button onClick={beginNew} size="sm" type="button"><Plus className="size-3.5" />{t("s_0cda8d1c71")}</Button></div></header>
      {error && <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</div>}
      <div className={cn("grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:overflow-hidden", editorOpen && "lg:grid-cols-[15rem_minmax(0,1fr)]")}>
        <aside className="min-h-0 overflow-y-auto rounded-lg border border-border">
          <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">{t("s_f9d0d9405d")}</p>
          {names.length === 0
            ? <p className="px-4 py-6 text-xs text-muted-foreground">{t("s_7309922781")}</p>
            : names.map((name) => {
              const entry = config.mcp?.[name];
              const status = statuses[name];
              return (
                <div className={cn("flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0", name === selectedName && "bg-secondary/60")} key={name}>
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => selectMcp(name)} type="button">
                    <Server className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  </button>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {entry?.type === "local" ? <><Terminal className="mr-1 inline size-3" />{t("s_e8666c377c")}</> : <><Link2 className="mr-1 inline size-3" />{t("s_801947aa9a")}</>}
                  </span>
                  <Badge variant="secondary">{status ? statusLabel[status.status] : entry?.enabled === false ? t("s_6c7dcbb73a") : t("s_f2f3e9803c")}</Badge>
                  <Switch aria-label={t("s_7873b24627", { p0: name })} checked={entry?.enabled !== false} disabled={saving} onCheckedChange={(enabled) => void toggleMcp(name, enabled)} />
                </div>
              );
            })}
        </aside>
        {editorOpen && (
        <div className="min-w-0 min-h-0 overflow-y-auto bg-muted/10 p-1 sm:p-4 lg:overscroll-contain"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-2 pb-3 sm:px-0"><div><h3 className="text-base font-semibold">{selectedName ? t("s_9e2bc41278") : t("s_fc27fb76ad")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("s_91cf661942")}</p></div><div className="flex items-center gap-2"><Button onClick={() => { setEditorOpen(false); setSelectedName(""); setError(""); }} size="xs" type="button" variant="ghost">{t("s_6c14bd7f6f")}</Button><div className="flex rounded-md bg-muted p-0.5"><Button onClick={() => { setMode("form"); setDraft(mode === "json" ? draftFromConfig(draft.name, normalizeJson(json, draft.name).config) : draft); }} size="xs" type="button" variant={mode === "form" ? "secondary" : "ghost"}>{t("s_1f515561b6")}</Button><Button onClick={() => { setMode("json"); setJson(jsonFromDraft(draft)); }} size="xs" type="button" variant={mode === "json" ? "secondary" : "ghost"}>JSON</Button></div></div></div>
          {mode === "form" ? <div className="grid gap-4 px-2 pt-4 sm:px-0"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium">{t("s_1be7ae4fc2")}<Input disabled={Boolean(selectedName)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="my-mcp-server" value={draft.name} /></label><label className="grid gap-1.5 text-xs font-medium">{t("s_e4e46c7235")}<Select onValueChange={(type) => setDraft((current) => ({ ...current, type: type as McpType }))} value={draft.type}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="remote">{t("s_d00824d0ac")}</SelectItem><SelectItem value="local">{t("s_53e2dbe2ee")}</SelectItem></SelectContent></Select></label></div>{draft.type === "remote" ? <><label className="grid gap-1.5 text-xs font-medium">URL<Input onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://mcp.example.com/mcp" value={draft.url} /></label><label className="grid gap-1.5 text-xs font-medium">{t("s_af649716a9")}<Textarea className="min-h-28 font-mono text-xs" onChange={(event) => setDraft((current) => ({ ...current, headers: event.target.value }))} value={draft.headers} /></label></> : <><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium">{t("s_f412dfc6da")}<Input onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} placeholder="npx" value={draft.command} /></label><label className="grid gap-1.5 text-xs font-medium">{t("s_42dfc81f99")}<Input onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))} placeholder={t("s_a201b7e213")} value={draft.cwd} /></label></div><label className="grid gap-1.5 text-xs font-medium">{t("s_47e28b6940")}<Textarea className="min-h-28 font-mono text-xs" onChange={(event) => setDraft((current) => ({ ...current, arguments: event.target.value }))} placeholder={t("s_0079ef8b29")} value={draft.arguments} /></label><label className="grid gap-1.5 text-xs font-medium">{t("s_ec939a3f6f")}<Textarea className="min-h-28 font-mono text-xs" onChange={(event) => setDraft((current) => ({ ...current, environment: event.target.value }))} value={draft.environment} /></label></>}<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium">{t("s_a3ce47a749")}<Input inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, timeout: event.target.value }))} value={draft.timeout} /></label><label className="flex items-end gap-2 pb-2 text-xs"><Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} />{t("s_0bcf6e6aac")}</label></div></div> : <div className="px-2 pt-4 sm:px-0"><Textarea className="min-h-80 font-mono text-xs" onChange={(event) => setJson(event.target.value)} spellCheck={false} value={json} /></div>}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/50 px-2 pt-3 sm:px-0"><div>{selectedName && statuses[selectedName] && <Badge variant="secondary">{statusLabel[statuses[selectedName].status]}</Badge>}</div><Button disabled={saving} onClick={() => void save()} size="sm" type="button"><Check className="size-3.5" />{t("s_e62e2f4954")}</Button></div>
        </div>
        )}
      </div>

    </section>
  );
}
