import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Cable,
  ChevronLeft,
  Cpu,
  Database,
  PlugZap,
  Puzzle,
  Sparkles,
  Wifi,
  X,
} from "lucide-react";

import { ConnectionSettings } from "@/components/assistant/ConnectionSettings";
import { MemorySettings } from "@/components/assistant/MemorySettings";
import { McpSettings } from "@/components/assistant/McpSettings";
import { ModelSettings } from "@/components/assistant/ModelSettings";
import { VisionModelSetting } from "@/components/assistant/VisionModelSetting";
import { PersonaSettings } from "@/components/assistant/PersonaSettings";
import { PluginSettings } from "@/components/assistant/PluginSettings";
import { SkillSettings } from "@/components/assistant/SkillSettings";
import { Button } from "@/components/ui/button";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { UpdateStatus } from "@/lib/updateCheck";
import type { ModelInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";

interface WorkspaceDialogProps {
  baseUrl: string;
  connected: boolean;
  initialSection?: SectionID;
  mcpNames: string[];
  models: ModelInfo[];
  onConfigurationChanged: () => void;
  onOpenChange: (open: boolean) => void;
  onPreferencesChanged?: (preferences: WorkspacePreferences) => void;
  open: boolean;
  projectID?: string;
  projectPath?: string;
  skills: import("@/lib/opencode").SkillInfo[];
  /** Surfaced on the connection page so the running build is always visible. */
  updateStatus?: UpdateStatus;
}

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const sections = () => [
  { icon: Wifi, id: "connection", label: t("s_7328deebb5") },
  { icon: Cpu, id: "models", label: t("s_98fd0cbd9c") },
  { icon: BrainCircuit, id: "persona", label: t("s_6b26695e4d") },
  { icon: Database, id: "memory", label: t("s_b55ff5c334") },
  { icon: Sparkles, id: "skills", label: t("s_53da139b6a") },
  { icon: Puzzle, id: "plugins", label: t("s_76fcd73275") },
  { icon: PlugZap, id: "mcp", label: "MCP" },
] as const;

/** Sections that manage their own scrolling instead of scrolling the whole page. */
const containedSections = new Set(["models", "skills", "plugins", "mcp"]);

export type SectionID = ReturnType<typeof sections>[number]["id"];

export function WorkspaceDialog({
  baseUrl,
  connected,
  initialSection = "connection",
  mcpNames,
  models,
  onConfigurationChanged,
  onOpenChange,
  onPreferencesChanged,
  open,
  projectPath,
  skills,
  updateStatus,
}: WorkspaceDialogProps) {
  const [activeSection, setActiveSection] = useState<SectionID>("connection");
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => loadWorkspacePreferences(projectPath));

  useEffect(() => {
    if (open) {
      setActiveSection(initialSection);
      setPreferences(loadWorkspacePreferences(projectPath));
    }
  }, [initialSection, open, projectPath]);

  const pageTitle = useMemo(() => sections().find((section) => section.id === activeSection)?.label ?? t("s_7debf9cb03"), [activeSection]);
  const updatePreferences = (next: WorkspacePreferences) => {
    const saved = saveWorkspacePreferences(projectPath, next);
    setPreferences(saved);
    onPreferencesChanged?.(saved);
    return saved;
  };

  if (!open) return null;

  return (
    <div aria-label={t("s_52e823f821")} aria-modal="true" className="fixed inset-0 z-50 flex h-full w-full overflow-hidden bg-background text-foreground" role="dialog">
      <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-muted/30 py-2 sm:w-52 sm:p-3">
        <div className="mb-3 flex h-8 items-center gap-2 px-2 sm:px-1"><Cable className="size-4 shrink-0" /><span className="hidden truncate text-sm font-semibold sm:block">{t("s_2de736aa52")}</span></div>
        <nav aria-label={t("s_a8c7ae4f8e")} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 sm:px-0">
          {sections().map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.id;
            return <Button aria-current={selected ? "page" : undefined} aria-label={section.label} className={cn("w-full justify-center gap-2 px-2 sm:justify-start", selected && "bg-secondary")} key={section.id} onClick={() => setActiveSection(section.id)} size="sm" title={section.label} type="button" variant="ghost"><Icon className="size-4 shrink-0" /><span className="hidden sm:inline">{section.label}</span></Button>;
          })}
        </nav>
        <Button aria-label={t("s_185d6ff8e0")} className="mt-2 justify-center gap-2 px-2 sm:justify-start" onClick={() => onOpenChange(false)} size="sm" title={t("s_185d6ff8e0")} type="button" variant="ghost"><ChevronLeft className="size-4" /><span className="hidden sm:inline">{t("s_185d6ff8e0")}</span></Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5"><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold sm:text-base">{pageTitle}</h1></div><Button aria-label={t("s_7346c03569")} onClick={() => onOpenChange(false)} size="icon-sm" title={t("s_7346c03569")} type="button" variant="ghost"><X className="size-4" /></Button></header>
        <main className={cn(
          "flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6",
          containedSections.has(activeSection) ? "overflow-hidden" : "overflow-y-auto"
        )}>
          {activeSection === "connection" && (
            <ConnectionSettings
              baseUrl={baseUrl}
              connected={connected}
              language={preferences.language}
              onChanged={onConfigurationChanged}
              onLanguageChange={(language) => updatePreferences({ ...preferences, language })}
              projectPath={projectPath}
              updateStatus={updateStatus}
            />
          )}
          {activeSection === "models" && (
            <>
              <ModelSettings
                modelVariantLabels={preferences.modelVariantLabels}
                onChanged={onConfigurationChanged}
                onModelVariantLabelsChange={(modelVariantLabels) => updatePreferences({
                  ...preferences,
                  modelVariantLabels,
                })}
                projectPath={projectPath}
              />
              {/* Sits with the models rather than in the composer: it is a property of the model
                  line-up, not of any one conversation. */}
              <VisionModelSetting
                models={models}
                onChange={(visionModel) => updatePreferences({ ...preferences, visionModel })}
                value={preferences.visionModel}
              />
            </>
          )}
          {activeSection === "persona" && <PersonaSettings mcpNames={mcpNames} onSave={updatePreferences} preferences={preferences} skills={skills} />}
          {activeSection === "memory" && <MemorySettings models={models} onChanged={onConfigurationChanged} />}
          {activeSection === "skills" && <SkillSettings disabledSkillNames={preferences.disabledSkillNames} onDisabledSkillNamesChange={(disabledSkillNames) => updatePreferences({ ...preferences, disabledSkillNames })} projectPath={projectPath} />}
          {activeSection === "plugins" && <PluginSettings />}
          {activeSection === "mcp" && <McpSettings onChanged={onConfigurationChanged} projectPath={projectPath} />}
        </main>
      </div>
    </div>
  );
}
