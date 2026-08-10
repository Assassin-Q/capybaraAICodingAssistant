import type { ActivePrompt } from "@/hooks/useRunLifecycle";
import type { AssistantMessage, SessionMessage } from "@/lib/opencode";
import { EMPTY_TOKEN_USAGE } from "@/lib/tokenUsage";
import { t } from "@/lib/i18n";

export const DEFAULT_EMPTY_RUN_ERROR = t("s_204b96ed88");

const runAssistants = (messages: SessionMessage[], prompt: ActivePrompt): AssistantMessage[] =>
  messages.filter((message): message is AssistantMessage => message.type === "assistant" && (
    message.parentID === prompt.messageID || message.time.created >= prompt.startedAt
  ));

export const hasRunOutput = (messages: SessionMessage[], prompt: ActivePrompt): boolean =>
  runAssistants(messages, prompt).some((message) => Boolean(message.error) || message.content.some((part) =>
    part.type === "tool" || Boolean(part.text.trim())
  ));

export const appendRunFailure = (
  messages: SessionMessage[],
  prompt: ActivePrompt,
  reason: string,
): SessionMessage[] => {
  if (hasRunOutput(messages, prompt)) return messages;
  const id = `run-error:${prompt.messageID}`;
  const failure: AssistantMessage = {
    agent: "",
    content: [],
    error: reason,
    finish: "error",
    id,
    model: { id: "", providerID: "" },
    parentID: prompt.messageID,
    tokens: EMPTY_TOKEN_USAGE,
    time: { completed: Date.now(), created: prompt.startedAt },
    type: "assistant",
  };
  return [...messages.filter((message) => message.id !== id), failure].sort(
    (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0)
  );
};
