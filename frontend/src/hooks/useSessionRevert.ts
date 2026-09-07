import { useCallback, type Dispatch, type SetStateAction } from "react";

import { messagesBeforeRevert, openCodeApi } from "@/lib/opencode";
import type { SessionInfo } from "@/lib/opencode";
import type { SessionRuntimeController } from "@/hooks/useSessionRuntime";

interface UseSessionRevertInput {
  projectPath?: string;
  runtime: SessionRuntimeController;
  selectedSessionID: string;
  setError: (value: string) => void;
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>;
}

export function useSessionRevert({
  projectPath,
  runtime,
  selectedSessionID,
  setError,
  setSessions,
}: UseSessionRevertInput): (messageID: string) => Promise<void> {
  return useCallback(async (messageID: string) => {
    if (!projectPath || !selectedSessionID) return;
    setError("");
    try {
      await openCodeApi.revertSession(selectedSessionID, messageID, projectPath);
      const [nextSession, nextMessages, nextTodos] = await Promise.all([
        openCodeApi.getSession(selectedSessionID, projectPath),
        openCodeApi.getMessages(selectedSessionID, projectPath),
        openCodeApi.getTodos(selectedSessionID, projectPath),
      ]);
      runtime.setMessages(selectedSessionID, messagesBeforeRevert(nextMessages, nextSession));
      runtime.setMessagesLoaded(selectedSessionID, true);
      runtime.setTodos(selectedSessionID, nextTodos);
      if (nextSession) {
        setSessions((current) => current.map((session) => session.id === nextSession.id ? nextSession : session));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [projectPath, runtime, selectedSessionID, setError, setSessions]);
}
