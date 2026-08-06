import { useEffect, useRef } from "react";

interface InteractiveStatePollingOptions {
  enabled: boolean;
  loadPending: (sessionID: string) => Promise<unknown>;
  loadTodos: (sessionID: string, directory?: string) => Promise<unknown>;
  projectPath?: string;
  sessionID: string;
}

const POLL_INTERVAL = 800;

export function useInteractiveStatePolling({
  enabled,
  loadPending,
  loadTodos,
  projectPath,
  sessionID,
}: InteractiveStatePollingOptions) {
  const polling = useRef(false);

  useEffect(() => {
    if (!enabled || !projectPath || !sessionID) return;
    const refresh = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        await Promise.all([loadPending(sessionID), loadTodos(sessionID, projectPath)]);
      } catch {
        // The durable SSE and final reconciliation remain the fallback.
      } finally {
        polling.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [enabled, loadPending, loadTodos, projectPath, sessionID]);
}
