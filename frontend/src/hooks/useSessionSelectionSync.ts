import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import { modelKey } from "@/components/assistant/shared";
import type { SessionInfo, SessionMessage } from "@/lib/opencode";

interface SessionSelectionSyncInput {
  isDraft: boolean;
  messages: SessionMessage[];
  session?: SessionInfo;
  setSelectedAgentID: Dispatch<SetStateAction<string>>;
  setSelectedModelKey: Dispatch<SetStateAction<string>>;
  setSelectedVariant: Dispatch<SetStateAction<string | undefined>>;
}

/** The model that produced the newest answer in this conversation. */
const lastAnsweringModel = (messages: SessionMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type === "assistant" && message.model?.id) return message.model;
  }
  return undefined;
};

/**
 * Points the composer at whatever the opened conversation was last using.
 *
 * The session record is the first choice, but it only carries a model for as long as the server
 * remembers one — after a restart, or for a conversation started outside this panel, it comes back
 * empty and the composer fell back to the global default. Reopening a chat could then answer with
 * a different model than the one its previous answer came from, silently.
 *
 * Every assistant message names the model that produced it, which is the same fact and is always
 * there, so the last answer settles it. The thinking level travels with the model reference.
 */
export function useSessionSelectionSync({
  isDraft,
  messages,
  session,
  setSelectedAgentID,
  setSelectedModelKey,
  setSelectedVariant,
}: SessionSelectionSyncInput) {
  const sessionID = session?.id;
  const sessionModel = session?.model;
  const remembered = sessionModel ?? (sessionID ? lastAnsweringModel(messages) : undefined);

  useEffect(() => {
    if (!sessionID) {
      // A draft deliberately has no SessionInfo yet. Keep the choices visible in the composer;
      // they are applied when the first prompt materializes the session.
      if (isDraft) return;
      setSelectedModelKey("");
      setSelectedVariant(undefined);
      setSelectedAgentID("");
      return;
    }
    setSelectedModelKey(remembered ? modelKey(remembered) : "");
    setSelectedVariant(remembered?.variant);
    setSelectedAgentID(session?.agent ?? "");
    // The reference is compared by value: a re-fetch rebuilds the object without changing which
    // model it names, and depending on the object itself would reset the picker on every poll.
  }, [
    isDraft,
    remembered?.id,
    remembered?.providerID,
    remembered?.variant,
    session?.agent,
    sessionID,
    setSelectedAgentID,
    setSelectedModelKey,
    setSelectedVariant,
  ]);
}
