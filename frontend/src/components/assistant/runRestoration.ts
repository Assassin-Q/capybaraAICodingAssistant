import type { ActivePrompt } from "@/hooks/useSessionRuntime";
import type { AssistantMessage, SessionMessage, UserMessage } from "@/lib/opencode";

export interface RestoredRunState {
  assistantIDs: string[];
  hasActivity: boolean;
  prompt: ActivePrompt;
  streamingAssistantID?: string;
}

export const restoreActiveRun = (
  messages: SessionMessage[],
  sessionID: string,
  generation: number,
): RestoredRunState => {
  const users = messages.filter((message): message is UserMessage => message.type === "user");
  const assistants = messages.filter((message): message is AssistantMessage => message.type === "assistant");
  const incompleteAssistant = [...assistants].reverse().find((message) =>
    !message.time.completed && !message.finish && !message.error
  );
  const parent = incompleteAssistant?.parentID
    ? users.find((message) => message.id === incompleteAssistant.parentID)
    : users.at(-1);
  const messageID = incompleteAssistant?.parentID ?? parent?.id ?? `restored:${sessionID}`;
  const relatedAssistants = assistants.filter((message) =>
    message.parentID === messageID || message.id === incompleteAssistant?.id
  );
  const startedAt = parent?.time.created
    ?? relatedAssistants[0]?.time.created
    ?? incompleteAssistant?.time.created
    ?? Date.now();

  return {
    assistantIDs: relatedAssistants.map((message) => message.id),
    hasActivity: relatedAssistants.length > 0,
    prompt: {
      fingerprint: `restored:${sessionID}:${messageID}`,
      generation,
      messageID,
      sessionID,
      startedAt,
    },
    streamingAssistantID: incompleteAssistant?.id,
  };
};
