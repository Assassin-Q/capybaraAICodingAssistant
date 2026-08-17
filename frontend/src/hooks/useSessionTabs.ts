import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SessionInfo } from "@/lib/opencode";
import type { SessionTabPreferences } from "@/lib/preferences";

export interface SessionTab {
  id: string;
  kind: "session" | "draft";
  openedAt: number;
  sessionID?: string;
  /** Draft title or the last known title of a persisted session. */
  title?: string;
}

export interface PendingSessionTabOpen {
  tab: SessionTab;
}

export interface SessionTabOpenResult {
  status: "opened" | "blocked";
  tab?: SessionTab;
}

interface SessionTabState {
  activeTabID: string;
  tabs: SessionTab[];
}

interface PersistedSessionTabs {
  activeSessionID?: string;
  tabs?: Array<Pick<SessionTab, "id" | "openedAt" | "sessionID" | "title">>;
}

const emptyState = (): SessionTabState => ({ activeTabID: "", tabs: [] });
const storageKey = (projectPath: string): string => `capybara-ai:session-tabs:${projectPath}`;
const sessionTabID = (sessionID: string): string => `session:${sessionID}`;
const draftTabID = (): string => `draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

const makeDraft = (): SessionTab => ({ id: draftTabID(), kind: "draft", openedAt: Date.now() });
const makeSessionTab = (session: SessionInfo): SessionTab => ({
  id: sessionTabID(session.id),
  kind: "session",
  openedAt: Date.now(),
  sessionID: session.id,
  title: session.title,
});

const loadPersisted = (projectPath: string, sessions: SessionInfo[]): SessionTabState => {
  const byID = new Map(sessions.map((session) => [session.id, session]));
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(projectPath)) ?? "null") as PersistedSessionTabs | null;
    const seen = new Set<string>();
    const tabs = (parsed?.tabs ?? []).flatMap((stored): SessionTab[] => {
      const sessionID = typeof stored.sessionID === "string" ? stored.sessionID : "";
      const session = byID.get(sessionID);
      if (!session || seen.has(sessionID)) return [];
      seen.add(sessionID);
      return [{
        id: typeof stored.id === "string" && stored.id ? stored.id : sessionTabID(sessionID),
        kind: "session",
        openedAt: typeof stored.openedAt === "number" ? stored.openedAt : session.time.updated,
        sessionID,
        title: session.title,
      }];
    });
    if (tabs.length > 0) {
      const active = tabs.find((tab) => tab.sessionID === parsed?.activeSessionID) ?? tabs[0];
      return { activeTabID: active.id, tabs };
    }
    if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length === 0) {
      const draft = makeDraft();
      return { activeTabID: draft.id, tabs: [draft] };
    }
  } catch {
    // A malformed local preference should never keep the assistant from opening.
  }
  const first = sessions[0];
  const tab = first ? makeSessionTab(first) : makeDraft();
  return { activeTabID: tab.id, tabs: [tab] };
};

const applySettings = (state: SessionTabState, settings: SessionTabPreferences): SessionTabState => {
  if (state.tabs.length === 0) {
    const draft = makeDraft();
    return { activeTabID: draft.id, tabs: [draft] };
  }
  const active = state.tabs.find((tab) => tab.id === state.activeTabID) ?? state.tabs[0];
  if (!settings.enabled) return { activeTabID: active.id, tabs: [active] };
  if (settings.maxOpen === null || state.tabs.length <= settings.maxOpen) {
    return active.id === state.activeTabID ? state : { ...state, activeTabID: active.id };
  }
  const others = state.tabs
    .filter((tab) => tab.id !== active.id)
    .sort((left, right) => right.openedAt - left.openedAt)
    .slice(0, settings.maxOpen - 1);
  const kept = new Set([active.id, ...others.map((tab) => tab.id)]);
  return { activeTabID: active.id, tabs: state.tabs.filter((tab) => kept.has(tab.id)) };
};

export function useSessionTabs({
  projectPath,
  sessions,
  settings,
}: {
  projectPath?: string;
  sessions: SessionInfo[];
  settings: SessionTabPreferences;
}) {
  const [state, setState] = useState<SessionTabState>(emptyState);
  const [pendingOpen, setPendingOpen] = useState<PendingSessionTabOpen>();
  const stateRef = useRef(state);
  const initializedProject = useRef("");
  const sessionsRef = useRef(sessions);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => {
    if (!projectPath || initializedProject.current === projectPath) return;
    const loaded = applySettings(loadPersisted(projectPath, sessions), settings);
    initializedProject.current = projectPath;
    stateRef.current = loaded;
    setState(loaded);
    setPendingOpen(undefined);
  }, [projectPath, sessions, settings]);

  useEffect(() => {
    if (!projectPath || initializedProject.current !== projectPath) return;
    const next = applySettings(stateRef.current, settings);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
    setPendingOpen(undefined);
  }, [projectPath, settings]);

  useEffect(() => {
    if (!projectPath || initializedProject.current !== projectPath) return;
    const byID = new Map(sessions.map((session) => [session.id, session]));
    const current = stateRef.current;
    const tabs = current.tabs.flatMap((tab): SessionTab[] => {
      if (tab.kind === "draft") return [tab];
      const session = tab.sessionID ? byID.get(tab.sessionID) : undefined;
      return session ? [{ ...tab, title: session.title }] : [];
    });
    if (tabs.length === current.tabs.length && tabs.every((tab, index) => (
      tab.id === current.tabs[index].id && tab.title === current.tabs[index].title
    ))) return;
    const active = tabs.find((tab) => tab.id === current.activeTabID) ?? tabs[0];
    const nextTab = active ?? (sessions[0] ? makeSessionTab(sessions[0]) : makeDraft());
    const next = { activeTabID: nextTab.id, tabs: active ? tabs : [nextTab] };
    stateRef.current = next;
    setState(next);
  }, [projectPath, sessions]);

  useEffect(() => {
    if (!projectPath || initializedProject.current !== projectPath) return;
    const current = stateRef.current;
    const active = current.tabs.find((tab) => tab.id === current.activeTabID);
    const persisted: PersistedSessionTabs = {
      activeSessionID: active?.sessionID,
      // Empty drafts are deliberately omitted: reopening the IDE gets a fresh blank page rather
      // than a row of tabs whose unsent composer contents cannot be restored.
      tabs: current.tabs
        .filter((tab) => tab.kind === "session" && tab.sessionID)
        .map(({ id, openedAt, sessionID, title }) => ({ id, openedAt, sessionID, title })),
    };
    window.localStorage.setItem(storageKey(projectPath), JSON.stringify(persisted));
  }, [projectPath, state]);

  const commit = useCallback((next: SessionTabState): SessionTabState => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const openTab = useCallback((tab: SessionTab, bypassPrompt = false): SessionTabOpenResult => {
    const current = stateRef.current;
    const existing = tab.sessionID
      ? current.tabs.find((item) => item.sessionID === tab.sessionID)
      : undefined;
    if (existing) {
      commit({ ...current, activeTabID: existing.id });
      setPendingOpen(undefined);
      return { status: "opened", tab: existing };
    }
    if (!settings.enabled) {
      commit({ activeTabID: tab.id, tabs: [tab] });
      setPendingOpen(undefined);
      return { status: "opened", tab };
    }
    const atLimit = settings.maxOpen !== null && current.tabs.length >= settings.maxOpen;
    if (atLimit && settings.overflow === "prompt" && !bypassPrompt) {
      setPendingOpen({ tab });
      return { status: "blocked" };
    }
    let tabs = current.tabs;
    if (atLimit) {
      const replacement = [...tabs]
        .filter((item) => item.id !== current.activeTabID)
        .sort((left, right) => left.openedAt - right.openedAt)[0];
      tabs = replacement
        ? tabs.filter((item) => item.id !== replacement.id)
        : tabs.slice(1);
    }
    commit({ activeTabID: tab.id, tabs: [...tabs, tab] });
    setPendingOpen(undefined);
    return { status: "opened", tab };
  }, [commit, settings]);

  const openSession = useCallback((sessionID: string): SessionTabOpenResult => {
    const session = sessionsRef.current.find((item) => item.id === sessionID);
    const tab = session
      ? makeSessionTab(session)
      : { id: sessionTabID(sessionID), kind: "session" as const, openedAt: Date.now(), sessionID };
    return openTab(tab);
  }, [openTab]);

  const openDraft = useCallback((): SessionTabOpenResult => {
    const current = stateRef.current;
    const existing = current.tabs.find((tab) => tab.kind === "draft");
    if (existing) {
      commit({ ...current, activeTabID: existing.id });
      setPendingOpen(undefined);
      return { status: "opened", tab: existing };
    }
    return openTab(makeDraft());
  }, [commit, openTab]);

  const confirmPendingOpen = useCallback((): SessionTabOpenResult => {
    const pending = pendingOpen;
    if (!pending) return { status: "blocked" };
    return openTab(pending.tab, true);
  }, [openTab, pendingOpen]);

  const selectTab = useCallback((tabID: string): SessionTab | undefined => {
    const current = stateRef.current;
    const tab = current.tabs.find((item) => item.id === tabID);
    if (!tab) return undefined;
    commit({ ...current, activeTabID: tabID });
    return tab;
  }, [commit]);

  const closeTab = useCallback((tabID: string): SessionTab => {
    const current = stateRef.current;
    const index = current.tabs.findIndex((tab) => tab.id === tabID);
    if (index < 0) return current.tabs.find((tab) => tab.id === current.activeTabID) ?? makeDraft();
    const remaining = current.tabs.filter((tab) => tab.id !== tabID);
    if (remaining.length === 0) {
      const draft = makeDraft();
      commit({ activeTabID: draft.id, tabs: [draft] });
      return draft;
    }
    const currentActive = current.tabs.find((tab) => tab.id === current.activeTabID);
    const nextActive = current.activeTabID === tabID
      ? remaining[Math.min(index, remaining.length - 1)]
      : currentActive ?? remaining[0];
    commit({ activeTabID: nextActive.id, tabs: remaining });
    return nextActive;
  }, [commit]);

  /**
   * Closes a group of tabs in one commit.
   *
   * Looping over [closeTab] would publish an intermediate strip after every removal, each one
   * re-picking an active tab that the next removal might take away again — the native header would
   * flicker through selections the user never made.
   */
  const closeTabs = useCallback((tabIDs: string[]): SessionTab => {
    const current = stateRef.current;
    const doomed = new Set(tabIDs);
    const remaining = current.tabs.filter((tab) => !doomed.has(tab.id));
    if (remaining.length === 0) {
      const draft = makeDraft();
      commit({ activeTabID: draft.id, tabs: [draft] });
      return draft;
    }
    const nextActive = remaining.find((tab) => tab.id === current.activeTabID) ?? remaining[remaining.length - 1];
    commit({ activeTabID: nextActive.id, tabs: remaining });
    return nextActive;
  }, [commit]);

  const replaceDraft = useCallback((tabID: string, session: SessionInfo): SessionTab => {
    const current = stateRef.current;
    const existingSessionTab = current.tabs.find((tab) => tab.sessionID === session.id);
    if (existingSessionTab) {
      const tabs = current.tabs.filter((tab) => tab.id !== tabID || tab.id === existingSessionTab.id);
      commit({ activeTabID: existingSessionTab.id, tabs });
      return existingSessionTab;
    }
    const nextTab: SessionTab = {
      id: tabID,
      kind: "session",
      openedAt: Date.now(),
      sessionID: session.id,
      title: session.title,
    };
    commit({
      activeTabID: nextTab.id,
      tabs: current.tabs.map((tab) => tab.id === tabID ? nextTab : tab),
    });
    return nextTab;
  }, [commit]);

  const renameDraft = useCallback((tabID: string, title: string) => {
    const current = stateRef.current;
    commit({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === tabID ? { ...tab, title: title.trim() } : tab),
    });
  }, [commit]);

  const removeSession = useCallback((sessionID: string): SessionTab => {
    const tab = stateRef.current.tabs.find((item) => item.sessionID === sessionID);
    return tab ? closeTab(tab.id) : stateRef.current.tabs.find((item) => item.id === stateRef.current.activeTabID) ?? makeDraft();
  }, [closeTab]);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabID) ?? state.tabs[0],
    [state.activeTabID, state.tabs]
  );

  return {
    activeTab,
    activeTabID: activeTab?.id ?? "",
    cancelPendingOpen: () => setPendingOpen(undefined),
    closeTab,
    closeTabs,
    confirmPendingOpen,
    openDraft,
    openSession,
    pendingOpen,
    removeSession,
    renameDraft,
    replaceDraft,
    selectTab,
    tabs: state.tabs,
  };
}
