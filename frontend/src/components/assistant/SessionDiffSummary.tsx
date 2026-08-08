import { ChevronDown, Columns3, FilePenLine } from "lucide-react";
import { useState } from "react";

import {
  Commit,
  CommitContent,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileInfo,
  CommitFilePath,
  CommitFiles,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
} from "@/components/ai-elements/commit";
import { Button } from "@/components/ui/button";
import { ideaApi } from "@/lib/idea";
import type { SessionFileDiff } from "@/lib/opencode";

const INITIAL_FILE_COUNT = 3;

export function SessionDiffSummary({ diffs }: { diffs: SessionFileDiff[] }) {
  const [showAll, setShowAll] = useState(false);
  if (diffs.length === 0) return null;

  const additions = diffs.reduce((total, diff) => total + diff.additions, 0);
  const deletions = diffs.reduce((total, diff) => total + diff.deletions, 0);
  const visibleDiffs = showAll ? diffs : diffs.slice(0, INITIAL_FILE_COUNT);
  const hiddenCount = diffs.length - visibleDiffs.length;
  const openDiff = (diff: SessionFileDiff) => {
    if (!diff.file || !diff.patch) return;
    void ideaApi.openDiff({
      file: diff.file,
      patch: diff.patch,
      title: `AI 修改：${diff.file}`,
    });
  };

  return (
    <Commit className="mt-2 overflow-hidden rounded-md border border-border/35 bg-background/45 shadow-none" defaultOpen>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
          <FilePenLine className="size-4" />
        </div>
        <CommitInfo className="min-w-0 gap-0.5">
          <CommitMessage className="truncate text-xs font-medium">已编辑 {diffs.length} 个文件</CommitMessage>
          <CommitMetadata className="gap-1.5">
            <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
            <span className="text-red-600 dark:text-red-400">-{deletions}</span>
          </CommitMetadata>
        </CommitInfo>
      </div>
      <CommitContent className="border-border/30 px-1.5 py-1">
        <CommitFiles className="space-y-0.5">
          {visibleDiffs.map((diff, index) => {
            const canOpen = Boolean(diff.file && diff.patch);
            return (
              <CommitFile
                aria-label={canOpen ? `在 IDEA 中比较 ${diff.file}` : undefined}
                className={canOpen
                  ? "group/file cursor-pointer px-1.5 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  : "px-1.5 py-1.5"
                }
                key={`${diff.file ?? "file"}-${index}`}
                onClick={() => openDiff(diff)}
                onKeyDown={(event) => {
                  if (!canOpen || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  openDiff(diff);
                }}
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                title={canOpen ? "在 IDEA 中打开三栏差异" : undefined}
              >
                <CommitFileInfo>
                  <CommitFilePath className="font-sans text-xs text-muted-foreground">
                    {diff.file ?? "未知文件"}
                  </CommitFilePath>
                </CommitFileInfo>
                <CommitFileChanges>
                  <CommitFileAdditions count={diff.additions} />
                  <CommitFileDeletions count={diff.deletions} />
                  {canOpen && (
                    <Columns3 className="ml-1 size-3.5 text-muted-foreground opacity-60 transition-opacity group-hover/file:opacity-100" />
                  )}
                </CommitFileChanges>
              </CommitFile>
            );
          })}
          {hiddenCount > 0 && (
            <Button
              className="h-7 w-full justify-start gap-1.5 px-1.5 text-xs text-muted-foreground"
              onClick={() => setShowAll(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronDown className="size-3.5" />
              再显示 {hiddenCount} 个文件
            </Button>
          )}
        </CommitFiles>
      </CommitContent>
    </Commit>
  );
}
