import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { errorMessage } from "@/components/assistant/shared";
import type { SessionTab } from "@/hooks/useSessionTabs";
import { ideaApi } from "@/lib/idea";
import { openCodeApi } from "@/lib/opencode";
import type { ModelInfo, SessionInfo } from "@/lib/opencode";
import { modelRefWithAvailableVariant } from "@/components/assistant/modelVariants";
import type { ApprovalMode } from "@/lib/approvalMode";

interface SessionTabMaterializer {
  activeTab?: SessionTab;
  replaceDraft: (tabID: string, session: SessionInfo) => SessionTab;
}

/** Creates a server session only when a draft receives its first prompt. */
export function useSessionDraftMaterialization({
  approvalMode,
  projectPath,
  selectedAgentID,
  selectedModel,
  selectedSessionID,
  selectedVariant,
  sessionTabs,
  setError,
  setSessions,
  selectedSessionIDRef,
  skipNextSessionLoad,
  suppressedStreamingSessionIDs,
}: {
  approvalMode: ApprovalMode;
  projectPath?: string;
  selectedAgentID: string;
  selectedModel?: ModelInfo;
  selectedSessionID: string;
  selectedVariant?: string;
  sessionTabs: SessionTabMaterializer;
  setError: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>;
  selectedSessionIDRef: MutableRefObject<string>;
  skipNextSessionLoad: MutableRefObject<string>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}) {
  const inFlight = useRef(false);

  return useCallback(async (): Promise<string | undefined> => {
    const activeTab = sessionTabs.activeTab;
    if (activeTab?.kind !== "draft" || !projectPath || inFlight.current) {
      return selectedSessionID || undefined;
    }
    inFlight.current = true;
    try {
      const model = selectedModel ? modelRefWithAvailableVariant(selectedModel, selectedVariant) : undefined;
      let session = await openCodeApi.createSession(projectPath, model, selectedAgentID || undefined);
      const draftTitle = activeTab.title?.trim();
      if (draftTitle) {
        try {
          session = await openCodeApi.renameSession(session.id, draftTitle, projectPath);
        } catch (renameError) {
          // A metadata failure must not discard the user's first prompt.
          setError(errorMessage(renameError));
        }
      }
      // Approval is enforced by the IDEA bridge. A standalone web preview has no bridge, so this
      // optional sync cannot be allowed to block session materialization.
      await ideaApi.setApprovalMode(session.id, approvalMode).catch(() => undefined);
      skipNextSessionLoad.current = session.id;
      selectedSessionIDRef.current = session.id;
      sessionTabs.replaceDraft(activeTab.id, session);
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      suppressedStreamingSessionIDs.current.delete(session.id);
      return session.id;
    } catch (createError) {
      setError(errorMessage(createError));
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, [
    approvalMode,
    projectPath,
    selectedAgentID,
    selectedModel,
    selectedSessionID,
    selectedVariant,
    sessionTabs,
    setError,
    setSessions,
    selectedSessionIDRef,
    skipNextSessionLoad,
    suppressedStreamingSessionIDs,
  ]);
}
