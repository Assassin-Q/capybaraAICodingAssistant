import { useCallback, useMemo, useReducer, useRef } from "react";
import type { MutableRefObject, SetStateAction } from "react";

import type { RunStatus } from "@/components/assistant/shared";
import type { SessionMessage, TodoInfo } from "@/lib/opencode";

export interface ActivePrompt {
  /** Dedicated operations such as /init can succeed without persisting an assistant message. */
  allowEmptyOutput?: boolean;
  fingerprint: string;
  generation: number;
  messageID: string;
  sessionID: string;
  startedAt: number;
}

export interface SessionRuntimeState {
  activePrompt?: ActivePrompt;
  assistantMessageIDs: Set<string>;
  compacting: boolean;
  generation: number;
  hasActivity: boolean;
  messagesLoaded: boolean;
  messages: SessionMessage[];
  queuePaused: boolean;
  runStatus: RunStatus;
  streamingAssistantID?: string;
  todos: TodoInfo[];
}

export interface SessionRuntimeRefs {
  selectedSessionID: MutableRefObject<string>;
  sessions: MutableRefObject<Map<string, SessionRuntimeState>>;
}

export interface SessionRuntimeController {
  clear: (sessionID: string) => void;
  get: (sessionID: string) => SessionRuntimeState;
  publish: (sessionID: string) => void;
  refs: SessionRuntimeRefs;
  setCompacting: (sessionID: string, action: SetStateAction<boolean>) => void;
  setMessages: (sessionID: string, action: SetStateAction<SessionMessage[]>) => void;
  setMessagesLoaded: (sessionID: string, action: SetStateAction<boolean>) => void;
  setQueuePaused: (sessionID: string, action: SetStateAction<boolean>) => void;
  setRunStatus: (sessionID: string, action: SetStateAction<RunStatus>) => void;
  setStreamingAssistantID: (sessionID: string, action: SetStateAction<string | undefined>) => void;
  setTodos: (sessionID: string, action: SetStateAction<TodoInfo[]>) => void;
}

const createRuntime = (): SessionRuntimeState => ({
  assistantMessageIDs: new Set<string>(),
  compacting: false,
  generation: 0,
  hasActivity: false,
  messagesLoaded: false,
  messages: [],
  queuePaused: false,
  runStatus: "ready",
  todos: [],
});

const resolve = <T,>(current: T, action: SetStateAction<T>): T =>
  typeof action === "function" ? (action as (value: T) => T)(current) : action;

/**
 * Durable per-session state for tabs. Background sessions keep receiving SSE and polling updates;
 * only the selected session publishes React renders, so an inactive stream cannot shake the view.
 */
export function useSessionRuntime(
  selectedSessionID: string,
  selectedSessionIDRef: MutableRefObject<string>,
): { controller: SessionRuntimeController; current: SessionRuntimeState } {
  const sessions = useRef(new Map<string, SessionRuntimeState>());
  const [, render] = useReducer((value: number) => value + 1, 0);
  selectedSessionIDRef.current = selectedSessionID;

  const get = useCallback((sessionID: string) => {
    const existing = sessions.current.get(sessionID);
    if (existing) return existing;
    const created = createRuntime();
    sessions.current.set(sessionID, created);
    return created;
  }, []);

  const publish = useCallback((sessionID: string) => {
    if (selectedSessionIDRef.current === sessionID) render();
  }, [selectedSessionIDRef]);

  const update = useCallback(<K extends keyof SessionRuntimeState>(
    sessionID: string,
    key: K,
    action: SetStateAction<SessionRuntimeState[K]>,
  ) => {
    if (!sessionID) return;
    const runtime = get(sessionID);
    const next = resolve(runtime[key], action);
    if (Object.is(next, runtime[key])) return;
    runtime[key] = next;
    publish(sessionID);
  }, [get, publish]);

  const controller = useMemo<SessionRuntimeController>(() => ({
    clear: (sessionID) => {
      sessions.current.delete(sessionID);
      publish(sessionID);
    },
    get,
    publish,
    refs: { selectedSessionID: selectedSessionIDRef, sessions },
    setCompacting: (sessionID, action) => update(sessionID, "compacting", action),
    setMessages: (sessionID, action) => update(sessionID, "messages", action),
    setMessagesLoaded: (sessionID, action) => update(sessionID, "messagesLoaded", action),
    setQueuePaused: (sessionID, action) => update(sessionID, "queuePaused", action),
    setRunStatus: (sessionID, action) => update(sessionID, "runStatus", action),
    setStreamingAssistantID: (sessionID, action) => update(sessionID, "streamingAssistantID", action),
    setTodos: (sessionID, action) => update(sessionID, "todos", action),
  }), [get, publish, selectedSessionIDRef, update]);

  const current = selectedSessionID ? get(selectedSessionID) : createRuntime();
  return { controller, current };
}

/** Finds the owner of an event that omitted sessionID, as some older V2 stream events do. */
export function findRuntimeSession(
  refs: SessionRuntimeRefs,
  ...messageIDs: Array<string | undefined>
): string | undefined {
  const ids = new Set(messageIDs.filter((id): id is string => Boolean(id)));
  if (ids.size === 0) return undefined;
  for (const [sessionID, runtime] of refs.sessions.current) {
    if (
      (runtime.activePrompt && ids.has(runtime.activePrompt.messageID))
      || [...ids].some((id) => runtime.assistantMessageIDs.has(id))
    ) return sessionID;
  }
  return undefined;
}
