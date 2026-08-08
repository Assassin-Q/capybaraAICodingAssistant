import { useEffect, useMemo, useState } from "react";

import type { RunStatus } from "@/components/assistant/shared";
import { ideaApi } from "@/lib/idea";
import { openCodeApi } from "@/lib/opencode";
import type { SessionFileDiff, SessionMessage } from "@/lib/opencode";

interface UseSessionDiffsInput {
  messages: SessionMessage[];
  projectPath?: string;
  runStatus: RunStatus;
  sessionID: string;
}

interface DiffTarget {
  end?: string;
  files: string[];
  messageID: string;
  start?: string;
}

const buildDiffTargets = (messages: SessionMessage[]): DiffTarget[] => {
  const ordered = [...messages].sort(
    (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0)
  );
  const userIDs = new Set(
    ordered.filter((message) => message.type === "user").map((message) => message.id)
  );
  const targets = new Map<string, DiffTarget>();
  let currentUserID = "";

  ordered.forEach((message) => {
    if (message.type === "user") {
      currentUserID = message.id;
      targets.set(message.id, { files: [], messageID: message.id });
      return;
    }
    if (message.type !== "assistant" || !message.snapshot) return;
    const messageID = message.parentID && userIDs.has(message.parentID)
      ? message.parentID
      : currentUserID;
    if (!messageID) return;
    const current = targets.get(messageID) ?? { files: [], messageID };
    targets.set(messageID, {
      end: message.snapshot.end ?? current.end,
      files: [...new Set([...current.files, ...message.snapshot.files])],
      messageID,
      start: current.start ?? message.snapshot.start,
    });
  });

  return [...targets.values()];
};

export function useSessionDiffs({ messages, projectPath, runStatus, sessionID }: UseSessionDiffsInput) {
  const [diffsByMessageID, setDiffsByMessageID] = useState<Record<string, SessionFileDiff[]>>({});
  const diffTargets = useMemo(() => buildDiffTargets(messages), [messages]);
  const diffTargetsKey = useMemo(() => JSON.stringify(diffTargets), [diffTargets]);

  useEffect(() => {
    setDiffsByMessageID({});
    void ideaApi.clearInlineDiffs().catch(() => undefined);
  }, [sessionID]);

  useEffect(() => {
    if (!sessionID || runStatus === "ready" || runStatus === "error") return;
    void ideaApi.clearInlineDiffs().catch(() => undefined);
  }, [runStatus, sessionID]);

  useEffect(() => {
    if (!sessionID || !projectPath || runStatus !== "ready" || diffTargets.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: Array<readonly [string, SessionFileDiff[]]> = [];
      for (const target of diffTargets) {
        let diffs: SessionFileDiff[] = [];
        if (target.start && target.end && target.start !== target.end) {
          try {
            diffs = await ideaApi.getSnapshotDiff({
              end: target.end,
              files: target.files,
              start: target.start,
            });
          } catch {
            diffs = await openCodeApi.getDiff(sessionID, target.messageID, projectPath).catch(() => []);
          }
        } else if (!target.start || !target.end) {
          diffs = await openCodeApi.getDiff(sessionID, target.messageID, projectPath).catch(() => []);
        }
        entries.push([target.messageID, diffs]);
      }
      return entries;
    })().then((entries) => {
      if (cancelled) return;
      const next: Record<string, SessionFileDiff[]> = Object.fromEntries(entries);
      setDiffsByMessageID(next);
    });
    return () => {
      cancelled = true;
    };
  }, [diffTargets, diffTargetsKey, projectPath, runStatus, sessionID]);

  return diffsByMessageID;
}
