import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { applyOpenCodeEvent } from "@/components/assistant/liveEvents";
import type { OpenCodeEvent, SessionMessage } from "@/lib/opencode";

const FLUSH_DELAY = 40;

export function useBatchedOpenCodeEvents(setMessages: Dispatch<SetStateAction<SessionMessage[]>>) {
  const pendingEvents = useRef<OpenCodeEvent[]>([]);
  const timer = useRef<number>();

  const flushOpenCodeEvents = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (pendingEvents.current.length === 0) return;
    const events = pendingEvents.current;
    pendingEvents.current = [];
    setMessages((current) => events.reduce(applyOpenCodeEvent, current));
  }, [setMessages]);

  const enqueueOpenCodeEvent = useCallback((event: OpenCodeEvent) => {
    pendingEvents.current.push(event);
    if (timer.current === undefined) {
      timer.current = window.setTimeout(flushOpenCodeEvents, FLUSH_DELAY);
    }
  }, [flushOpenCodeEvents]);

  const clearPendingOpenCodeEvents = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    pendingEvents.current = [];
  }, []);

  useEffect(() => () => clearPendingOpenCodeEvents(), [clearPendingOpenCodeEvents]);

  return { clearPendingOpenCodeEvents, enqueueOpenCodeEvent, flushOpenCodeEvents };
}
