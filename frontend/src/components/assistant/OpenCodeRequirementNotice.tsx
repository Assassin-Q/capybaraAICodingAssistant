import { useEffect, useState } from "react";
import { ArrowUpCircle, Check, Copy, Download, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { ideaApi, type OpenCodeRequirement } from "@/lib/idea";
import { setOpenCodeBaseUrl } from "@/lib/opencode";

/**
 * Blocks the way when OpenCode is missing or too old.
 *
 * Everything in the panel is a front end for OpenCode, so without a usable one every screen fails
 * differently and none of them says why. This turns that into one instruction plus the official
 * install commands, because sending someone to a docs page mid-setup loses half of them.
 */
export function OpenCodeRequirementNotice({
  onChanged,
  showHealthy = false,
}: {
  onChanged?: () => void;
  showHealthy?: boolean;
}) {
  const [requirement, setRequirement] = useState<OpenCodeRequirement>();
  const [copied, setCopied] = useState("");
  const [installing, setInstalling] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = (force = false) => {
      void ideaApi.openCodeRequirement(force)
        .then((result) => { if (!cancelled) setRequirement(result); })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(() => load(true), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Silence is the healthy state: nothing is shown while the check is in flight or when it passes.
  const needsInstall = Boolean(requirement && !requirement.installed);
  const needsUpgrade = Boolean(requirement && requirement.installed && (!requirement.supported || requirement.updateAvailable));
  const healthy = Boolean(requirement && !needsInstall && !needsUpgrade);
  if (!requirement || (healthy && !showHealthy)) return null;

  const copy = (command: string) => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(command);
      window.setTimeout(() => setCopied(""), 1600);
    }).catch(() => undefined);
  };

  const install = async () => {
    setInstalling(true);
    setActionMessage("");
    try {
      const result = await ideaApi.installOpenCode(needsUpgrade);
      if (result.requirement) setRequirement(result.requirement);
      if (result.runtime?.baseUrl) setOpenCodeBaseUrl(result.runtime.baseUrl);
      setActionMessage(result.message ?? (needsUpgrade ? t("opencode.updateFailed") : t("opencode.installFailed")));
      if (result.success) onChanged?.();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className={healthy
      ? "rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
      : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"}
    >
      <div className="flex items-start gap-2">
        {healthy
          ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />}
        <div className="min-w-0 flex-1">
          <h3 className={healthy ? "text-sm font-medium" : "text-sm font-medium text-amber-700 dark:text-amber-400"}>
            {healthy
              ? t("opencode.statusTitle", { version: requirement.version })
              : needsInstall
              ? t("opencode.installTitle")
              : requirement.updateAvailable
                ? t("opencode.updateTitle")
                : t("opencode.upgradeTitle")}
          </h3>
          <p className={healthy ? "mt-1 text-xs text-muted-foreground" : "mt-1 text-xs text-amber-700/90 dark:text-amber-400/90"}>
            {healthy
              ? requirement.updateError || t("opencode.upToDate", { version: requirement.latestVersion || requirement.version })
              : requirement.message}
          </p>
        </div>
      </div>

      {requirement.methods.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {requirement.methods.map((method) => (
            <div className="flex items-center gap-2 rounded-md bg-background/60 px-2.5 py-1.5" key={method.id}>
              <span className="w-20 shrink-0 text-[11px] font-medium">{method.label}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{method.command}</code>
              {method.note && <span className="shrink-0 text-[10px] text-muted-foreground">{method.note}</span>}
              <Button
                aria-label={t("opencode.copyCommand")}
                className="size-6 shrink-0"
                onClick={() => copy(method.command)}
                size="icon"
                title={t("opencode.copyCommand")}
                type="button"
                variant="ghost"
              >
                {copied === method.command ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </Button>
              <Button
                className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                disabled={installing}
                onClick={() => void install()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {installing ? <LoaderCircle className="size-3 animate-spin" /> : needsUpgrade ? <ArrowUpCircle className="size-3" /> : <Download className="size-3" />}
                {installing ? t("opencode.working") : needsUpgrade ? t("opencode.updateInApp") : t("opencode.installInApp")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {actionMessage && (
        <p className="mt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-400">{actionMessage}</p>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px]">
        <a className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" href={requirement.docsUrl} rel="noreferrer" target="_blank">
          <ExternalLink className="size-3" />
          {t("opencode.officialDocs")}
        </a>
        <span className="text-muted-foreground">{healthy ? t("opencode.checkInterval") : t("opencode.restartHint")}</span>
      </div>
    </section>
  );
}
