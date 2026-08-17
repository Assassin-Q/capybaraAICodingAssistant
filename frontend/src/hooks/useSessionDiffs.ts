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

export interface SessionDiffState {
  activeDiffs: SessionFileDiff[];
  diffsByMessageID: Record<string, SessionFileDiff[]>;
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

const sameDiffs = (left: SessionFileDiff[], right: SessionFileDiff[]): boolean =>
  left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.file === other.file
      && item.patch === other.patch
      && item.additions === other.additions
      && item.deletions === other.deletions
      && item.status === other.status;
  });

/** Prefer the IDEA snapshot comparison, falling back to OpenCode while a snapshot is incomplete. */
const fetchTargetDiff = async (
  sessionID: string,
  projectPath: string,
  target: DiffTarget,
): Promise<SessionFileDiff[]> => {
  if (target.start && target.end && target.start !== target.end) {
    try {
      return await ideaApi.getSnapshotDiff({
        end: target.end,
        files: target.files,
        start: target.start,
      });
    } catch {
      // OpenCode's live diff is available before Git snapshots have an end marker.
    }
  }
  return openCodeApi.getDiff(sessionID, target.messageID, projectPath);
};

export function useSessionDiffs({ messages, projectPath, runStatus, sessionID }: UseSessionDiffsInput): SessionDiffState {
  const [activeDiffs, setActiveDiffs] = useState<SessionFileDiff[]>([]);
  const [diffsByMessageID, setDiffsByMessageID] = useState<Record<string, SessionFileDiff[]>>({});
  const diffTargets = useMemo(() => buildDiffTargets(messages), [messages]);
  const diffTargetsKey = useMemo(() => JSON.stringify(diffTargets), [diffTargets]);
  const activeTarget = diffTargets[diffTargets.length - 1];
  const activeTargetKey = activeTarget ? JSON.stringify(activeTarget) : "";
  const activeRun = runStatus === "submitted" || runStatus === "streaming";

  useEffect(() => {
    setActiveDiffs([]);
    setDiffsByMessageID({});
    void ideaApi.clearInlineDiffs().catch(() => undefined);
  }, [sessionID]);

  useEffect(() => {
    if (!sessionID || runStatus === "ready" || runStatus === "error") return;
    void ideaApi.clearInlineDiffs().catch(() => undefined);
  }, [runStatus, sessionID]);

  useEffect(() => {
    if (!activeRun || !sessionID || !projectPath || !activeTarget) {
      setActiveDiffs((current) => current.length === 0 ? current : []);
      return;
    }
    const target = activeTarget;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      const next = await fetchTargetDiff(sessionID, projectPath, target).catch(() => undefined);
      if (!cancelled && next) {
        setActiveDiffs((current) => sameDiffs(next, current) ? current : next);
      }
      if (!cancelled) timer = window.setTimeout(poll, 700);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // The target key restarts polling only when the current round gets a new snapshot/file list.
  }, [activeRun, activeTargetKey, projectPath, sessionID]);

  useEffect(() => {
    if (!sessionID || !projectPath || runStatus !== "ready" || diffTargets.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: Array<readonly [string, SessionFileDiff[]]> = [];
      for (const target of diffTargets) {
        const diffs = await fetchTargetDiff(sessionID, projectPath, target).catch(() => []);
        entries.push([target.messageID, diffs]);
      }
      return entries;
    })().then((entries) => {
      if (cancelled) return;
      setDiffsByMessageID((current) => {
        const next: Record<string, SessionFileDiff[]> = Object.fromEntries(entries);
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [diffTargets, diffTargetsKey, projectPath, runStatus, sessionID]);

  return { activeDiffs, diffsByMessageID };
}
