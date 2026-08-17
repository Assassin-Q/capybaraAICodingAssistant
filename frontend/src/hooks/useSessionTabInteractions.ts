import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { errorMessage } from "@/components/assistant/shared";
import type { SessionTab } from "@/hooks/useSessionTabs";
import { openCodeApi } from "@/lib/opencode";
import type { SessionInfo } from "@/lib/opencode";

interface SessionTabsController {
  activeTab?: SessionTab;
  activeTabID: string;
  closeTab: (tabID: string) => SessionTab;
  confirmPendingOpen: () => { status: "opened" | "blocked"; tab?: SessionTab };
  openSession: (sessionID: string) => { status: "opened" | "blocked"; tab?: SessionTab };
  renameDraft: (tabID: string, title: string) => void;
  selectTab: (tabID: string) => SessionTab | undefined;
}

export function useSessionTabInteractions({
  projectPath,
  selectedSessionIDRef,
  sessionTabs,
  setEditingSessionTitle,
  setError,
  setSessionDialogOpen,
  setSessions,
}: {
  projectPath?: string;
  selectedSessionIDRef: MutableRefObject<string>;
  sessionTabs: SessionTabsController;
  setEditingSessionTitle: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setSessionDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>;
}) {
  const showTab = useCallback((tab: SessionTab, previousTabID: string) => {
    if (tab.id === previousTabID) return;
    selectedSessionIDRef.current = tab.sessionID ?? "";
    setEditingSessionTitle(false);
    setSessionDialogOpen(false);
    setError("");
  }, [selectedSessionIDRef, setEditingSessionTitle, setError, setSessionDialogOpen]);

  const selectTab = useCallback((tabID: string) => {
    const previousTabID = sessionTabs.activeTabID;
    const tab = sessionTabs.selectTab(tabID);
    if (tab) showTab(tab, previousTabID);
  }, [sessionTabs, showTab]);

  const openSession = useCallback((sessionID: string) => {
    const previousTabID = sessionTabs.activeTabID;
    const result = sessionTabs.openSession(sessionID);
    setSessionDialogOpen(false);
    if (result.status === "opened" && result.tab) showTab(result.tab, previousTabID);
  }, [sessionTabs, setSessionDialogOpen, showTab]);

  const closeTab = useCallback((tabID: string) => {
    const wasActive = tabID === sessionTabs.activeTabID;
    const previousTabID = sessionTabs.activeTabID;
    const nextTab = sessionTabs.closeTab(tabID);
    if (wasActive) showTab(nextTab, previousTabID);
  }, [sessionTabs, showTab]);

  const confirmPendingOpen = useCallback(() => {
    const previousTabID = sessionTabs.activeTabID;
    const result = sessionTabs.confirmPendingOpen();
    if (result.status === "opened" && result.tab) showTab(result.tab, previousTabID);
  }, [sessionTabs, showTab]);

  const closeTabAndOpenPending = useCallback((tabID: string) => {
    const previousTabID = sessionTabs.activeTabID;
    const fallback = sessionTabs.closeTab(tabID);
    const result = sessionTabs.confirmPendingOpen();
    if (result.status === "opened" && result.tab) {
      showTab(result.tab, previousTabID);
      return;
    }
    showTab(fallback, previousTabID);
  }, [sessionTabs, showTab]);

  const renameTab = useCallback(async (tab: SessionTab, title: string) => {
    if (!title.trim()) return;
    if (tab.kind === "draft" || !tab.sessionID) {
      sessionTabs.renameDraft(tab.id, title);
      return;
    }
    if (!projectPath) return;
    try {
      const updated = await openCodeApi.renameSession(tab.sessionID, title.trim(), projectPath);
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session));
    } catch (renameError) {
      setError(errorMessage(renameError));
      throw renameError;
    }
  }, [projectPath, sessionTabs, setSessions]);

  const saveTitle = useCallback(async (title: string) => {
    const activeTab = sessionTabs.activeTab;
    if (!activeTab || !title.trim()) {
      setEditingSessionTitle(false);
      return;
    }
    try {
      await renameTab(activeTab, title);
      setEditingSessionTitle(false);
    } catch (renameError) {
      setError(errorMessage(renameError));
    }
  }, [renameTab, sessionTabs.activeTab, setEditingSessionTitle, setError]);

  return { closeTab, closeTabAndOpenPending, confirmPendingOpen, openSession, renameTab, saveTitle, selectTab };
}
