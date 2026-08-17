import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ContextChip } from "@/components/assistant/shared";

interface ComposerDraft {
  command?: string;
  contexts: ContextChip[];
  text: string;
}

const emptyDraft = (): ComposerDraft => ({ contexts: [], text: "" });

/** Keeps unsent composer state isolated while the user moves between conversation tabs. */
export function useSessionComposerDrafts(activeTabID: string, openTabIDs: string[]) {
  const [text, setTextState] = useState("");
  const [contexts, setContextsState] = useState<ContextChip[]>([]);
  const [command, setCommandState] = useState<string>();
  const drafts = useRef(new Map<string, ComposerDraft>());
  const previousTabID = useRef(activeTabID);
  const current = useRef<ComposerDraft>(emptyDraft());

  const setTextForTab = useCallback((tabID: string, action: SetStateAction<string>) => {
    const draft = tabID === previousTabID.current
      ? current.current
      : drafts.current.get(tabID) ?? emptyDraft();
    const text = typeof action === "function" ? action(draft.text) : action;
    const next = { ...draft, text };
    drafts.current.set(tabID, next);
    if (tabID === previousTabID.current) {
      current.current = next;
      setTextState(text);
    }
  }, []);

  const setContextsForTab = useCallback((tabID: string, action: SetStateAction<ContextChip[]>) => {
    const draft = tabID === previousTabID.current
      ? current.current
      : drafts.current.get(tabID) ?? emptyDraft();
    const contexts = typeof action === "function" ? action(draft.contexts) : action;
    const next = { ...draft, contexts };
    drafts.current.set(tabID, next);
    if (tabID === previousTabID.current) {
      current.current = next;
      setContextsState(contexts);
    }
  }, []);

  const setCommandForTab = useCallback((tabID: string, action: SetStateAction<string | undefined>) => {
    const draft = tabID === previousTabID.current
      ? current.current
      : drafts.current.get(tabID) ?? emptyDraft();
    const command = typeof action === "function" ? action(draft.command) : action;
    const next = { ...draft, command };
    drafts.current.set(tabID, next);
    if (tabID === previousTabID.current) {
      current.current = next;
      setCommandState(command);
    }
  }, []);

  const setText: Dispatch<SetStateAction<string>> = useCallback(
    (action) => setTextForTab(activeTabID, action),
    [activeTabID, setTextForTab]
  );
  const setContexts: Dispatch<SetStateAction<ContextChip[]>> = useCallback(
    (action) => setContextsForTab(activeTabID, action),
    [activeTabID, setContextsForTab]
  );
  const setCommand: Dispatch<SetStateAction<string | undefined>> = useCallback(
    (action) => setCommandForTab(activeTabID, action),
    [activeTabID, setCommandForTab]
  );

  useLayoutEffect(() => {
    if (!activeTabID || activeTabID === previousTabID.current) return;
    if (previousTabID.current) drafts.current.set(previousTabID.current, current.current);
    const next = drafts.current.get(activeTabID) ?? emptyDraft();
    current.current = next;
    previousTabID.current = activeTabID;
    setTextState(next.text);
    setContextsState(next.contexts);
    setCommandState(next.command);
  }, [activeTabID]);

  useEffect(() => {
    const valid = new Set(openTabIDs);
    drafts.current.forEach((_, tabID) => {
      if (!valid.has(tabID) && tabID.startsWith("draft:")) drafts.current.delete(tabID);
    });
  }, [openTabIDs]);

  const clearTab = useCallback((tabID: string) => {
    drafts.current.set(tabID, emptyDraft());
    if (tabID !== previousTabID.current) return;
    const next = emptyDraft();
    current.current = next;
    setTextState("");
    setContextsState([]);
    setCommandState(undefined);
  }, []);

  return { clearTab, command, contexts, setCommand, setContexts, setText, text };
}
