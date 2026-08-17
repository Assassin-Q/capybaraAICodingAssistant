import { createMessageID, createOptimisticUserMessage } from "@/lib/opencode";
import type { SessionMessage } from "@/lib/opencode";

/** The bucket a draft tab renders from: it has no session id yet. */
const DRAFT_BUCKET = "";

interface DraftFirstPromptInput {
  materialize: () => Promise<string | undefined>;
  send: (sessionID: string) => Promise<boolean>;
  setMessages: (sessionID: string, action: (current: SessionMessage[]) => SessionMessage[]) => void;
  text: string;
}

/**
 * Sends the first prompt of a draft conversation without making the user watch a blank panel.
 *
 * Creating the server session is a round trip, and a renamed tab costs a second one. The prompt
 * used to wait for all of that before anything was drawn, so the first message of a new chat
 * appeared only after a visible pause. A placeholder bubble goes up immediately instead, moves to
 * the real session the moment it exists — otherwise the switch to an empty bucket would blink —
 * and is removed once the actual optimistic message has taken its place.
 */
export const sendDraftFirstPrompt = async ({
  materialize,
  send,
  setMessages,
  text,
}: DraftFirstPromptInput): Promise<boolean> => {
  const placeholder = createOptimisticUserMessage(createMessageID(), text, []);
  const drop = (sessionID: string) =>
    setMessages(sessionID, (current) => current.filter((message) => message.id !== placeholder.id));

  setMessages(DRAFT_BUCKET, (current) => [...current, placeholder]);
  let sessionID: string | undefined;
  try {
    sessionID = await materialize();
  } finally {
    // The draft bucket is shared by every unsaved tab, so a placeholder left behind would show up
    // under the next new conversation.
    if (sessionID) setMessages(sessionID, (current) => [...current, placeholder]);
    drop(DRAFT_BUCKET);
  }
  if (!sessionID) return false;

  try {
    return await send(sessionID);
  } finally {
    drop(sessionID);
  }
};
