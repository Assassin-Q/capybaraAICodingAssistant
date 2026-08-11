import { useCallback, useEffect, useRef, useState } from "react";

import type { RunStatus } from "@/components/assistant/shared";
import type { SessionMessage } from "@/lib/opencode";

/** The user asked for five attempts, thirty seconds apart. */
export const AUTO_RETRY_MAX_ATTEMPTS = 5;
export const AUTO_RETRY_DELAY_MS = 30_000;

/**
 * Failures worth retrying on their own.
 *
 * Deliberately narrow: a dropped stream or a gateway hiccup is the same request being unlucky, so
 * repeating it is reasonable. A rejected request is not — retrying a quota error, a bad model name
 * or an incompatible thinking variant just burns five more attempts and thirty-second waits before
 * showing the user the same message. Anything not listed here surfaces immediately.
 */
const RETRYABLE = [
  /stream error/i,
  /fetch failed/i,
  /network|econnreset|econnrefused|etimedout|socket hang up/i,
  /\b(?:429|500|502|503|504)\b/,
  /timeout|timed out/i,
  /temporarily unavailable|overloaded|try again/i,
];

/**
 * Never retried, checked before the list above.
 *
 * The first group is the user stopping the run. An interrupted stream reports itself in the same
 * language as a dropped one, so without this a deliberate stop was answered with "connection
 * dropped, retrying in 30s" — the panel arguing with the button the user just pressed.
 */
const NOT_RETRYABLE = [
  /provider turn interrupted|request aborted|aborterror/i,
  /\b(?:cancell?ed|interrupted|abort(?:ed)?)\b/i,
  /insufficient_quota|exceeded your current quota|billing/i,
  /invalid[_ ]api[_ ]key|unauthorized|forbidden/i,
  /model_not_found|is not supported/i,
  /context.*maximum.*token/i,
];

export const isRetryableRunError = (error?: string): boolean => {
  const value = error?.trim();
  if (!value) return false;
  if (NOT_RETRYABLE.some((pattern) => pattern.test(value))) return false;
  return RETRYABLE.some((pattern) => pattern.test(value));
};

/** Narrows to the assistant message that carries the failure; user messages have no error field. */
const lastFailedAssistant = (messages: SessionMessage[]) =>
  [...messages].reverse().find(
    (message): message is Extract<SessionMessage, { type: "assistant" }> =>
      message.type === "assistant" && Boolean(message.error)
  );

interface UseAutoRetryInput {
  messages: SessionMessage[];
  /** Replays the failed prompt. Resolves false when there is nothing to replay. */
  onRetry: () => Promise<boolean>;
  runStatus: RunStatus;
  sessionID: string;
}

export interface AutoRetryState {
  /** Attempts already spent on the current failure. */
  attempt: number;
  /** Seconds until the next attempt, or 0 when none is scheduled. */
  secondsLeft: number;
}

/**
 * Retries a run that died on a transient failure.
 *
 * The counter is keyed on the assistant message that failed, so a fresh failure starts over rather
 * than inheriting the previous one's budget. Stopping is the user's override: [cancel] is wired to
 * the same control that interrupts a run, and once cancelled that failure is never retried again —
 * a retry the user explicitly stopped must not come back thirty seconds later.
 */
export function useAutoRetry({ messages, onRetry, runStatus, sessionID }: UseAutoRetryInput) {
  const [state, setState] = useState<AutoRetryState>({ attempt: 0, secondsLeft: 0 });
  const timer = useRef<number>();
  const tick = useRef<number>();
  const attempts = useRef(new Map<string, number>());
  const cancelled = useRef(new Set<string>());
  const retryingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    if (tick.current !== undefined) window.clearInterval(tick.current);
    timer.current = undefined;
    tick.current = undefined;
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    const failed = lastFailedAssistant(messages);
    if (failed) cancelled.current.add(failed.id);
    setState({ attempt: 0, secondsLeft: 0 });
  }, [clearTimers, messages]);

  useEffect(() => {
    clearTimers();
    attempts.current.clear();
    cancelled.current.clear();
    setState({ attempt: 0, secondsLeft: 0 });
  }, [clearTimers, sessionID]);

  useEffect(() => {
    if (runStatus !== "ready" && runStatus !== "error") return;
    if (retryingRef.current) return;

    const failed = lastFailedAssistant(messages);
    if (!failed || !isRetryableRunError(failed.error)) {
      setState({ attempt: 0, secondsLeft: 0 });
      return;
    }
    if (cancelled.current.has(failed.id)) return;

    const spent = attempts.current.get(failed.id) ?? 0;
    if (spent >= AUTO_RETRY_MAX_ATTEMPTS) return;

    const next = spent + 1;
    attempts.current.set(failed.id, next);
    setState({ attempt: next, secondsLeft: Math.round(AUTO_RETRY_DELAY_MS / 1000) });

    tick.current = window.setInterval(() => {
      setState((current) => ({ ...current, secondsLeft: Math.max(0, current.secondsLeft - 1) }));
    }, 1000);

    timer.current = window.setTimeout(() => {
      clearTimers();
      if (cancelled.current.has(failed.id)) return;
      retryingRef.current = true;
      void onRetry()
        .catch(() => false)
        .finally(() => {
          retryingRef.current = false;
          setState((current) => ({ ...current, secondsLeft: 0 }));
        });
    }, AUTO_RETRY_DELAY_MS);

    return clearTimers;
  }, [clearTimers, messages, onRetry, runStatus, sessionID]);

  useEffect(() => clearTimers, [clearTimers]);

  return { cancel, ...state };
}
