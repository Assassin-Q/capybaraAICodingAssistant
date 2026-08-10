import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { ideaApi, type OpenCodeRequirement } from "@/lib/idea";

/**
 * Blocks the way when OpenCode is missing or too old.
 *
 * Everything in the panel is a front end for OpenCode, so without a usable one every screen fails
 * differently and none of them says why. This turns that into one instruction plus the official
 * install commands, because sending someone to a docs page mid-setup loses half of them.
 */
export function OpenCodeRequirementNotice() {
  const [requirement, setRequirement] = useState<OpenCodeRequirement>();
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    void ideaApi.openCodeRequirement()
      .then((result) => { if (!cancelled) setRequirement(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Silence is the healthy state: nothing is shown while the check is in flight or when it passes.
  if (!requirement || (requirement.installed && requirement.supported)) return null;

  const copy = (command: string) => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(command);
      window.setTimeout(() => setCopied(""), 1600);
    }).catch(() => undefined);
  };

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {requirement.installed ? t("opencode.upgradeTitle") : t("opencode.installTitle")}
          </h3>
          <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-400/90">{requirement.message}</p>
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
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px]">
        <a className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" href={requirement.docsUrl} rel="noreferrer" target="_blank">
          <ExternalLink className="size-3" />
          {t("opencode.officialDocs")}
        </a>
        <span className="text-muted-foreground">{t("opencode.restartHint")}</span>
      </div>
    </section>
  );
}
