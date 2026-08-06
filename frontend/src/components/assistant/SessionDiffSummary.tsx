import {
  Commit,
  CommitContent,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFileStatus,
  CommitFiles,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
} from "@/components/ai-elements/commit";
import { CodeBlock } from "@/components/ai-elements/code-block";
import type { SessionFileDiff } from "@/lib/opencode";

export function SessionDiffSummary({ diffs }: { diffs: SessionFileDiff[] }) {
  if (diffs.length === 0) return null;
  const additions = diffs.reduce((total, diff) => total + diff.additions, 0);
  const deletions = diffs.reduce((total, diff) => total + diff.deletions, 0);
  return (
    <Commit className="mt-2 rounded-md border border-border/50 bg-transparent shadow-none">
      <CommitHeader className="gap-2 px-2.5 py-2">
        <CommitInfo>
          <CommitMessage>已编辑 {diffs.length} 个文件</CommitMessage>
          <CommitMetadata>
            <span className="text-emerald-600">+{additions}</span>
            <span className="text-red-600">-{deletions}</span>
          </CommitMetadata>
        </CommitInfo>
      </CommitHeader>
      <CommitContent className="border-t border-border/40 px-2 py-1.5">
        <CommitFiles>
          {diffs.map((diff, index) => (
            <div className="min-w-0" key={`${diff.file ?? "file"}-${index}`}>
              <CommitFile>
                <CommitFileInfo>
                  <CommitFileStatus status={diff.status ?? "modified"} />
                  <CommitFileIcon />
                  <CommitFilePath>{diff.file ?? "未知文件"}</CommitFilePath>
                </CommitFileInfo>
                <CommitFileChanges>
                  <CommitFileAdditions count={diff.additions} />
                  <CommitFileDeletions count={diff.deletions} />
                </CommitFileChanges>
              </CommitFile>
              {diff.patch && (
                <CodeBlock
                  className="mb-2 max-h-80 overflow-auto rounded-md border-0 bg-muted/35 text-xs shadow-none"
                  code={diff.patch}
                  language="diff"
                />
              )}
            </div>
          ))}
        </CommitFiles>
      </CommitContent>
    </Commit>
  );
}
