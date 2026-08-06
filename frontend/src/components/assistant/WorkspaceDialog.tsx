import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Cable, ChevronLeft, Cpu, Database, PlugZap, ShieldCheck, Sparkles, Wifi, X } from "lucide-react";

import { MemorySettings } from "@/components/assistant/MemorySettings";
import { McpSettings } from "@/components/assistant/McpSettings";
import { ModelSettings } from "@/components/assistant/ModelSettings";
import { PermissionSettings } from "@/components/assistant/PermissionSettings";
import { PersonaSettings } from "@/components/assistant/PersonaSettings";
import { SkillSettings } from "@/components/assistant/SkillSettings";
import { Button } from "@/components/ui/button";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { WorkspacePreferences } from "@/lib/preferences";

interface WorkspaceDialogProps {
  baseUrl: string;
  connected: boolean;
  initialSection?: SectionID;
  onConfigurationChanged: () => void;
  onOpenChange: (open: boolean) => void;
  onPreferencesChanged?: (preferences: WorkspacePreferences) => void;
  open: boolean;
  projectID?: string;
  projectPath?: string;
}

const sections = [
  { icon: Wifi, id: "connection", label: "连接" },
  { icon: Cpu, id: "models", label: "模型" },
  { icon: BrainCircuit, id: "persona", label: "人格" },
  { icon: Database, id: "memory", label: "记忆" },
  { icon: Sparkles, id: "skills", label: "技能" },
  { icon: PlugZap, id: "mcp", label: "MCP" },
  { icon: ShieldCheck, id: "permissions", label: "权限" },
] as const;

type SectionID = typeof sections[number]["id"];

export function WorkspaceDialog({
  baseUrl,
  connected,
  initialSection = "connection",
  onConfigurationChanged,
  onOpenChange,
  onPreferencesChanged,
  open,
  projectPath,
}: WorkspaceDialogProps) {
  const [activeSection, setActiveSection] = useState<SectionID>("connection");
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => loadWorkspacePreferences(projectPath));

  useEffect(() => {
    if (open) {
      setActiveSection(initialSection);
      setPreferences(loadWorkspacePreferences(projectPath));
    }
  }, [initialSection, open, projectPath]);

  const pageTitle = useMemo(() => sections.find((section) => section.id === activeSection)?.label ?? "设置", [activeSection]);
  const updatePreferences = (next: WorkspacePreferences) => {
    const saved = saveWorkspacePreferences(projectPath, next);
    setPreferences(saved);
    onPreferencesChanged?.(saved);
  };

  if (!open) return null;

  return (
    <div aria-label="工作区设置" aria-modal="true" className="fixed inset-0 z-50 flex h-full w-full overflow-hidden bg-background text-foreground" role="dialog">
      <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-muted/30 py-2 sm:w-52 sm:p-3">
        <div className="mb-3 flex h-8 items-center gap-2 px-2 sm:px-1"><Cable className="size-4 shrink-0" /><span className="hidden truncate text-sm font-semibold sm:block">水豚 AI</span></div>
        <nav aria-label="设置导航" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 sm:px-0">
          {sections.map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.id;
            return <Button aria-current={selected ? "page" : undefined} aria-label={section.label} className={cn("w-full justify-center gap-2 px-2 sm:justify-start", selected && "bg-secondary")} key={section.id} onClick={() => setActiveSection(section.id)} size="sm" title={section.label} type="button" variant="ghost"><Icon className="size-4 shrink-0" /><span className="hidden sm:inline">{section.label}</span></Button>;
          })}
        </nav>
        <Button aria-label="返回对话" className="mt-2 justify-center gap-2 px-2 sm:justify-start" onClick={() => onOpenChange(false)} size="sm" title="返回对话" type="button" variant="ghost"><ChevronLeft className="size-4" /><span className="hidden sm:inline">返回对话</span></Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5"><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold sm:text-base">{pageTitle}</h1></div><Button aria-label="关闭设置" onClick={() => onOpenChange(false)} size="icon-sm" title="关闭设置" type="button" variant="ghost"><X className="size-4" /></Button></header>
        <main className={cn(
          "flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6",
          activeSection === "models" || activeSection === "skills" || activeSection === "mcp"
            ? "overflow-hidden"
            : "overflow-y-auto"
        )}>
          {activeSection === "connection" && <section className="flex max-w-3xl flex-col gap-5"><header><h2 className="text-lg font-semibold">连接</h2><p className="mt-1 text-sm text-muted-foreground">当前插件直接连接 OpenCode；IDEA 仅提供服务发现和编辑器上下文。</p></header><div className="overflow-hidden rounded-lg border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-4 py-4"><span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{connected ? "OpenCode 已连接" : "OpenCode 未连接"}</p><p className="mt-0.5 text-xs text-muted-foreground">{connected ? "服务响应正常" : "请在对话页刷新或检查服务状态"}</p></div></div><dl className="grid gap-4 px-4 py-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">服务地址</dt><dd className="mt-1 break-all font-mono text-xs">{baseUrl}</dd></div><div><dt className="text-xs text-muted-foreground">工作区</dt><dd className="mt-1 break-all font-mono text-xs">{projectPath ?? "未获取到项目路径"}</dd></div></dl></div></section>}
          {activeSection === "models" && <ModelSettings onChanged={onConfigurationChanged} projectPath={projectPath} />}
          {activeSection === "persona" && <PersonaSettings onSave={updatePreferences} preferences={preferences} />}
          {activeSection === "memory" && <MemorySettings onChanged={onConfigurationChanged} />}
          {activeSection === "skills" && <SkillSettings disabledSkillNames={preferences.disabledSkillNames} onDisabledSkillNamesChange={(disabledSkillNames) => updatePreferences({ ...preferences, disabledSkillNames })} projectPath={projectPath} />}
          {activeSection === "mcp" && <McpSettings onChanged={onConfigurationChanged} projectPath={projectPath} />}
          {activeSection === "permissions" && <PermissionSettings onChanged={onConfigurationChanged} projectPath={projectPath} />}
        </main>
      </div>
    </div>
  );
}
