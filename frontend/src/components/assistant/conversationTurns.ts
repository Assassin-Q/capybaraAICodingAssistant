import type {
  AssistantMessage,
  SessionMessage,
} from "@/lib/opencode";

export interface AssistantTurn extends AssistantMessage {
  sourceIDs: string[];
}

export type ConversationTurn = Exclude<SessionMessage, AssistantMessage> | AssistantTurn;

export interface StreamingAssistantState {
  assistantID?: string;
  parentID?: string;
  hasVisibleContent: boolean;
}

const mergeParts = (
  current: AssistantTurn["content"],
  incoming: AssistantMessage["content"]
): AssistantTurn["content"] => {
  const merged = [...current];
  const indexes = new Map(merged.map((part, index) => [part.id, index]));
  incoming.forEach((part) => {
    const index = indexes.get(part.id);
    if (index === undefined) {
      indexes.set(part.id, merged.length);
      merged.push(part);
      return;
    }
    const previous = merged[index];
    if (previous.type === "tool" && part.type === "tool") {
      merged[index] = {
        ...previous,
        ...part,
        state: { ...previous.state, ...part.state },
        time: { ...previous.time, ...part.time },
      };
      return;
    }
    if (previous.type !== part.type) {
      merged[index] = part;
      return;
    }
    if ("text" in previous && "text" in part) {
      const previousText = previous.text;
      const incomingText = part.text;
      merged[index] = {
        ...previous,
        ...part,
        text: incomingText.startsWith(previousText) || incomingText.length >= previousText.length
          ? incomingText
          : previousText,
      } as typeof previous;
      return;
    }
    merged[index] = part;
  });
  return merged;
};

export const hasVisibleAssistantContent = (message: AssistantMessage): boolean =>
  Boolean(message.error) || message.content.some((part) => {
    if (part.type === "tool") return true;
    return Boolean(part.text.trim());
  });

const mergeAssistantTurn = (current: AssistantTurn | undefined, message: AssistantMessage): AssistantTurn => {
  // Every V2 assistant step starts its local part ordinals at zero. Prefixing
  // with the owning message keeps reasoning-0/text-0 from different steps
  // from replacing each other while the turn is rendered as one response.
  const content = message.content.map((part) => ({
    ...part,
    id: `${message.id}:${part.id}`,
  }));
  if (!current) return { ...message, content, sourceIDs: [message.id] };
  return {
    ...current,
    agent: message.agent || current.agent,
    content: mergeParts(current.content, content),
    error: message.error || current.error,
    finish: message.finish || current.finish,
    model: message.model.id ? message.model : current.model,
    parentID: message.parentID ?? current.parentID,
    sourceIDs: [...new Set([...current.sourceIDs, message.id])],
    time: {
      completed: message.time.completed ?? current.time.completed,
      created: current.time.created,
    },
  };
};

export const groupConversationTurns = (messages: SessionMessage[]): ConversationTurn[] => {
  const assistantsByParent = new Map<string, AssistantTurn>();
  const unparentedAssistantIDs = new Set<string>();
  messages.forEach((message) => {
    if (message.type !== "assistant" || !hasVisibleAssistantContent(message)) return;
    if (!message.parentID) {
      unparentedAssistantIDs.add(message.id);
      return;
    }
    assistantsByParent.set(
      message.parentID,
      mergeAssistantTurn(assistantsByParent.get(message.parentID), message)
    );
  });

  const turns: ConversationTurn[] = [];
  messages.forEach((message) => {
    if (message.type !== "assistant") {
      turns.push(message);
      if (message.type === "user") {
        const assistant = assistantsByParent.get(message.id);
        if (assistant) turns.push(assistant);
      }
      return;
    }
    if (!hasVisibleAssistantContent(message) || !unparentedAssistantIDs.has(message.id)) return;

    const previous = turns[turns.length - 1];
    if (previous?.type !== "assistant") {
      turns.push(mergeAssistantTurn(undefined, message));
      return;
    }
    turns[turns.length - 1] = mergeAssistantTurn(previous, message);
  });
  return turns;
};

export const resolveStreamingAssistantState = (
  messages: SessionMessage[],
  turns: ConversationTurn[],
  streamingAssistantID?: string,
): StreamingAssistantState => {
  const assistants = messages.filter((message): message is AssistantMessage => message.type === "assistant");
  const activeAssistant = (streamingAssistantID
    ? assistants.find((message) => message.id === streamingAssistantID)
    : undefined)
    ?? [...assistants].reverse().find((message) => !message.time.completed && !message.finish && !message.error);

  if (!activeAssistant) return { hasVisibleContent: false };

  const relatedTurn = turns.find((turn): turn is AssistantTurn => {
    if (turn.type !== "assistant") return false;
    return turn.sourceIDs.includes(activeAssistant.id)
      || Boolean(activeAssistant.parentID && turn.parentID === activeAssistant.parentID);
  });

  return {
    assistantID: activeAssistant.id,
    hasVisibleContent: Boolean(relatedTurn && hasVisibleAssistantContent(relatedTurn)),
    parentID: activeAssistant.parentID,
  };
};
