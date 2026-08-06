import { useEffect, useMemo, useState } from "react";

import type { RunStatus } from "@/components/assistant/shared";
import { openCodeApi } from "@/lib/opencode";
import type { SessionFileDiff, SessionMessage } from "@/lib/opencode";

interface UseSessionDiffsInput {
  messages: SessionMessage[];
  projectPath?: string;
  runStatus: RunStatus;
  sessionID: string;
}

export function useSessionDiffs({ messages, projectPath, runStatus, sessionID }: UseSessionDiffsInput) {
  const [diffsByMessageID, setDiffsByMessageID] = useState<Record<string, SessionFileDiff[]>>({});
  const messageIDsKey = useMemo(
    () => messages.filter((message) => message.type === "user").map((message) => message.id).join("\n"),
    [messages]
  );

  useEffect(() => {
    setDiffsByMessageID({});
  }, [sessionID]);

  useEffect(() => {
    if (!sessionID || !projectPath || runStatus !== "ready") return;
    const messageIDs = messageIDsKey ? messageIDsKey.split("\n") : [];
    if (messageIDs.length === 0) return;
    let cancelled = false;
    void Promise.all(messageIDs.map(async (messageID) => {
      try {
        return [messageID, await openCodeApi.getDiff(sessionID, messageID, projectPath)] as const;
      } catch {
        return [messageID, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setDiffsByMessageID(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [messageIDsKey, projectPath, runStatus, sessionID]);

  return diffsByMessageID;
}
