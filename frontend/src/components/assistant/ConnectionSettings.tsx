import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppearanceSettings } from "@/components/assistant/AppearanceSettings";
import { LanguageSettings } from "@/components/assistant/LanguageSettings";
import { SessionTabSettings } from "@/components/assistant/SessionTabSettings";
import type { LocalePreference } from "@/lib/i18n";
import { OpenCodeRequirementNotice } from "@/components/assistant/OpenCodeRequirementNotice";
import { OpenSourceAttribution } from "@/components/assistant/OpenSourceAttribution";
import { UpdateNotice } from "@/components/assistant/UpdateNotice";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import { SettingsMessage, useConfirm, useSettingsFeedback } from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi, type IdeaRuntimeConfig, type UpdateStatus } from "@/lib/idea";
import { setOpenCodeBaseUrl } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { SessionTabPreferences } from "@/lib/preferences";

interface ConnectionSettingsProps {
  /** Current language preference and its setter, surfaced here alongside the appearance controls. */
  language: LocalePreference;
  onLanguageChange: (language: LocalePreference) => void;
  updateStatus?: UpdateStatus;
  baseUrl: string;
  connected: boolean;
  nativeTitleActions: boolean;
  /** Reloads models, agents, sessions and commands after the endpoint changes. */
  onChanged: () => void;
  projectPath?: string;
  sessionTabs: SessionTabPreferences;
  onSessionTabsChange: (value: SessionTabPreferences) => void;
}

export function ConnectionSettings({ baseUrl, connected, language, nativeTitleActions, onChanged, onLanguageChange, onSessionTabsChange, projectPath, sessionTabs, updateStatus }: ConnectionSettingsProps) {
  const [restarting, setRestarting] = useState(false);
  /** Set when a restart turned out to be a no-op against an externally started server. */
  const [external, setExternal] = useState<IdeaRuntimeConfig>();
  const confirm = useConfirm();
  const { error, notice, setError, setNotice } = useSettingsFeedback();

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
        // Be explicit: nothing was restarted, so plugin changes are still not loaded.
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
    // `max-w-3xl` alone pinned the content left and left the rest of a wide panel empty. Every
    // other section fills the width; this one now matches, with a cap so the lines stay readable.
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* Above everything: a missing or outdated OpenCode makes every other control meaningless. */}
      <OpenCodeRequirementNotice />
      <UpdateNotice status={updateStatus} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("s_7328deebb5")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("s_ce3e014483")}
          </p>
        </div>
        <Button disabled={restarting} onClick={() => void restart(false)} size="sm" type="button" variant="outline">
          <RotateCcw className={cn("size-3.5", restarting && "animate-spin")} />
          {t("s_b02ebe307b")}
        </Button>
      </header>

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
              onClick={() =>
                confirm.ask({
                  confirmLabel: t("s_ec00d5cd76"),
                  description: t("s_9563306102", { p0: external.externalPid ? ` PID ${external.externalPid}` : "" }),
                  destructive: true,
                  onConfirm: async () => {
                    confirm.close();
                    await restart(true);
                  },
                  title: t("s_f591a93564"),
                })
              }
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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{connected ? t("s_aeeba1b5f4") : t("s_4ca5bf9106")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connected ? t("s_8e0705f06a") : t("s_7bee6679ba")}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t("s_86e118291e")}</dt>
            <dd className="mt-1 break-all font-mono text-xs">{baseUrl}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("s_a1ff8da47d")}</dt>
            <dd className="mt-1 break-all font-mono text-xs">{projectPath ?? t("s_e332687e33")}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("s_7e74e791fb")}
      </p>
      {/*
        Appearance had its own page for two settings; it lives here now, and last.
        Language and conversation tabs are things a user changes while setting the panel up, so
        they come first; the theme mapping is picked once and then left alone. Each block gets its
        own divider so they read as sibling sections rather than one long column.
      */}
      <div className="border-t border-border pt-5">
        <LanguageSettings onChange={onLanguageChange} value={language} />

        {nativeTitleActions && (
          <div className="mt-6 border-t border-border pt-6">
            <SessionTabSettings onChange={onSessionTabsChange} value={sessionTabs} />
          </div>
        )}

        <div className="mt-6 border-t border-border pt-6">
          <AppearanceSettings />
        </div>

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
