import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileDiff, GitBranch, GitCommitHorizontal, Sparkles, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorMessage } from "@/components/assistant/shared";
import { gitApi, type GitStatusResponse } from "@/lib/ideaIntegrations";
import { generateCommitSummary } from "@/lib/commitSummary";
import type { ModelInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface GitStatusButtonProps {
  model?: ModelInfo;
  projectPath?: string;
  variant?: string;
}

export function GitStatusButton({ model, projectPath, variant }: GitStatusButtonProps) {
  const [status, setStatus] = useState<GitStatusResponse>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  /** Branch seen on the previous poll, so a mid-session switch can be flagged. */
  const [, setSessionBranch] = useState<string>();
  const [branchChanged, setBranchChanged] = useState<string>();

  const refresh = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Cheap enough to poll; git status on a warm repo is a few milliseconds.
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const changeCount = status?.files.length ?? 0;
  const untrackedCount = status?.files.filter((file) => file.status === "未跟踪").length ?? 0;
  const hasChanges = changeCount > 0;

  const run = async (label: string, action: () => Promise<{ success: boolean; message?: string }>) => {
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      setMessage(result.message ?? (result.success ? "完成" : "操作失败"));
      await refresh();
    } catch (actionError) {
      setMessage(errorMessage(actionError));
    } finally {
      setBusy("");
    }
  };

  const commitWithSummary = async () => {
    setBusy("summary");
    setMessage("正在让当前模型总结改动…");
    try {
      const summary = await generateCommitSummary({ model, projectPath, variant });
      setMessage("");
      await run("commit", () => gitApi.openCommitDialog(summary));
    } catch (summaryError) {
      setMessage(errorMessage(summaryError));
      setBusy("");
    }
  };

  if (!status?.available) return null;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={hasChanges ? `Git：${changeCount} 个改动` : "Git：工作区干净"}
          className="relative size-8 shrink-0"
          size="icon"
          title={`${status.branch ?? "Git"}${hasChanges ? ` · ${changeCount} 个改动` : " · 干净"}`}
          type="button"
          variant="ghost"
        >
          <GitBranch className="size-3.5" />
          <span
            className={cn(
              "absolute right-1 top-1 size-1.5 rounded-full",
              branchChanged ? "bg-red-500" : hasChanges ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-border/50 p-0" sideOffset={6}>
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{status.branch ?? "未知分支"}</span>
          {status.ahead > 0 && <Badge variant="secondary">↑{status.ahead}</Badge>}
          {status.behind > 0 && <Badge variant="secondary">↓{status.behind}</Badge>}
        </div>

        {branchChanged && (
          <div className="flex items-start gap-2 border-b border-border/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <span className="min-w-0 flex-1">
              分支已从 <span className="font-mono">{branchChanged}</span> 切到{" "}
              <span className="font-mono">{status.branch}</span>。助手此前读过的文件内容可能已失效，
              建议新开一个会话，或在提问时说明。
            </span>
            <Button
              className="h-5 shrink-0 px-1.5 text-[10px]"
              onClick={() => setBranchChanged(undefined)}
              size="sm"
              type="button"
              variant="ghost"
            >
              知道了
            </Button>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto">
          {changeCount === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">工作区干净，没有待提交的改动</p>
          ) : (
            status.files.map((file) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/60"
                key={file.path}
                onClick={() => void run("diff", () => gitApi.openFileDiff(file.path))}
                title={`${file.path}\n点击在 IDEA 中对比 HEAD 与当前工作区`}
                type="button"
              >
                <span
                  className={cn(
                    "w-8 shrink-0 text-[10px]",
                    file.staged ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {file.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                {file.binary ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">二进制</span>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    {file.additions > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                    )}
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
            <span>共 {changeCount} 个文件</span>
            {/* Binary files carry no line counts, and `undefined + n` turned the totals into NaN. */}
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{status.files.reduce((total, file) => total + (file.additions || 0), 0)}
            </span>
            <span className="font-mono tabular-nums text-red-500">
              -{status.files.reduce((total, file) => total + (file.deletions || 0), 0)}
            </span>
            <span className="ml-auto">点击文件可对比</span>
          </div>
        )}

        {untrackedCount > 0 && (
          <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 flex-1">
              有 {untrackedCount} 个文件还没纳入 Git。IDEA 的提交窗口默认不会勾选它们，
              漏掉就不会进这次提交——请在窗口左侧确认勾上，或先把它们加入 .gitignore。
            </span>
          </div>
        )}

        {message && (
          <p className="border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">{message}</p>
        )}

        <div className="border-t border-border/40 p-2">
          <Button
            className="w-full justify-center"
            disabled={!hasChanges || busy !== ""}
            onClick={() => void commitWithSummary()}
            size="sm"
            type="button"
          >
            <Sparkles className="size-3.5" />
            {busy === "summary" ? "正在生成摘要…" : "AI 摘要并提交"}
          </Button>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button
              disabled={!hasChanges || busy !== ""}
              onClick={() => void run("commit", () => gitApi.openCommitDialog())}
              size="sm"
              type="button"
              variant="outline"
            >
              <GitCommitHorizontal className="size-3.5" />
              直接提交
            </Button>
            <Button
              disabled={busy !== ""}
              onClick={() => void run("push", () => gitApi.openPushDialog())}
              size="sm"
              type="button"
              variant="outline"
            >
              <Upload className="size-3.5" />
              推送
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            都会打开 IDEA 自带窗口，可在那里改摘要、挑文件
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
