import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { errorMessage } from "@/components/assistant/shared";
import { reconcileSessionMessages } from "@/components/assistant/liveEvents";
import type { SessionRuntimeController } from "@/hooks/useSessionRuntime";
import { openCodeApi, type ModelRef } from "@/lib/opencode";
import { t } from "@/lib/i18n";

interface SessionCompactionOptions {
  projectPath?: string;
  runtime: SessionRuntimeController;
  selectedModel?: ModelRef;
  selectedSessionID: string;
  setError: Dispatch<SetStateAction<string>>;
}

/** Drives manual compaction from the request lifecycle; OpenCode has no `compacting` status. */
export function useSessionCompaction({
  projectPath,
  runtime,
  selectedModel,
  selectedSessionID,
  setError,
}: SessionCompactionOptions) {
  const inFlightSessionIDs = useRef(new Set<string>());

  const compactSession = useCallback(async () => {
    if (!selectedSessionID || !projectPath || inFlightSessionIDs.current.has(selectedSessionID)) return;
    if (!selectedModel) {
      setError(t("s_f1e3f90383"));
      return;
    }
    const sessionID = selectedSessionID;
    inFlightSessionIDs.current.add(sessionID);
    setError("");
    runtime.setCompacting(sessionID, true);
    runtime.setRunStatus(sessionID, "submitted");
    const startedAt = Date.now();
    try {
      const request = openCodeApi.compactSession(sessionID, selectedModel, projectPath);
      runtime.setRunStatus(sessionID, "streaming");
      await request;
      const incoming = await openCodeApi.getMessages(sessionID, projectPath);
      /**
       * Say that it finished, whether or not the server left a trace.
       *
       * The conversation already renders a "context compaction complete" divider for a message of
       * this type, but only OpenCode's automatic compaction reliably records one. A manual run
       * ended with the spinner simply vanishing: the history had silently changed and nothing said
       * so. A marker is added only when the reloaded history does not already carry a fresh one,
       * so the server's own record still wins when there is one.
       */
      const reported = incoming.some((message) =>
        message.type === "compaction" && (message.time?.created ?? 0) >= startedAt);
      runtime.setMessages(sessionID, (current) => {
        const merged = reconcileSessionMessages(current, incoming);
        if (reported) return merged;
        return [...merged, {
          id: `compaction_${startedAt}`,
          time: { created: Date.now() },
          type: "compaction" as const,
        }];
      });
      runtime.setRunStatus(sessionID, "ready");
    } catch (compactError) {
      if (runtime.refs.selectedSessionID.current === sessionID) setError(errorMessage(compactError));
      runtime.setRunStatus(sessionID, "error");
    } finally {
      runtime.setCompacting(sessionID, false);
      inFlightSessionIDs.current.delete(sessionID);
    }
  }, [projectPath, runtime, selectedModel, selectedSessionID, setError]);

  return compactSession;
}
