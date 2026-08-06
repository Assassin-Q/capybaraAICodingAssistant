import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, FolderKanban, PackageOpen, RefreshCw, Search, Sparkles, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/components/assistant/shared";
import { openCodeApi } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import type { SkillInfo } from "@/lib/opencode";

interface SkillSettingsProps {
  disabledSkillNames: string[];
  onDisabledSkillNamesChange: (names: string[]) => void;
  projectPath?: string;
}

type SkillScope = "project" | "user" | "plugin";

const scopeItems: Array<{ icon: typeof Sparkles; id: SkillScope; label: string }> = [
  { icon: FolderKanban, id: "project", label: "项目" },
  { icon: UserRound, id: "user", label: "用户" },
  { icon: PackageOpen, id: "plugin", label: "插件" },
];

const normalizedPath = (value: string): string => value.replaceAll("\\", "/").toLocaleLowerCase();

const skillScope = (skill: SkillInfo, projectPath?: string): SkillScope => {
  const location = normalizedPath(skill.location);
  const project = normalizedPath(projectPath ?? "");
  if (location === "<built-in>" || location.includes("/plugins/") || location.includes("/plugin/")) return "plugin";
  if (project && location.startsWith(project)) return "project";
  return "user";
};

export function SkillSettings({ disabledSkillNames, onDisabledSkillNamesChange, projectPath }: SkillSettingsProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [scope, setScope] = useState<SkillScope>("project");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError("");
    try {
      setSkills(await openCodeApi.listSkills(projectPath));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => Object.fromEntries(scopeItems.map((item) => [
    item.id,
    skills.filter((skill) => skillScope(skill, projectPath) === item.id).length,
  ])) as Record<SkillScope, number>, [projectPath, skills]);

  const visibleSkills = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase();
    return skills
      .filter((skill) => skillScope(skill, projectPath) === scope)
      .filter((skill) => `${skill.name} ${skill.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [projectPath, query, scope, skills]);

  const disabled = new Set(disabledSkillNames);
  const setEnabled = (name: string, enabled: boolean) => {
    const next = new Set(disabledSkillNames);
    enabled ? next.delete(name) : next.add(name);
    onDisabledSkillNamesChange([...next]);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">技能</h2><p className="mt-1 text-sm text-muted-foreground">按来源管理项目、用户和插件技能。</p></div><Button aria-label="刷新技能列表" disabled={loading} onClick={() => void refresh()} size="icon-sm" title="刷新" type="button" variant="ghost"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button></header>
      {error && <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-[11rem_minmax(0,1fr)] md:overflow-hidden md:gap-5">
        <aside className="max-h-44 rounded-md bg-muted/30 p-1.5 md:max-h-none md:overflow-y-auto">
          {scopeItems.map((item) => {
            const Icon = item.icon;
            return <Button className="mb-0.5 w-full justify-start gap-2 px-2" key={item.id} onClick={() => setScope(item.id)} size="sm" type="button" variant={scope === item.id ? "secondary" : "ghost"}><Icon className="size-3.5" /><span>{item.label}</span><span className="ml-auto text-[10px] text-muted-foreground">{counts[item.id]}</span></Button>;
          })}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col gap-3 md:overflow-y-auto md:pr-1">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${scopeItems.find((item) => item.id === scope)?.label ?? ""}技能...`} value={query} /></div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10">
            {visibleSkills.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><PackageOpen className="size-5" />此分类没有技能</div> : visibleSkills.map((skill) => <article className="flex items-center gap-3 border-b border-border/70 px-3 py-3 last:border-b-0" key={`${skill.location}-${skill.name}`}><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"><Sparkles className="size-3.5 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-medium">{skill.name}</h3>{skill.slash && <Badge variant="secondary">斜杠</Badge>}</div><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description ?? "未提供介绍"}</p></div><Switch aria-label={`启用 ${skill.name}`} checked={!disabled.has(skill.name)} onCheckedChange={(enabled) => setEnabled(skill.name, enabled)} /></article>)}
          </div>
        </div>
      </div>
    </section>
  );
}
