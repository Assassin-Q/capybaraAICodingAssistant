import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { errorMessage } from "@/components/assistant/shared";
import type { RunStatus } from "@/components/assistant/shared";
import { reconcileSessionMessages } from "@/components/assistant/liveEvents";
import { openCodeApi } from "@/lib/opencode";
import type { SessionMessage } from "@/lib/opencode";

export interface ActivePrompt {
  fingerprint: string;
  generation: number;
  messageID: string;
  sessionID: string;
  startedAt: number;
}

interface RunLifecycleRefs {
  activeAssistantMessageIDs: MutableRefObject<Set<string>>;
  activePrompt: MutableRefObject<ActivePrompt | undefined>;
  activePromptHasActivity: MutableRefObject<boolean>;
  cancelledPromptIDs: MutableRefObject<Set<string>>;
  promptGeneration: MutableRefObject<number>;
  queueDrainPaused: MutableRefObject<boolean>;
  selectedSessionIDRef: MutableRefObject<string>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}

interface UseRunLifecycleInput {
  projectPath?: string;
  refs: RunLifecycleRefs;
  selectedSessionID: string;
  setError: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<SessionMessage[]>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setStreamingAssistantID: Dispatch<SetStateAction<string | undefined>>;
}

export function useRunLifecycle({
  projectPath,
  refs,
  selectedSessionID,
  setError,
  setMessages,
  setRunStatus,
  setStreamingAssistantID,
}: UseRunLifecycleInput) {
  const statusPollTimer = useRef<number>();
  const statusPollToken = useRef(0);
  const finishingRun = useRef(false);
  const stopInFlight = useRef(false);

  const clearStatusPolling = useCallback(() => {
    statusPollToken.current += 1;
    if (statusPollTimer.current !== undefined) {
      window.clearTimeout(statusPollTimer.current);
      statusPollTimer.current = undefined;
    }
  }, []);

  useEffect(() => () => clearStatusPolling(), [clearStatusPolling]);

  const finishRun = useCallback(async (sessionID: string, generation?: number) => {
    if (refs.selectedSessionIDRef.current !== sessionID) return;
    const currentPrompt = refs.activePrompt.current;
    if (generation !== undefined && currentPrompt && currentPrompt.generation !== generation) return;
    if (!currentPrompt || finishingRun.current) return;
    finishingRun.current = true;
    clearStatusPolling();
    try {
      let incoming = await openCodeApi.getMessages(sessionID, projectPath);
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const runAssistants = incoming.filter((message): message is Extract<SessionMessage, { type: "assistant" }> =>
          message.type === "assistant" && message.time.created >= currentPrompt.startedAt
        );
        const hasSettledAssistant = runAssistants.length > 0 && runAssistants.every((message) =>
          Boolean(message.time.completed || message.finish || message.error)
        );
        if (hasSettledAssistant) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (refs.selectedSessionIDRef.current !== sessionID) return;
        incoming = await openCodeApi.getMessages(sessionID, projectPath);
      }
      if (refs.selectedSessionIDRef.current === sessionID) {
        setMessages((current) => reconcileSessionMessages(current, incoming));
      }
    } catch {
      // The live reducer already rendered the final event. Reconciliation is a fallback.
    } finally {
      const activeGeneration = refs.activePrompt.current?.generation;
      const ownsActivePrompt = activeGeneration === currentPrompt.generation;
      const stillSelected = refs.selectedSessionIDRef.current === sessionID;
      if (ownsActivePrompt) {
        refs.activePrompt.current = undefined;
        refs.activePromptHasActivity.current = false;
        refs.activeAssistantMessageIDs.current.clear();
      }
      refs.suppressedStreamingSessionIDs.current.delete(sessionID);
      finishingRun.current = false;
      if (stillSelected && (ownsActivePrompt || activeGeneration === undefined)) {
        setStreamingAssistantID(undefined);
        setRunStatus("ready");
      }
    }
  }, [clearStatusPolling, projectPath, refs, setMessages, setRunStatus, setStreamingAssistantID]);

  const pollSessionStatus = useCallback((sessionID: string, generation: number) => {
    clearStatusPolling();
    const token = statusPollToken.current;
    const startedAt = Date.now();
    let consecutiveIdleChecks = 0;

    const check = async () => {
      if (token !== statusPollToken.current) return;
      const currentPrompt = refs.activePrompt.current;
      if (!currentPrompt || currentPrompt.sessionID !== sessionID || currentPrompt.generation !== generation) return;

      try {
        const status = await openCodeApi.getSessionStatus(sessionID, projectPath);
        if (status.type === "busy") {
          consecutiveIdleChecks = 0;
        } else {
          consecutiveIdleChecks += 1;
        }
        const elapsed = Date.now() - startedAt;
        // `session.active` can still report the interrupted loop for a few
        // cycles. Only assistant events belonging to this prompt are valid
        // evidence for finishing it; otherwise the old loop can consume the
        // next prompt and clear the new run too early.
        const hasRunEvidence = refs.activePromptHasActivity.current;
        const idleWithoutEventsTimedOut = !hasRunEvidence && elapsed >= 5000;
        if (consecutiveIdleChecks >= 3 && (hasRunEvidence || idleWithoutEventsTimedOut)) {
          await finishRun(sessionID, generation);
          return;
        }
      } catch {
        // Keep polling while the SSE connection remains available.
      }
      if (token === statusPollToken.current) {
        statusPollTimer.current = window.setTimeout(() => void check(), 300);
      }
    };

    statusPollTimer.current = window.setTimeout(() => void check(), 250);
  }, [clearStatusPolling, finishRun, projectPath, refs, setMessages, setRunStatus, setStreamingAssistantID]);

  const handleStop = useCallback(async () => {
    if (!selectedSessionID || !projectPath || stopInFlight.current) return;
    stopInFlight.current = true;
    const stoppedSessionID = selectedSessionID;
    const prompt = refs.activePrompt.current;
    if (prompt?.messageID) refs.cancelledPromptIDs.current.add(prompt.messageID);
    refs.activeAssistantMessageIDs.current.forEach((messageID) => refs.cancelledPromptIDs.current.add(messageID));
    refs.suppressedStreamingSessionIDs.current.add(stoppedSessionID);
    refs.activePrompt.current = undefined;
    refs.queueDrainPaused.current = true;
    refs.activeAssistantMessageIDs.current.clear();
    refs.activePromptHasActivity.current = false;
    setStreamingAssistantID(undefined);
    clearStatusPolling();
    setRunStatus("submitted");
    try {
      await openCodeApi.interrupt(stoppedSessionID, projectPath);
      let waitFailed = false;
      try {
        // V2 exposes a server-side wait primitive. It prevents the UI from
        // accepting a new queued prompt while the interrupted loop is still
        // unwinding, which active-session polling cannot guarantee.
        await openCodeApi.waitForSession(stoppedSessionID, projectPath);
      } catch {
        waitFailed = true;
      }
      if (waitFailed) {
        let consecutiveIdleChecks = 0;
        for (let attempt = 0; attempt < 48; attempt += 1) {
          const status = await openCodeApi.getSessionStatus(stoppedSessionID, projectPath);
          consecutiveIdleChecks = status.type === "idle" ? consecutiveIdleChecks + 1 : 0;
          if (consecutiveIdleChecks >= 3) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }
      const incoming = await openCodeApi.getMessages(stoppedSessionID, projectPath);
      if (refs.selectedSessionIDRef.current === stoppedSessionID) {
        setMessages((current) => reconcileSessionMessages(current, incoming));
      }
      refs.suppressedStreamingSessionIDs.current.delete(stoppedSessionID);
      if (refs.selectedSessionIDRef.current === stoppedSessionID) setRunStatus("ready");
    } catch (interruptError) {
      refs.suppressedStreamingSessionIDs.current.delete(stoppedSessionID);
      if (refs.selectedSessionIDRef.current === stoppedSessionID) setRunStatus("ready");
      setError(errorMessage(interruptError));
    } finally {
      stopInFlight.current = false;
    }
  }, [clearStatusPolling, projectPath, refs, selectedSessionID, setError, setMessages, setRunStatus, setStreamingAssistantID]);

  return { clearStatusPolling, finishRun, handleStop, pollSessionStatus };
}
