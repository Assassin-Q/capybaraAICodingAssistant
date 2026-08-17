import { ArrowUpCircle, ExternalLink } from "lucide-react";

import { t } from "@/lib/i18n";
import type { UpdateStatus } from "@/lib/idea";

/**
 * States the installed version, and points at the release when a newer one exists.
 *
 * Always visible, not only on an update: "which build am I actually running" is the first question
 * of every bug report, and the connection page is where people already go to answer it.
 */
export function UpdateNotice({ status }: { status?: UpdateStatus }) {
  if (!status) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
      <ArrowUpCircle className={status.hasUpdate ? "size-3.5 text-amber-500" : "size-3.5 text-muted-foreground"} />
      <span className="text-muted-foreground">{t("update.current", { p0: status.currentVersion })}</span>
      {status.hasUpdate ? (
        <>
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {t("update.available", { p0: status.latestVersion })}
          </span>
          <a
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            href={status.downloadUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-3" />
            {t("update.download")}
          </a>
        </>
      ) : (
        <span className="text-muted-foreground">
          {status.unavailable ? t("update.unavailable") : t("update.latest")}
        </span>
      )}
    </div>
  );
}
