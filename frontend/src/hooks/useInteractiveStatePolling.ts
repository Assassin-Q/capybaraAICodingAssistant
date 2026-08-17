import { useEffect, useRef } from "react";
import type { SessionRuntimeController } from "@/hooks/useSessionRuntime";

interface InteractiveStatePollingOptions {
  enabled: boolean;
  sessionIDs: string[];
  loadPending: (sessionID: string) => Promise<unknown>;
  loadTodos: (sessionID: string, directory?: string) => Promise<unknown>;
  projectPath?: string;
  runtime: SessionRuntimeController;
}

const POLL_INTERVAL = 800;

export function useInteractiveStatePolling({
  enabled,
  loadPending,
  loadTodos,
  projectPath,
  runtime,
  sessionIDs,
}: InteractiveStatePollingOptions) {
  const polling = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !projectPath || sessionIDs.length === 0) return;
    const refresh = async () => {
      const activeIDs = [...new Set(sessionIDs)].filter((sessionID) => {
        const state = runtime.get(sessionID);
        return Boolean(state.activePrompt) || state.runStatus === "submitted" || state.runStatus === "streaming";
      });
      await Promise.all(activeIDs.map(async (sessionID) => {
        if (polling.current.has(sessionID)) return;
        polling.current.add(sessionID);
        try {
          await Promise.all([loadPending(sessionID), loadTodos(sessionID, projectPath)]);
        } catch {
          // The durable SSE and final reconciliation remain the fallback.
        } finally {
          polling.current.delete(sessionID);
        }
      }));
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL);
    return () => {
      window.clearInterval(timer);
      polling.current.clear();
    };
  }, [enabled, loadPending, loadTodos, projectPath, runtime, sessionIDs]);
}
