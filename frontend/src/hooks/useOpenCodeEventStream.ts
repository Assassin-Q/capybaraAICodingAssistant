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
import type { ContextChip as ContextChipData } from "@/components/assistant/shared";
import type { IdeaTheme } from "@/hooks/useIdeaTheme";
import { findRuntimeSession, type SessionRuntimeController } from "@/hooks/useSessionRuntime";
import { ideaApi, subscribeIdeaEvents, type IdeContextEvent, type PanelAction } from "@/lib/idea";
import { subscribeOpenCodeEvents, toQuestionRequest, toTodoList } from "@/lib/opencode";
import type { OpenCodeEvent, QuestionRequest } from "@/lib/opencode";

export interface EventStreamRefs {
  cancelledPromptIDs: MutableRefObject<Set<string>>;
  refreshTimer: MutableRefObject<number | undefined>;
  seenEventIDs: MutableRefObject<Set<string>>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}

interface UseOpenCodeEventStreamOptions {
  applyIdeaTheme: (theme: IdeaTheme) => void;
  enqueueOpenCodeEvent: (sessionID: string, event: OpenCodeEvent) => void;
  finishRun: (sessionID: string, generation: number, failureReason?: string) => Promise<void> | void;
  flushOpenCodeEvents: (sessionID?: string) => void;
  loadPending: (sessionID: string) => Promise<unknown>;
  loadTodos: (sessionID: string, directory?: string) => Promise<unknown>;
  onIdeaContext?: (event: IdeContextEvent) => void;
  onPanelAction: (action: PanelAction) => void;
  onPendingApprovals: (sessionIDs: string[]) => void;
  projectPath?: string;
  refs: EventStreamRefs;
  runtime: SessionRuntimeController;
  scheduleRefresh: (includeMessages?: boolean) => void;
  setConnected: Dispatch<SetStateAction<boolean | null>>;
  setContexts: Dispatch<SetStateAction<ContextChipData[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setQuestions: Dispatch<SetStateAction<QuestionRequest[]>>;
  syncQuestionAnswers: (requests: QuestionRequest[]) => void;
}

/** Routes every OpenCode event to its owning tab, including tabs that are currently hidden. */
export function useOpenCodeEventStream({
  applyIdeaTheme,
  enqueueOpenCodeEvent,
  finishRun,
  flushOpenCodeEvents,
  loadPending,
  loadTodos,
  onIdeaContext,
  onPanelAction,
  onPendingApprovals,
  projectPath,
  refs,
  runtime,
  scheduleRefresh,
  setConnected,
  setContexts,
  setError,
  setQuestions,
  syncQuestionAnswers,
}: UseOpenCodeEventStreamOptions) {
  useEffect(() => {
    if (!projectPath) return;
    const unsubscribeOpenCode = subscribeOpenCodeEvents(
      projectPath,
      (event) => {
        if (event.id) {
          if (refs.seenEventIDs.current.has(event.id)) return;
          refs.seenEventIDs.current.add(event.id);
          if (refs.seenEventIDs.current.size > 4000) {
            const oldest = refs.seenEventIDs.current.values();
            for (let index = 0; index < 1000; index += 1) {
              const entry = oldest.next();
              if (entry.done) break;
              refs.seenEventIDs.current.delete(entry.value);
            }
          }
        }
        const type = normalizeEventType(event.type);
        const eventID = eventMessageID(event);
        const assistantParentID = eventAssistantParentID(event);
        const assistantEventID = typeof event.properties?.assistantMessageID === "string"
          ? event.properties.assistantMessageID
          : undefined;
        const sourceSessionID = eventSessionID(event)
          ?? findRuntimeSession(runtime.refs, eventID, assistantParentID, assistantEventID);
        const state = sourceSessionID ? runtime.get(sourceSessionID) : undefined;
        const currentPrompt = state?.activePrompt;
        const properties = event.properties ?? event.data ?? {};
        const status = properties.status;
        const statusType = status && typeof status === "object"
          ? (status as { type?: string }).type
          : undefined;
        const part = properties.part;
        const partType = part && typeof part === "object" ? (part as { type?: string }).type : undefined;
        const compactionStarted = type === "session.next.compaction.started"
          || type === "session.next.compaction.delta"
          || (type === "message.part.updated" && partType === "compaction");
        const compactionEnded = type === "session.next.compaction.ended";
        if (sourceSessionID && compactionStarted) runtime.setCompacting(sourceSessionID, true);
        if (sourceSessionID && compactionEnded) runtime.setCompacting(sourceSessionID, false);

        const finished = isFinishedEvent(type);
        if (sourceSessionID && state) {
          const suppressed = refs.suppressedStreamingSessionIDs.current.has(sourceSessionID);
          if (currentPrompt && assistantEventID && isAssistantStreamEvent(type)) {
            state.assistantMessageIDs.add(assistantEventID);
            runtime.setStreamingAssistantID(sourceSessionID, assistantEventID);
          }
          if (type === "message.updated" && assistantParentID === currentPrompt?.messageID && eventID) {
            state.assistantMessageIDs.add(eventID);
            runtime.setStreamingAssistantID(sourceSessionID, eventID);
          }
          const belongsToPrompt = !currentPrompt || !eventID
            ? true
            : eventID === currentPrompt.messageID
              || state.assistantMessageIDs.has(eventID)
              || assistantParentID === currentPrompt.messageID;
          const cancelled = Boolean(eventID && refs.cancelledPromptIDs.current.has(eventID));
          const assistantActivity = Boolean(currentPrompt && eventID && (
            state.assistantMessageIDs.has(eventID) || assistantParentID === currentPrompt.messageID
          ));
          if (belongsToPrompt && !cancelled && assistantActivity) state.hasActivity = true;
          if (belongsToPrompt && !cancelled && !(suppressed && isStreamEvent(type))) {
            enqueueOpenCodeEvent(sourceSessionID, event);
          }
          if (currentPrompt && belongsToPrompt && !cancelled && isStreamEvent(type) && !suppressed) {
            runtime.setRunStatus(sourceSessionID, "streaming");
          }
          if (currentPrompt && type === "session.status" && statusType === "busy" && !suppressed) {
            runtime.setRunStatus(sourceSessionID, "streaming");
          }
          if (finished) {
            flushOpenCodeEvents(sourceSessionID);
            const failed = type === "session.error" || type === "session.execution.failed";
            const failureReason = failed ? errorMessage(event.properties) : undefined;
            if (failureReason && runtime.refs.selectedSessionID.current === sourceSessionID) {
              setError(failureReason);
            }
            if (currentPrompt && (state.hasActivity || failed)) {
              void finishRun(sourceSessionID, currentPrompt.generation, failureReason);
            }
          }
        }

        if (type === "todo.updated" && sourceSessionID) {
          const nextTodos = toTodoList(event.properties);
          if (Array.isArray(event.properties?.todos)) runtime.setTodos(sourceSessionID, nextTodos);
          else void loadTodos(sourceSessionID, projectPath);
        }
        if (type === "question.asked") {
          const request = toQuestionRequest(event.properties);
          if (request) {
            setQuestions((current) => [...current.filter((item) => item.id !== request.id), request]);
            syncQuestionAnswers([request]);
          } else if (sourceSessionID) void loadPending(sourceSessionID);
        } else if ([
          "permission.asked",
          "permission.replied",
          "permission.v2.asked",
          "permission.v2.replied",
          "question.replied",
          "question.rejected",
        ].includes(type) && sourceSessionID) {
          void loadPending(sourceSessionID);
        }
        if (type === "session.created" || type === "session.deleted" || type === "session.renamed") {
          scheduleRefresh();
        }
        if (sourceSessionID && (finished || eventChangesFiles(event))) {
          void ideaApi.reloadFileSystem().catch(() => undefined);
        }
        setConnected(true);
      },
      () => setConnected(false),
    );
    const unsubscribeIdea = subscribeIdeaEvents(
      (event) => {
        if (onIdeaContext) onIdeaContext(event);
        else setContexts((current) => [
          ...current.filter((item) => item.id !== event.id),
          { ...event, addedAt: Date.now() },
        ]);
      },
      applyIdeaTheme,
      undefined,
      onPendingApprovals,
      onPanelAction,
    );
    return () => {
      unsubscribeOpenCode();
      unsubscribeIdea();
      if (refs.refreshTimer.current !== undefined) window.clearTimeout(refs.refreshTimer.current);
    };
  }, [
    applyIdeaTheme,
    enqueueOpenCodeEvent,
    finishRun,
    flushOpenCodeEvents,
    loadPending,
    loadTodos,
    onIdeaContext,
    onPanelAction,
    onPendingApprovals,
    projectPath,
    refs,
    runtime,
    scheduleRefresh,
    setConnected,
    setContexts,
    setError,
    setQuestions,
    syncQuestionAnswers,
  ]);
}
