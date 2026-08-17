import { useState } from "react";
import { Cable, Github, Info, Languages, MessagesSquare, Palette, RotateCcw } from "lucide-react";

import { AppearanceSettings } from "@/components/assistant/AppearanceSettings";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import { LanguageSettings } from "@/components/assistant/LanguageSettings";
import { OpenCodeRequirementNotice } from "@/components/assistant/OpenCodeRequirementNotice";
import { OpenSourceAttribution } from "@/components/assistant/OpenSourceAttribution";
import { SessionTabSettings } from "@/components/assistant/SessionTabSettings";
import { SettingsHeader, SettingsMessage, useConfirm, useSettingsFeedback } from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { UpdateNotice } from "@/components/assistant/UpdateNotice";
import { Button } from "@/components/ui/button";
import { ideaApi, type IdeaRuntimeConfig, type UpdateStatus } from "@/lib/idea";
import { t, type LocalePreference } from "@/lib/i18n";
import { setOpenCodeBaseUrl } from "@/lib/opencode";
import type { SessionTabPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface ConnectionSettingsProps {
  baseUrl: string;
  connected: boolean;
  language: LocalePreference;
  nativeTitleActions: boolean;
  onChanged: () => void;
  onLanguageChange: (language: LocalePreference) => void;
  onSessionTabsChange: (value: SessionTabPreferences) => void;
  projectPath?: string;
  sessionTabs: SessionTabPreferences;
  updateStatus?: UpdateStatus;
}

export function ConnectionSettings({
  baseUrl,
  connected,
  language,
  nativeTitleActions,
  onChanged,
  onLanguageChange,
  onSessionTabsChange,
  projectPath,
  sessionTabs,
  updateStatus,
}: ConnectionSettingsProps) {
  const [restarting, setRestarting] = useState(false);
  const [external, setExternal] = useState<IdeaRuntimeConfig>();
  const confirm = useConfirm();
  const { error, notice, setError, setNotice } = useSettingsFeedback();
  const sectionLinks = [
    { icon: Cable, id: "connection-runtime", label: t("s_7328deebb5") },
    { icon: Languages, id: "connection-language", label: t("i18n.title") },
    ...(nativeTitleActions ? [{ icon: MessagesSquare, id: "connection-tabs", label: t("tabs.settingsTitle") }] : []),
    { icon: Palette, id: "connection-appearance", label: t("s_09b58aa342") },
    { icon: Github, id: "connection-open-source", label: t("opensource.title") },
  ];

  const restart = async (force: boolean) => {
    setRestarting(true);
    setNotice(force ? t("s_24abcb2e4b") : t("s_7a325829af"));
    setError("");
    setExternal(undefined);
    try {
      const runtime = await ideaApi.restartOpenCode(force);
      if (runtime.error) {
        setNotice("");
        setError(runtime.error);
        return;
      }
      if (runtime.baseUrl) setOpenCodeBaseUrl(runtime.baseUrl);
      if (runtime.reconnectedOnly) {
        setNotice("");
        setExternal(runtime);
      } else {
        setNotice(
          runtime.managed
            ? t("s_690e271a87", { p0: runtime.baseUrl ?? "" })
            : t("s_2652bccc7f", { p0: runtime.baseUrl ?? "" })
        );
      }
      onChanged();
    } catch (restartError) {
      setNotice("");
      setError(errorMessage(restartError));
    } finally {
      setRestarting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl">
      <nav aria-label={t("connection.sections")} className="sticky top-0 z-20 mb-1 flex min-w-0 flex-wrap gap-1 rounded-md bg-background/95 p-1 shadow-sm backdrop-blur-sm">
        {sectionLinks.map(({ icon: Icon, id, label }) => (
          <a
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            href={`#${id}`}
            key={id}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(id)?.scrollIntoView({ block: "start" });
            }}
          >
            <Icon className="size-3.5" />
            {label}
          </a>
        ))}
      </nav>

      <div className="flex scroll-mt-6 flex-col gap-4 border-b border-border/60 py-7" id="connection-runtime">
        <SettingsHeader
          actions={(
            <Button disabled={restarting} onClick={() => void restart(false)} size="sm" type="button" variant="secondary">
              <RotateCcw className={cn("size-3.5", restarting && "animate-spin")} />
              {t("s_b02ebe307b")}
            </Button>
          )}
          description={t("s_ce3e014483")}
          icon={<Cable className="mt-1 size-5 shrink-0 text-muted-foreground" />}
          title={t("s_7328deebb5")}
        />

        <OpenCodeRequirementNotice />
        <UpdateNotice status={updateStatus} />
        <SettingsMessage error={error} notice={notice} />

        {external && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium">{t("s_401fe47a7b")}</p>
            <p className="mt-1 leading-5">
              {t("s_02034b5454")}
              {external.externalPid ? `（PID ${external.externalPid}）` : ""}{t("s_9d0c55c999")}
              <b>{t("s_9eab93dc60")}</b>{t("s_37893c1dd7")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                disabled={restarting}
                onClick={() => confirm.ask({
                  confirmLabel: t("s_ec00d5cd76"),
                  description: t("s_9563306102", { p0: external.externalPid ? ` PID ${external.externalPid}` : "" }),
                  destructive: true,
                  onConfirm: async () => {
                    confirm.close();
                    await restart(true);
                  },
                  title: t("s_f591a93564"),
                })}
                size="sm"
                type="button"
                variant="destructive"
              >
                {t("s_cae00a80bb")}
              </Button>
              <span className="text-[11px] opacity-80">{t("s_1a5568fd38")}</span>
            </div>
          </div>
        )}

        <div className="divide-y divide-border/50 border-y border-border/60">
          <div className="flex items-center gap-3 py-3.5">
            <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{connected ? t("s_aeeba1b5f4") : t("s_4ca5bf9106")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {connected ? t("s_8e0705f06a") : t("s_7bee6679ba")}
              </p>
            </div>
          </div>
          <dl className="divide-y divide-border/50">
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start sm:gap-4">
              <dt className="text-xs text-muted-foreground">{t("s_86e118291e")}</dt>
              <dd className="break-all font-mono text-xs leading-5">{baseUrl}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start sm:gap-4">
              <dt className="text-xs text-muted-foreground">{t("s_a1ff8da47d")}</dt>
              <dd className="break-all font-mono text-xs leading-5">{projectPath ?? t("s_e332687e33")}</dd>
            </div>
          </dl>
        </div>

        <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("s_7e74e791fb")}</span>
        </p>
      </div>

      <div className="scroll-mt-6 border-b border-border/60 py-7" id="connection-language">
        <LanguageSettings onChange={onLanguageChange} value={language} />
      </div>

      {nativeTitleActions && (
        <div className="scroll-mt-6 border-b border-border/60 py-7" id="connection-tabs">
          <SessionTabSettings onChange={onSessionTabsChange} value={sessionTabs} />
        </div>
      )}

      <div className="scroll-mt-6 border-b border-border/60 py-7" id="connection-appearance">
        <AppearanceSettings />
      </div>

      <div className="scroll-mt-6 py-7" id="connection-open-source">
        <OpenSourceAttribution />
      </div>

      <ConfirmDialog
        busy={restarting}
        onOpenChange={(open) => {
          if (!open) confirm.close();
        }}
        request={confirm.request}
      />
    </section>
  );
}
