import { Download, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ideaApi, type UpdateStatus } from "@/lib/idea";
import { t } from "@/lib/i18n";

/** Startup-only update prompt; the status dot and settings notice remain independent. */
export function UpdatePrompt({ status }: { status?: UpdateStatus }) {
  const [closedVersion, setClosedVersion] = useState("");
  const version = status?.latestVersion ?? "";
  const eligible = Boolean(status?.hasUpdate && version && status?.ignoredVersion !== version);
  const open = eligible && closedVersion !== version;

  const close = () => setClosedVersion(version);
  const ignore = () => {
    close();
    void ideaApi.ignorePluginUpdate(version).catch(() => undefined);
  };

  return (
    <Dialog onOpenChange={(nextOpen) => { if (!nextOpen && open) close(); }} open={open}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("update.promptTitle")}</DialogTitle>
          <DialogDescription>{t("update.promptDescription", { p0: version })}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Download className="size-3.5 shrink-0 text-amber-500" />
          <span>{t("update.promptCurrent", { p0: status?.currentVersion ?? "" })}</span>
          <span aria-hidden="true">→</span>
          <span className="font-medium text-foreground">{version}</span>
        </div>
        <DialogFooter>
          <Button onClick={ignore} size="sm" type="button" variant="ghost">
            <X className="size-3.5" />
            {t("update.ignoreVersion")}
          </Button>
          <Button asChild onClick={close} size="sm" type="button">
            <a href={status?.downloadUrl} rel="noreferrer" target="_blank">
              <Download className="size-3.5" />
              {t("update.download")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
