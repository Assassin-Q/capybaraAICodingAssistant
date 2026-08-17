import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { SetStateAction } from "react";

import type { QueuedPrompt } from "@/components/assistant/PromptQueue";

interface SessionPromptQueue {
  editing?: QueuedPrompt;
  items: QueuedPrompt[];
}

const emptyQueue = (): SessionPromptQueue => ({ items: [] });

const resolve = <T,>(current: T, action: SetStateAction<T>): T =>
  typeof action === "function" ? (action as (value: T) => T)(current) : action;

/** Keeps pending prompts isolated by session while drafts remain isolated by their temporary tab. */
export function useSessionPromptQueues(activeQueueID: string, retainedQueueIDs: string[]) {
  const queues = useRef(new Map<string, SessionPromptQueue>());
  const draining = useRef(new Set<string>());
  const [, render] = useReducer((value: number) => value + 1, 0);

  const get = useCallback((tabID: string) => {
    const existing = queues.current.get(tabID);
    if (existing) return existing;
    const created = emptyQueue();
    queues.current.set(tabID, created);
    return created;
  }, []);

  const update = useCallback((tabID: string, updater: (current: SessionPromptQueue) => SessionPromptQueue) => {
    if (!tabID) return;
    queues.current.set(tabID, updater(get(tabID)));
    if (tabID === activeQueueID) render();
  }, [activeQueueID, get]);

  const setItems = useCallback((action: SetStateAction<QueuedPrompt[]>) => {
    update(activeQueueID, (current) => ({ ...current, items: resolve(current.items, action) }));
  }, [activeQueueID, update]);

  const setItemsFor = useCallback((queueID: string, action: SetStateAction<QueuedPrompt[]>) => {
    update(queueID, (current) => ({ ...current, items: resolve(current.items, action) }));
  }, [update]);

  const setEditing = useCallback((action: SetStateAction<QueuedPrompt | undefined>) => {
    update(activeQueueID, (current) => ({ ...current, editing: resolve(current.editing, action) }));
  }, [activeQueueID, update]);

  const isDraining = useCallback((tabID: string) => draining.current.has(tabID), []);
  const setDraining = useCallback((tabID: string, value: boolean) => {
    if (value) draining.current.add(tabID);
    else draining.current.delete(tabID);
  }, []);

  useEffect(() => {
    const valid = new Set(retainedQueueIDs);
    queues.current.forEach((_, tabID) => {
      if (!valid.has(tabID) && tabID.startsWith("draft:")) queues.current.delete(tabID);
    });
    draining.current.forEach((tabID) => {
      if (!valid.has(tabID)) draining.current.delete(tabID);
    });
  }, [retainedQueueIDs]);

  const current = activeQueueID ? get(activeQueueID) : emptyQueue();
  return useMemo(() => ({
    editing: current.editing,
    getItems: (queueID: string) => get(queueID).items,
    isDraining,
    items: current.items,
    setDraining,
    setEditing,
    setItems,
    setItemsFor,
  }), [current.editing, current.items, get, isDraining, setDraining, setEditing, setItems, setItemsFor]);
}
