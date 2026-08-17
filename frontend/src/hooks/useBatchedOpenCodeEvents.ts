import { useCallback, useEffect, useRef } from "react";
import { applyOpenCodeEvent } from "@/components/assistant/liveEvents";
import type { OpenCodeEvent, SessionMessage } from "@/lib/opencode";

const FLUSH_DELAY = 40;

export function useBatchedOpenCodeEvents(
  setMessages: (sessionID: string, update: (messages: SessionMessage[]) => SessionMessage[]) => void,
) {
  const pendingEvents = useRef(new Map<string, OpenCodeEvent[]>());
  const timers = useRef(new Map<string, number>());

  const flushOpenCodeEvents = useCallback((sessionID?: string) => {
    const sessionIDs = sessionID ? [sessionID] : [...pendingEvents.current.keys()];
    sessionIDs.forEach((targetSessionID) => {
      const timer = timers.current.get(targetSessionID);
      if (timer !== undefined) window.clearTimeout(timer);
      timers.current.delete(targetSessionID);
      const events = pendingEvents.current.get(targetSessionID) ?? [];
      pendingEvents.current.delete(targetSessionID);
      if (events.length > 0) {
        setMessages(targetSessionID, (current) => events.reduce(applyOpenCodeEvent, current));
      }
    });
  }, [setMessages]);

  const enqueueOpenCodeEvent = useCallback((sessionID: string, event: OpenCodeEvent) => {
    const events = pendingEvents.current.get(sessionID) ?? [];
    events.push(event);
    pendingEvents.current.set(sessionID, events);
    if (!timers.current.has(sessionID)) {
      timers.current.set(sessionID, window.setTimeout(() => flushOpenCodeEvents(sessionID), FLUSH_DELAY));
    }
  }, [flushOpenCodeEvents]);

  const clearPendingOpenCodeEvents = useCallback((sessionID?: string) => {
    const sessionIDs = sessionID ? [sessionID] : [...timers.current.keys()];
    sessionIDs.forEach((targetSessionID) => {
      const timer = timers.current.get(targetSessionID);
      if (timer !== undefined) window.clearTimeout(timer);
      timers.current.delete(targetSessionID);
      pendingEvents.current.delete(targetSessionID);
    });
  }, []);

  useEffect(() => () => clearPendingOpenCodeEvents(), [clearPendingOpenCodeEvents]);

  return { clearPendingOpenCodeEvents, enqueueOpenCodeEvent, flushOpenCodeEvents };
}
