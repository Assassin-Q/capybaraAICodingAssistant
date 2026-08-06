import { useCallback, useEffect, useState } from "react";
import { Check, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/components/assistant/shared";
import { openCodeApi } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface PermissionSettingsProps {
  onChanged: () => void;
  projectPath?: string;
}

type PermissionChoice = "allow" | "ask" | "deny";

const permissionOptions: Array<{ id: string; label: string; description: string }> = [
  { id: "read", label: "读取文件", description: "读取项目文件和检索代码" },
  { id: "edit", label: "修改文件", description: "创建、修改或删除项目文件" },
  { id: "bash", label: "执行命令", description: "执行终端命令和开发工具" },
  { id: "webfetch", label: "访问网络", description: "访问 URL 并获取外部内容" },
];

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function PermissionSettings({ onChanged, projectPath }: PermissionSettingsProps) {
  const [permissions, setPermissions] = useState<Record<string, unknown>>({});
  const [raw, setRaw] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError("");
    try {
      const config = await openCodeApi.getConfig(projectPath);
      const nextPermissions = objectValue(config.permission);
      setPermissions(nextPermissions);
      setRaw(JSON.stringify(nextPermissions, null, 2));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  const choiceFor = (id: string): PermissionChoice => {
    const value = permissions[id];
    return value === "allow" || value === "deny" || value === "ask" ? value : "ask";
  };

  const setChoice = (id: string, value: PermissionChoice) => {
    const next = { ...permissions, [id]: value };
    setPermissions(next);
    setRaw(JSON.stringify(next, null, 2));
  };

  const save = async () => {
    if (!projectPath) return;
    setSaving(true);
    setError("");
    try {
      const next = JSON.parse(raw) as unknown;
      if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("权限规则必须是 JSON 对象");
      await openCodeApi.updateConfig({ permission: next }, projectPath);
      setPermissions(next as Record<string, unknown>);
      onChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">权限</h2><p className="mt-1 text-sm text-muted-foreground">控制 OpenCode 在当前工作区读取、修改与执行操作时的默认确认规则。</p></div><Button aria-label="刷新权限规则" onClick={() => void refresh()} size="icon-sm" title="刷新" type="button" variant="ghost"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button></header>
      {error && <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</div>}
      <div className="max-w-4xl overflow-hidden rounded-md border border-border/50 bg-card">{permissionOptions.map((item) => <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0" key={item.id}><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"><ShieldCheck className="size-3.5 text-muted-foreground" /></div><div className="min-w-36 flex-1"><h3 className="text-sm font-medium">{item.label}</h3><p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p></div><Select onValueChange={(value) => setChoice(item.id, value as PermissionChoice)} value={choiceFor(item.id)}><SelectTrigger aria-label={`${item.label}权限`} className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ask">每次询问</SelectItem><SelectItem value="allow">始终允许</SelectItem><SelectItem value="deny">始终拒绝</SelectItem></SelectContent></Select></div>)}</div>
      <label className="grid max-w-4xl gap-1.5 text-xs font-medium">高级规则 JSON<Textarea className="min-h-44 font-mono text-xs" onChange={(event) => setRaw(event.target.value)} spellCheck={false} value={raw} /></label>
      <div><Button disabled={saving} onClick={() => void save()} size="sm" type="button"><Check className="size-3.5" />保存权限规则</Button></div>
    </section>
  );
}
