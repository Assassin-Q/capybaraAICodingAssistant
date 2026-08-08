import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  eventAssistantParentID,
  eventMessageID,
  eventSessionID,
} from "@/components/assistant/liveEvents";
import {
  eventChangesFiles,
  isAssistantStreamEvent,
  isFinishedEvent,
  isStreamEvent,
  normalizeEventType,
} from "@/components/assistant/appRuntime";
import { errorMessage } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData, RunStatus } from "@/components/assistant/shared";
import { ideaApi, subscribeIdeaEvents } from "@/lib/idea";
import type { IdeaTheme } from "@/hooks/useIdeaTheme";
import { subscribeOpenCodeEvents, toQuestionRequest, toTodoList } from "@/lib/opencode";
import type { OpenCodeEvent, QuestionRequest, TodoInfo } from "@/lib/opencode";
import type { ActivePrompt } from "@/hooks/useRunLifecycle";

export interface EventStreamRefs {
  activeAssistantMessageIDs: MutableRefObject<Set<string>>;
  activePrompt: MutableRefObject<ActivePrompt | undefined>;
  activePromptHasActivity: MutableRefObject<boolean>;
  cancelledPromptIDs: MutableRefObject<Set<string>>;
  refreshTimer: MutableRefObject<number | undefined>;
  seenEventIDs: MutableRefObject<Set<string>>;
  selectedSessionIDRef: MutableRefObject<string>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}

interface UseOpenCodeEventStreamOptions {
  applyIdeaTheme: (theme: IdeaTheme) => void;
  enqueueOpenCodeEvent: (event: OpenCodeEvent) => void;
  finishRun: (sessionID: string, generation: number, failureReason?: string) => Promise<void> | void;
  flushOpenCodeEvents: () => void;
  loadPending: (sessionID: string) => Promise<unknown>;
  loadTodos: (sessionID: string, directory?: string) => Promise<unknown>;
  projectPath?: string;
  refs: EventStreamRefs;
  scheduleRefresh: (includeMessages?: boolean) => void;
  setConnected: Dispatch<SetStateAction<boolean | null>>;
  setContexts: Dispatch<SetStateAction<ContextChipData[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setQuestions: Dispatch<SetStateAction<QuestionRequest[]>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setStreamingAssistantID: Dispatch<SetStateAction<string | undefined>>;
  setTodos: Dispatch<SetStateAction<TodoInfo[]>>;
  syncQuestionAnswers: (requests: QuestionRequest[]) => void;
}

/**
 * Bridges the OpenCode SSE stream and the IDEA event stream into React state.
 * Extracted from App so the orchestrating component stays readable.
 */
export function useOpenCodeEventStream({
  applyIdeaTheme,
  enqueueOpenCodeEvent,
  finishRun,
  flushOpenCodeEvents,
  loadPending,
  loadTodos,
  projectPath,
  refs,
  scheduleRefresh,
  setConnected,
  setContexts,
  setError,
  setQuestions,
  setRunStatus,
  setStreamingAssistantID,
  setTodos,
  syncQuestionAnswers,
}: UseOpenCodeEventStreamOptions) {
  const {
    activeAssistantMessageIDs,
    activePrompt,
    activePromptHasActivity,
    cancelledPromptIDs,
    refreshTimer,
    seenEventIDs,
    selectedSessionIDRef,
    suppressedStreamingSessionIDs,
  } = refs;

  useEffect(() => {
    if (!projectPath) return;
    const unsubscribeOpenCode = subscribeOpenCodeEvents(
      projectPath,
      (event) => {
        if (event.id) {
          if (seenEventIDs.current.has(event.id)) return;
          seenEventIDs.current.add(event.id);
          if (seenEventIDs.current.size > 4000) seenEventIDs.current.clear();
        }
        const type = normalizeEventType(event.type);
        const currentPrompt = activePrompt.current;
        const sourceSessionID = eventSessionID(event);
        const isCurrentSession = sourceSessionID === selectedSessionIDRef.current
          || (!sourceSessionID && type === "session.status" && currentPrompt?.sessionID === selectedSessionIDRef.current);
        const eventID = eventMessageID(event);
        const assistantParentID = eventAssistantParentID(event);
        const assistantEventID = typeof event.properties?.assistantMessageID === "string"
          ? event.properties.assistantMessageID
          : undefined;
        const status = event.properties?.status;
        const statusType = Boolean(status) && typeof status === "object" ? (status as { type?: string }).type : undefined;
        // OpenCode can briefly report idle between a completed tool and the
        // next assistant step. Treating that transition as the end of the run
        // remounts the whole process panel and causes a visible collapse/flash.
        // Explicit execution events finish immediately; status polling already
        // requires consecutive idle checks for servers that only expose status.
        const finished = isFinishedEvent(type);
        if (isCurrentSession) {
          const suppressed = suppressedStreamingSessionIDs.current.has(sourceSessionID ?? "");
          if (currentPrompt && assistantEventID && isAssistantStreamEvent(type)) {
            activeAssistantMessageIDs.current.add(assistantEventID);
            setStreamingAssistantID(assistantEventID);
          }
          if (type === "message.updated" && assistantParentID === currentPrompt?.messageID && eventID) {
            activeAssistantMessageIDs.current.add(eventID);
            setStreamingAssistantID(eventID);
          }
          const belongsToCurrentPrompt = !currentPrompt || !eventID
            ? true
            : eventID === currentPrompt.messageID
              || activeAssistantMessageIDs.current.has(eventID)
              || assistantParentID === currentPrompt.messageID;
          const isCancelledPromptEvent = Boolean(eventID && cancelledPromptIDs.current.has(eventID));
          const isAssistantActivity = Boolean(
            currentPrompt && eventID && (
              activeAssistantMessageIDs.current.has(eventID) ||
              assistantParentID === currentPrompt.messageID
            )
          );
          if (belongsToCurrentPrompt && !isCancelledPromptEvent && isAssistantActivity) {
            activePromptHasActivity.current = true;
          }
          if (belongsToCurrentPrompt && !isCancelledPromptEvent && !(suppressed && isStreamEvent(type))) {
            enqueueOpenCodeEvent(event);
          }
          if (currentPrompt && belongsToCurrentPrompt && !isCancelledPromptEvent && isStreamEvent(type) && !suppressed) {
            setRunStatus("streaming");
          }
          if (currentPrompt && type === "session.status" && statusType === "busy" && !suppressed) {
            setRunStatus("streaming");
          }
          if (finished) {
            flushOpenCodeEvents();
            const failed = type === "session.error" || type === "session.execution.failed";
            const failureReason = failed ? errorMessage(event.properties) : undefined;
            if (failureReason) setError(failureReason);
            if (currentPrompt && (activePromptHasActivity.current || failed)) {
              void finishRun(sourceSessionID ?? selectedSessionIDRef.current, currentPrompt.generation, failureReason);
            }
          }
        }
        if (type === "todo.updated" && sourceSessionID === selectedSessionIDRef.current) {
          const nextTodos = toTodoList(event.properties);
          if (Array.isArray(event.properties?.todos)) setTodos(nextTodos);
          else void loadTodos(selectedSessionIDRef.current, projectPath);
        }
        if (type === "question.asked") {
          const request = toQuestionRequest(event.properties);
          if (request) {
            setQuestions((current) => [...current.filter((item) => item.id !== request.id), request]);
            syncQuestionAnswers([request]);
          } else void loadPending(selectedSessionIDRef.current);
        } else if (
          type === "permission.asked"
          || type === "permission.replied"
          || type === "permission.v2.asked"
          || type === "permission.v2.replied"
          || type === "question.replied"
          || type === "question.rejected"
        ) {
          void loadPending(sourceSessionID ?? selectedSessionIDRef.current);
        }
        if (type === "session.created" || type === "session.deleted" || type === "session.renamed") {
          scheduleRefresh();
        }
        if (isCurrentSession && (finished || eventChangesFiles(event))) {
          void ideaApi.reloadFileSystem().catch(() => undefined);
        }
        setConnected(true);
      },
      () => setConnected(false)
    );
    const unsubscribeIdea = subscribeIdeaEvents(
      (event) => setContexts((current) => [
        ...current.filter((item) => item.id !== event.id),
        { ...event, addedAt: Date.now() },
      ]),
      applyIdeaTheme
    );
    return () => {
      unsubscribeOpenCode();
      unsubscribeIdea();
      if (refreshTimer.current !== undefined) window.clearTimeout(refreshTimer.current);
    };
  }, [
    activeAssistantMessageIDs,
    activePrompt,
    activePromptHasActivity,
    applyIdeaTheme,
    cancelledPromptIDs,
    enqueueOpenCodeEvent,
    finishRun,
    flushOpenCodeEvents,
    loadPending,
    loadTodos,
    projectPath,
    refreshTimer,
    scheduleRefresh,
    seenEventIDs,
    selectedSessionIDRef,
    setConnected,
    setContexts,
    setError,
    setQuestions,
    setRunStatus,
    setStreamingAssistantID,
    setTodos,
    suppressedStreamingSessionIDs,
    syncQuestionAnswers,
  ]);
}
