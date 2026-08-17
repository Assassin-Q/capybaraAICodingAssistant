import { useEffect, useRef } from "react";

import type { SessionTab } from "@/hooks/useSessionTabs";
import { ideaApi } from "@/lib/idea";
import type { SessionInfo } from "@/lib/opencode";
import { sessionName } from "@/components/assistant/shared";
import { t } from "@/lib/i18n";

export function useNativeSessionTabsBridge({
  activeTabID,
  enabled,
  multiTab,
  sessions,
  tabs,
}: {
  activeTabID: string;
  enabled: boolean;
  /** Whether several conversations may be open at once; the strip hides bulk closing without it. */
  multiTab: boolean;
  sessions: SessionInfo[];
  tabs: SessionTab[];
}) {
  const revision = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const sessionsByID = new Map(sessions.map((session) => [session.id, session]));
    revision.current = Math.max(revision.current + 1, Date.now());
    void ideaApi.setPanelSessionTabs({
      activeTabID,
      multiTab,
      revision: revision.current,
      tabs: tabs.map((tab) => {
        const session = tab.sessionID ? sessionsByID.get(tab.sessionID) : undefined;
        return {
          id: tab.id,
          sessionID: tab.sessionID,
          title: session
            ? sessionName(session)
            : tab.title?.trim() || (tab.kind === "draft"
              ? t("tabs.newConversation")
              : t("tabs.unknownConversation")),
        };
      }),
    }).catch(() => undefined);
  }, [activeTabID, enabled, multiTab, sessions, tabs]);
}
