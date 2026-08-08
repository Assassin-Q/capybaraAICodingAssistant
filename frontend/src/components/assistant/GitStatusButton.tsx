import { useCallback, useEffect, useState } from "react";
import { GitBranch, GitCommitHorizontal, Sparkles, Upload } from "lucide-react";

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

        <div className="max-h-56 overflow-y-auto">
          {changeCount === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">工作区干净，没有待提交的改动</p>
          ) : (
            status.files.map((file) => (
              <div className="flex items-center gap-2 px-3 py-1.5" key={file.path}>
                <span
                  className={cn(
                    "shrink-0 text-[10px]",
                    file.staged ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {file.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
                  {file.path}
                </span>
              </div>
            ))
          )}
        </div>

        {message && (
          <p className="border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">{message}</p>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-border/40 px-3 py-2">
          <Button
            disabled={!hasChanges || busy !== ""}
            onClick={() => void commitWithSummary()}
            size="sm"
            type="button"
          >
            <Sparkles className="size-3.5" />
            {busy === "summary" ? "生成中…" : "AI 摘要并提交"}
          </Button>
          <Button
            disabled={!hasChanges || busy !== ""}
            onClick={() => void run("commit", () => gitApi.openCommitDialog())}
            size="sm"
            type="button"
            variant="outline"
          >
            <GitCommitHorizontal className="size-3.5" />
            提交
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
        <p className="px-3 pb-2 text-[10px] text-muted-foreground">
          提交和推送都会打开 IDEA 自带的窗口，你可以在那里改摘要、挑文件。
        </p>
      </PopoverContent>
    </Popover>
  );
}
