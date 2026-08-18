import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileDiff, GitBranch, GitCommitHorizontal, RefreshCw, Sparkles, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/components/assistant/shared";
import { gitApi, type GitStatusResponse } from "@/lib/ideaIntegrations";
import { generateCommitSummary } from "@/lib/commitSummary";
import type { ModelInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useAssistantOverlayDismiss } from "@/lib/assistantOverlays";

interface GitStatusButtonProps {
  model?: ModelInfo;
  /** Incremented by the IDEA title action to open this existing Git panel. */
  openRequest?: number;
  /** Uses a fixed JCEF panel when the trigger lives in IDEA's native title bar. */
  nativeTrigger?: boolean;
  projectPath?: string;
  variant?: string;
}

const GIT_STATUS_POLL_INTERVAL_MS = 5000;

export function GitStatusButton({ model, nativeTrigger = false, openRequest = 0, projectPath, variant }: GitStatusButtonProps) {
  const [status, setStatus] = useState<GitStatusResponse>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [manualRefresh, setManualRefresh] = useState(false);
  const [message, setMessage] = useState("");
  const nativePanelRef = useRef<HTMLDivElement>(null);
  const lastOpenRequest = useRef(0);
  useAssistantOverlayDismiss(() => setOpen(false));

  const [, setSessionBranch] = useState<string>();
  const [branchChanged, setBranchChanged] = useState<string>();

  const refresh = useCallback(async (showBusy = false) => {
    if (showBusy) setManualRefresh(true);
    try {
      const next = await gitApi.status();
      setStatus(next);
      setSessionBranch((current) => {
        if (!next.branch) return current;
        if (current === undefined) return next.branch;
        if (current !== next.branch) setBranchChanged(current);
        return next.branch;
      });
    } catch {
      setStatus(undefined);
    } finally {
      if (showBusy) setManualRefresh(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), GIT_STATUS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!nativeTrigger || openRequest <= lastOpenRequest.current) return;
    lastOpenRequest.current = openRequest;
    // The IDEA action lives outside the JCEF document. Open immediately instead of waiting for the
    // next Git poll, which made the click look ineffective on newer IDEA title bars.
    setOpen(true);
    void refresh();
  }, [nativeTrigger, openRequest, refresh]);

  useEffect(() => {
    if (!nativeTrigger || !open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !nativePanelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [nativeTrigger, open]);

  const changeCount = status?.files?.length ?? 0;
  const files = status?.files ?? [];
  const untrackedCount = files.filter((file) => file.status === t("s_2f345ab234")).length;
  const hasChanges = changeCount > 0;

  const run = async (label: string, action: () => Promise<{ success: boolean; message?: string }>) => {
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      setMessage(result.message ?? (result.success ? t("s_33246f6a5e") : t("s_09e424b5e8")));
      await refresh();
    } catch (actionError) {
      setMessage(errorMessage(actionError));
    } finally {
      setBusy("");
    }
  };

  const commitWithSummary = async () => {
    setBusy("summary");
    setMessage(t("s_ad81e85d1f"));
    try {
      const summary = await generateCommitSummary({ model, projectPath, variant });
      setMessage("");
      await run("commit", () => gitApi.openCommitDialog(summary));
    } catch (summaryError) {
      setMessage(errorMessage(summaryError));
      setBusy("");
    }
  };

  if (!status?.available && !nativeTrigger) return null;

  const content = (
    <>
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{status?.branch ?? t("s_433d7578c0")}</span>
        {status?.ahead && status.ahead > 0 && <Badge variant="secondary">↑{status.ahead}</Badge>}
        {status?.behind && status.behind > 0 && <Badge variant="secondary">↓{status.behind}</Badge>}
        <Button aria-label={t("git.statusRefreshNow")} className="size-6 shrink-0" disabled={manualRefresh || busy !== ""} onClick={() => void refresh(true)} size="icon" title={t("git.statusRefreshNow")} type="button" variant="ghost">
          <RefreshCw className={cn("size-3.5", manualRefresh && "animate-spin")} />
        </Button>
      </div>

      {!status?.available ? (
        <div className="flex items-start gap-2 px-3 py-6 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{status?.message ?? t("git.statusUnavailable")}</span>
        </div>
      ) : (
        <>
          {branchChanged && (
            <div className="flex items-start gap-2 border-b border-border/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <span className="min-w-0 flex-1">
                {t("s_f7f3bb63a8")} <span className="font-mono">{branchChanged}</span> {t("s_9802e9658b")} {" "}
                <span className="font-mono">{status.branch}</span>{t("s_4972a9aa2d")}
              </span>
              <Button className="h-5 shrink-0 px-1.5 text-[10px]" onClick={() => setBranchChanged(undefined)} size="sm" type="button" variant="ghost">
                {t("s_cb63c62e50")}
              </Button>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {changeCount === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("s_bb23f90c24")}</p>
            ) : (
              files.map((file) => (
                <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/60" key={file.path} onClick={() => void run("diff", () => gitApi.openFileDiff(file.path))} title={t("s_36905b2c6c", { p0: file.path })} type="button">
                  <span className={cn("w-8 shrink-0 text-[10px]", file.staged ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {file.status}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                  {file.binary ? (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{t("s_78ff74e37b")}</span>
                  ) : (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>}
                      {file.additions > 0 && file.deletions > 0 && " "}
                      {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
                    </span>
                  )}
                  <FileDiff className="size-3 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>

          {changeCount > 0 && (
            <div className="flex items-center gap-2 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
              <span>{t("s_3b6ef811b8")} {changeCount} {t("s_6218629ae2")}</span>
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">+{files.reduce((total, file) => total + (file.additions || 0), 0)}</span>
              <span className="font-mono tabular-nums text-red-500">-{files.reduce((total, file) => total + (file.deletions || 0), 0)}</span>
              <span className="ml-auto">{t("s_9a3d4fb626")}</span>
            </div>
          )}

          {untrackedCount > 0 && (
            <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 flex-1">{t("s_fbd5b75066")} {untrackedCount} {t("s_60e91324fb")}</span>
            </div>
          )}
        </>
      )}

      {message && <p className="border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">{message}</p>}

      <div className="border-t border-border/40 p-2">
        <Button className="w-full justify-center" disabled={!status?.available || !hasChanges || busy !== ""} onClick={() => void commitWithSummary()} size="sm" type="button">
          <Sparkles className="size-3.5" />
          {busy === "summary" ? t("s_50aa8e2a5a") : t("s_b475f71105")}
        </Button>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Button disabled={!status?.available || !hasChanges || busy !== ""} onClick={() => void run("commit", () => gitApi.openCommitDialog())} size="sm" type="button" variant="outline">
            <GitCommitHorizontal className="size-3.5" />
            {t("s_f9efd6b1b6")}
          </Button>
          <Button disabled={busy !== ""} onClick={() => void run("push", () => gitApi.openPushDialog())} size="sm" type="button" variant="outline">
            <Upload className="size-3.5" />
            {t("s_a71772f65f")}
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{t("git.statusAutoRefresh", { seconds: GIT_STATUS_POLL_INTERVAL_MS / 1000 })}</p>
      </div>
    </>
  );

  if (nativeTrigger) {
    return open ? (
      <div aria-label={t("s_9daf4302ed", { p0: changeCount })} className="fixed right-2 top-1 z-[60] w-80 overflow-hidden rounded-md border border-border/50 bg-popover text-popover-foreground shadow-lg" ref={nativePanelRef} role="dialog">
        {content}
      </div>
    ) : null;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button aria-label={hasChanges ? t("s_9daf4302ed", { p0: changeCount }) : t("s_044ef935a9")} className="relative size-8 shrink-0" title={`${status?.branch ?? "Git"}${hasChanges ? t("s_96e1a84d2d", { p0: changeCount }) : t("s_7c098875da")}`} type="button" variant="ghost">
          <GitBranch className="size-3.5" />
          <span className={cn("absolute right-1 top-1 size-1.5 rounded-full", branchChanged ? "bg-red-500" : hasChanges ? "bg-amber-500" : "bg-emerald-500")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-border/50 p-0" sideOffset={6}>{content}</PopoverContent>
    </Popover>
  );
}
