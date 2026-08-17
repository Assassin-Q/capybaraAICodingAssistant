import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { openCodeApi } from "@/lib/opencode";
import type { SessionInfo, SessionMessage } from "@/lib/opencode";
import { stripPromptAugmentations } from "@/lib/promptAugmentation";

interface SessionAutoTitleInput {
  messages: SessionMessage[];
  projectPath?: string;
  session?: SessionInfo;
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>;
}

/** What OpenCode calls a session it has not named: `New session - <ISO timestamp>`. */
const UNNAMED = /^new session\s*-/i;

const MAX_TITLE_CHARS = 32;

/** The opening of what the user asked, condensed to something that fits a tab. */
const titleFromPrompt = (text: string): string => {
  const firstLine = stripPromptAugmentations(text)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
  // Slash commands and skill markers are syntax, not subject matter.
  const subject = firstLine.replace(/^[/$@]\S*\s*/, "").trim() || firstLine;
  if (subject.length <= MAX_TITLE_CHARS) return subject;
  return `${subject.slice(0, MAX_TITLE_CHARS - 1)}…`;
};

/**
 * Names a conversation after the message that started it.
 *
 * OpenCode creates every session as "New session - <timestamp>" and, over the V2 prompt endpoint
 * this panel uses, never replaces it — so every tab read as a date. Rather than depend on server
 * behaviour that may or may not run, the rename is done here from the first user message, which is
 * the same thing the title would have said.
 *
 * Only sessions still carrying the generated name are touched, so a title the user chose, or one
 * the server did produce, is never overwritten. Each id is attempted once per panel lifetime; a
 * failure releases it so a later render can retry.
 */
export function useSessionAutoTitle({
  messages,
  projectPath,
  session,
  setSessions,
}: SessionAutoTitleInput) {
  const attempted = useRef(new Set<string>());
  const sessionID = session?.id;
  const title = session?.title;

  useEffect(() => {
    if (!sessionID || !projectPath || attempted.current.has(sessionID)) return;
    const current = title?.trim() ?? "";
    if (current && !UNNAMED.test(current)) return;
    const firstPrompt = messages.find(
      (message): message is Extract<SessionMessage, { type: "user" }> =>
        message.type === "user" && Boolean(message.text?.trim())
    );
    const next = titleFromPrompt(firstPrompt?.text ?? "");
    if (!next) return;

    attempted.current.add(sessionID);
    void openCodeApi.renameSession(sessionID, next, projectPath)
      .then((renamed) => setSessions((sessions) => sessions.map((item) =>
        item.id === sessionID ? { ...item, title: renamed.title } : item)))
      .catch(() => attempted.current.delete(sessionID));
  }, [messages, projectPath, sessionID, setSessions, title]);
}
