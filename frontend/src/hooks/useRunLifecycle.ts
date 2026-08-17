import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { reconcileSessionMessages } from "@/components/assistant/liveEvents";
import { appendRunFailure, defaultEmptyRunError, hasRunOutput } from "@/components/assistant/runFailure";
import { errorMessage } from "@/components/assistant/shared";
import type { SessionRuntimeController } from "@/hooks/useSessionRuntime";
import { openCodeApi } from "@/lib/opencode";
import type { SessionMessage } from "@/lib/opencode";

interface RunLifecycleRefs {
  cancelledPromptIDs: MutableRefObject<Set<string>>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}

interface UseRunLifecycleInput {
  onRunSettled?: (sessionID: string) => void;
  projectPath?: string;
  refs: RunLifecycleRefs;
  runtime: SessionRuntimeController;
  selectedSessionID: string;
  setError: Dispatch<SetStateAction<string>>;
}

interface StatusPoll {
  timer?: number;
  token: number;
}

export function useRunLifecycle({
  onRunSettled,
  projectPath,
  refs,
  runtime,
  selectedSessionID,
  setError,
}: UseRunLifecycleInput) {
  const statusPolls = useRef(new Map<string, StatusPoll>());
  const finishingRuns = useRef(new Set<string>());
  const stoppingRuns = useRef(new Set<string>());

  const clearStatusPolling = useCallback((sessionID?: string) => {
    const sessionIDs = sessionID ? [sessionID] : [...statusPolls.current.keys()];
    sessionIDs.forEach((targetSessionID) => {
      const poll = statusPolls.current.get(targetSessionID);
      if (poll?.timer !== undefined) window.clearTimeout(poll.timer);
      if (poll) poll.token += 1;
      statusPolls.current.delete(targetSessionID);
    });
  }, []);

  useEffect(() => () => clearStatusPolling(), [clearStatusPolling]);

  const finishRun = useCallback(async (sessionID: string, generation?: number, failureReason?: string) => {
    const state = runtime.get(sessionID);
    const currentPrompt = state.activePrompt;
    if (generation !== undefined && currentPrompt && currentPrompt.generation !== generation) return;
    if (!currentPrompt || finishingRuns.current.has(sessionID)) return;
    finishingRuns.current.add(sessionID);
    clearStatusPolling(sessionID);
    try {
      let incoming = await openCodeApi.getMessages(sessionID, projectPath);
      for (let attempt = 0; !currentPrompt.allowEmptyOutput && attempt < 24; attempt += 1) {
        const runAssistants = incoming.filter((message): message is Extract<SessionMessage, { type: "assistant" }> =>
          message.type === "assistant" && message.time.created >= currentPrompt.startedAt
        );
        const settled = runAssistants.length > 0 && runAssistants.every((message) =>
          Boolean(message.time.completed || message.finish || message.error)
        );
        if (settled) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (runtime.get(sessionID).activePrompt?.generation !== currentPrompt.generation) return;
        incoming = await openCodeApi.getMessages(sessionID, projectPath);
      }
      const hasOutput = hasRunOutput(incoming, currentPrompt);
      const reason = failureReason || defaultEmptyRunError();
      const finalMessages = hasOutput || currentPrompt.allowEmptyOutput
        ? incoming
        : appendRunFailure(incoming, currentPrompt, reason);
      runtime.setMessages(sessionID, (messages) => reconcileSessionMessages(messages, finalMessages));
      if (!hasOutput && !currentPrompt.allowEmptyOutput && runtime.refs.selectedSessionID.current === sessionID) {
        setError(reason);
      }
    } catch {
      // Live events already contain the result; reconciliation is a durable fallback.
    } finally {
      const latest = runtime.get(sessionID);
      const ownsPrompt = latest.activePrompt?.generation === currentPrompt.generation;
      if (ownsPrompt) {
        latest.activePrompt = undefined;
        latest.hasActivity = false;
        latest.assistantMessageIDs.clear();
      }
      refs.suppressedStreamingSessionIDs.current.delete(sessionID);
      finishingRuns.current.delete(sessionID);
      if (ownsPrompt || latest.activePrompt === undefined) {
        runtime.setStreamingAssistantID(sessionID, undefined);
        runtime.setRunStatus(sessionID, "ready");
      }
      if (ownsPrompt) onRunSettled?.(sessionID);
    }
  }, [clearStatusPolling, onRunSettled, projectPath, refs.suppressedStreamingSessionIDs, runtime, setError]);

  const pollSessionStatus = useCallback((sessionID: string, generation: number) => {
    clearStatusPolling(sessionID);
    const poll: StatusPoll = { token: Date.now() + Math.random() };
    statusPolls.current.set(sessionID, poll);
    const token = poll.token;
    const startedAt = Date.now();
    let consecutiveIdleChecks = 0;

    const check = async () => {
      const activePoll = statusPolls.current.get(sessionID);
      if (!activePoll || activePoll.token !== token) return;
      const state = runtime.get(sessionID);
      const prompt = state.activePrompt;
      if (!prompt || prompt.generation !== generation) return;
      try {
        const status = await openCodeApi.getSessionStatus(sessionID, projectPath);
        consecutiveIdleChecks = status.type === "busy" ? 0 : consecutiveIdleChecks + 1;
        const timedOutWithoutEvents = !state.hasActivity && Date.now() - startedAt >= 5000;
        if (consecutiveIdleChecks >= 3 && (state.hasActivity || timedOutWithoutEvents)) {
          await finishRun(sessionID, generation);
          return;
        }
      } catch {
        // Keep polling while SSE remains the primary transport.
      }
      const latestPoll = statusPolls.current.get(sessionID);
      if (latestPoll?.token === token) {
        latestPoll.timer = window.setTimeout(() => void check(), 300);
      }
    };

    poll.timer = window.setTimeout(() => void check(), 250);
  }, [clearStatusPolling, finishRun, projectPath, runtime]);

  const handleStop = useCallback(async () => {
    if (!selectedSessionID || !projectPath || stoppingRuns.current.has(selectedSessionID)) return;
    stoppingRuns.current.add(selectedSessionID);
    const state = runtime.get(selectedSessionID);
    const prompt = state.activePrompt;
    if (prompt?.messageID) refs.cancelledPromptIDs.current.add(prompt.messageID);
    state.assistantMessageIDs.forEach((messageID) => refs.cancelledPromptIDs.current.add(messageID));
    refs.suppressedStreamingSessionIDs.current.add(selectedSessionID);
    state.activePrompt = undefined;
    state.queuePaused = true;
    state.assistantMessageIDs.clear();
    state.hasActivity = false;
    runtime.setStreamingAssistantID(selectedSessionID, undefined);
    clearStatusPolling(selectedSessionID);
    runtime.setRunStatus(selectedSessionID, "submitted");
    try {
      await openCodeApi.interrupt(selectedSessionID, projectPath);
      let consecutiveIdleChecks = 0;
      for (let attempt = 0; attempt < 48; attempt += 1) {
        const status = await openCodeApi.getSessionStatus(selectedSessionID, projectPath);
        consecutiveIdleChecks = status.type === "idle" ? consecutiveIdleChecks + 1 : 0;
        if (consecutiveIdleChecks >= 3) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      const incoming = await openCodeApi.getMessages(selectedSessionID, projectPath);
      runtime.setMessages(selectedSessionID, (messages) => reconcileSessionMessages(messages, incoming));
      refs.suppressedStreamingSessionIDs.current.delete(selectedSessionID);
      runtime.setRunStatus(selectedSessionID, "ready");
    } catch (interruptError) {
      refs.suppressedStreamingSessionIDs.current.delete(selectedSessionID);
      runtime.setRunStatus(selectedSessionID, "ready");
      if (runtime.refs.selectedSessionID.current === selectedSessionID) setError(errorMessage(interruptError));
    } finally {
      stoppingRuns.current.delete(selectedSessionID);
    }
  }, [clearStatusPolling, projectPath, refs, runtime, selectedSessionID, setError]);

  return { clearStatusPolling, finishRun, handleStop, pollSessionStatus };
}
