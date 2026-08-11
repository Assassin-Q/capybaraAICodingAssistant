import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, PackageOpen, Search, Sparkles, Trash2 } from "lucide-react";

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
import { skillsApi, type ManagedScope, type ManagedSkillInfo } from "@/lib/ideaIntegrations";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface ManagedSkillListProps {
  disabledSkillNames: string[];
  onDisabledSkillNamesChange: (names: string[]) => void;
  projectPath?: string;
  reloadToken?: number;
}


/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const sourceLabels = (): Record<string, string> => ({
  agents: "Agents",
  claude: "Claude Code",
  import: t("s_60e2bcad85"),
  opencode: "OpenCode",
});

const scopeFilters = (): Array<{ id: ManagedScope | "all"; label: string }> => [
  { id: "all", label: t("s_778fc8f994") },
  { id: "project", label: t("s_22336e6b89") },
  { id: "global", label: t("s_a5644f4bbf") },
];

export function ManagedSkillList({
  disabledSkillNames,
  onDisabledSkillNamesChange,
  projectPath,
  reloadToken,
}: ManagedSkillListProps) {
  const [skills, setSkills] = useState<ManagedSkillInfo[]>([]);
  const [scope, setScope] = useState<ManagedScope | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const { error, notice, report, setError } = useSettingsFeedback();
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await skillsApi.list());
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
    void runAction(() => skillsApi.import(target), t("s_ca8d3024a7"));

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
      enabled ? t("s_35006dcc81") : t("s_373fa7be0e")
    );
  };

  const removeSkill = (skill: ManagedSkillInfo) =>
    confirm.ask({
      confirmLabel: t("s_b9e42ac786"),
      description: t("s_74ff4ef7f5", { p0: skill.location.replace(/[\\/]SKILL\.md(\.disabled)?$/, "") }),
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction(() => skillsApi.remove(skill.location), t("s_34c29b6946"));
      },
      title: t("s_d14ab24cdc", { p0: skill.name }),
    });





  /**
   * Only two states remain: on disk and enabled, or on disk and disabled.
   *
   * "Loaded" used to be a third, read from OpenCode's live registry. It was never something the
   * user could act on — a skill that OpenCode had not scanned still could not be used no matter
   * how often the service restarted — and now that picking a skill attaches its SKILL.md, the
   * registry does not decide anything. Reporting a state that changes nothing was just noise.
   */
  const loadState = (skill: ManagedSkillInfo) =>
    skill.enabled
      ? { label: t("skill.enabled"), variant: "secondary" as const }
      : { label: t("s_6c7dcbb73a"), variant: "outline" as const };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SettingsHeader
        actions={
          <>
            <Button disabled={busy} onClick={() => importSkill("project")} size="sm" type="button" variant="outline">
              <Download className="size-3.5" />
              {t("s_f356e6abae")}
            </Button>
            <Button disabled={busy} onClick={() => importSkill("global")} size="sm" type="button" variant="outline">
              <Download className="size-3.5" />
              {t("s_bc47c2f969")}
            </Button>
          </>
        }
        description={t("s_92e9685020")}
        loading={loading}
        onRefresh={() => void refresh()}
        title={t("s_53da139b6a")}
      />

      <SettingsMessage error={error} notice={notice} />


      <div className="flex flex-wrap items-center gap-2">
        {scopeFilters().map((item) => (
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
            placeholder={t("s_e93efaf48a")}
            value={query}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10">
        {visible.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-5" />}>{t("s_8a1fac7238")}</EmptyState>
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
                      skill.enabled ? "text-emerald-500" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                    <Badge variant={state.variant}>{state.label}</Badge>
                    <Badge variant="outline">{skill.scope === "project" ? t("s_22336e6b89") : t("s_a5644f4bbf")}</Badge>
                    <Badge variant="outline">{sourceLabels()[skill.source] ?? skill.source}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {skill.description ?? t("s_7e73fb8978")}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">{skill.location}</p>
                </div>
                <Switch
                  aria-label={t("s_7873b24627", { p0: skill.name })}
                  checked={skill.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) => setEnabled(skill, enabled)}
                />
                <Button
                  aria-label={t("s_05cefdc56b", { p0: skill.name })}
                  disabled={busy}
                  onClick={() => removeSkill(skill)}
                  size="icon-sm"
                  title={t("s_b9e42ac786")}
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
