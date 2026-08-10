import type {
  AssistantMessage,
  AssistantReasoningPart,
  AssistantTextPart,
  AssistantToolPart,
  OpenCodeEvent,
  SessionMessage,
} from "@/lib/opencode";
import { EMPTY_TOKEN_USAGE, hasTokenUsage, parseTokenUsage } from "@/lib/tokenUsage";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;

const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const optionalNumber = (value: unknown): number | undefined => {
  const result = numberValue(value);
  return result > 0 ? result : undefined;
};

const eventType = (event: OpenCodeEvent): string | undefined =>
  event.type?.replace(/\.\d+$/, "");

const canonicalStreamType = (type: string): string =>
  type.startsWith("session.next.") ? type.replace("session.next.", "session.") : type;

export const eventSessionID = (event: OpenCodeEvent): string | undefined => {
  const properties = event.properties ?? event.data ?? {};
  if (typeof properties.sessionID === "string") return properties.sessionID;
  if (typeof properties.sessionId === "string") return properties.sessionId;
  const info = asRecord(properties.info);
  if (typeof info?.sessionID === "string") return info.sessionID;
  if (typeof info?.sessionId === "string") return info.sessionId;
  const part = asRecord(properties.part);
  if (typeof part?.sessionID === "string") return part.sessionID;
  return typeof part?.sessionId === "string" ? part.sessionId : undefined;
};

export const eventMessageID = (event: OpenCodeEvent): string | undefined => {
  const properties = event.properties ?? event.data ?? {};
  const direct = stringValue(properties.messageID);
  if (direct) return direct;
  const assistantMessageID = stringValue(properties.assistantMessageID);
  if (assistantMessageID) return assistantMessageID;
  const assistantMessageId = stringValue(properties.assistantMessageId);
  if (assistantMessageId) return assistantMessageId;
  const info = asRecord(properties.info);
  const infoID = stringValue(info?.id);
  if (infoID) return infoID;
  const part = asRecord(properties.part);
  return stringValue(part?.messageID) || undefined;
};

export const eventAssistantParentID = (event: OpenCodeEvent): string | undefined => {
  const properties = event.properties ?? event.data ?? {};
  const direct = stringValue(properties.parentID) || stringValue(properties.parentId);
  if (direct) return direct;
  const info = asRecord(properties.info);
  return stringValue(info?.parentID) || stringValue(info?.parentId) || undefined;
};

const placeholderAssistant = (messageID: string): AssistantMessage => ({
  agent: "",
  content: [],
  id: messageID,
  model: { id: "", providerID: "" },
  tokens: EMPTY_TOKEN_USAGE,
  time: { created: Date.now() },
  type: "assistant",
});

const updateAssistant = (
  messages: SessionMessage[],
  messageID: string,
  update: (message: AssistantMessage) => AssistantMessage
): SessionMessage[] => {
  const index = messages.findIndex((message) => message.id === messageID && message.type === "assistant");
  // OpenCode also publishes message.part.updated for user text/file parts. The
  // optimistic user message already owns that ID, so never turn those parts
  // into an assistant placeholder on the opposite side of the conversation.
  if (index < 0 && messages.some((message) => message.id === messageID && message.type === "user")) {
    return messages;
  }
  if (index < 0) return [...messages, update(placeholderAssistant(messageID))];
  const next = [...messages];
  next[index] = update(next[index] as AssistantMessage);
  return next;
};

const modelFromInfo = (info: UnknownRecord, current: AssistantMessage["model"]) => {
  const model = asRecord(info.model);
  const rawVariant = stringValue(model?.variant) || stringValue(info.variant);
  return {
    id: stringValue(model?.id) || stringValue(model?.modelID) || stringValue(info.modelID) || current.id,
    providerID: stringValue(model?.providerID) || stringValue(info.providerID) || current.providerID,
    variant: rawVariant ? (rawVariant === "default" ? undefined : rawVariant) : current.variant,
  };
};

const snapshotFromInfo = (
  info: UnknownRecord,
  current: AssistantMessage["snapshot"]
): AssistantMessage["snapshot"] => {
  const snapshot = asRecord(info.snapshot);
  const start = stringValue(snapshot?.start) || current?.start;
  if (!start) return current;
  const files = Array.isArray(snapshot?.files)
    ? snapshot.files.filter((file): file is string => typeof file === "string")
    : current?.files ?? [];
  return {
    end: stringValue(snapshot?.end) || current?.end,
    files: [...new Set([...(current?.files ?? []), ...files])],
    start,
  };
};

const normalizePart = (
  raw: UnknownRecord
): AssistantTextPart | AssistantReasoningPart | AssistantToolPart | undefined => {
  const id = stringValue(raw.id);
  const type = stringValue(raw.type);
  if (!id) return undefined;
  if (type === "text") return { id, text: stringValue(raw.text), type };
  if (type === "reasoning") {
    const rawTime = asRecord(raw.time);
    return {
      id,
      text: stringValue(raw.text),
      time: rawTime ? {
        completed: optionalNumber(rawTime.completed) ?? optionalNumber(rawTime.end),
        created: optionalNumber(rawTime.created) ?? optionalNumber(rawTime.start),
      } : undefined,
      type,
    };
  }
  if (type !== "tool") return undefined;
  const rawState = asRecord(raw.state) ?? {};
  const status = stringValue(rawState.status, "pending");
  const rawTime = asRecord(raw.time) ?? asRecord(rawState.time) ?? {};
  return {
    id,
    name: stringValue(raw.name) || stringValue(raw.tool, "tool"),
    state: {
      content: rawState.content,
      error: rawState.error,
      input: rawState.input,
      outputPaths: Array.isArray(rawState.outputPaths)
        ? rawState.outputPaths.filter((path): path is string => typeof path === "string")
        : undefined,
      result: rawState.result ?? rawState.output,
      status: status === "running" || status === "completed" || status === "error" ? status : "pending",
      structured: rawState.structured,
    },
    time: {
      completed: optionalNumber(rawTime.completed) ?? optionalNumber(rawTime.end),
      created: optionalNumber(rawTime.created) ?? optionalNumber(rawTime.start) ?? Date.now(),
      ran: optionalNumber(rawTime.ran) ?? optionalNumber(rawTime.start),
    },
    type,
  };
};

const upsertPart = (
  messages: SessionMessage[],
  messageID: string,
  part: AssistantTextPart | AssistantReasoningPart | AssistantToolPart
): SessionMessage[] => updateAssistant(messages, messageID, (message) => {
  const index = message.content.findIndex((item) => item.id === part.id);
  const content = [...message.content];
  if (index < 0) content.push(part);
  else {
    const previous = content[index];
    if (previous.type === "tool" && part.type === "tool") {
      content[index] = {
        ...previous,
        ...part,
        state: { ...previous.state, ...part.state },
        time: { ...previous.time, ...part.time },
      };
    } else if (previous.type === part.type && "text" in previous && "text" in part) {
      const incomingText = part.text;
      const text = !incomingText || previous.text.startsWith(incomingText)
        ? previous.text
        : incomingText;
      content[index] = { ...previous, ...part, text } as typeof previous;
    } else {
      content[index] = part;
    }
  }
  return { ...message, content };
});

const applyMessageInfo = (messages: SessionMessage[], properties: UnknownRecord): SessionMessage[] => {
  const info = asRecord(properties.info);
  if (!info || typeof info.id !== "string") return messages;
  const role = stringValue(info.role) || stringValue(info.type);
  if (role !== "assistant") return messages;
  const time = asRecord(info.time);
  const error = asRecord(info.error);
  const errorData = asRecord(error?.data);
  return updateAssistant(messages, info.id, (current) => ({
    ...current,
    agent: stringValue(info.agent, current.agent),
    error: stringValue(errorData?.message) || stringValue(error?.message) || current.error,
    finish: stringValue(info.finish) || current.finish,
    model: modelFromInfo(info, current.model),
    parentID: stringValue(info.parentID) || current.parentID,
    snapshot: snapshotFromInfo(info, current.snapshot),
    tokens: parseTokenUsage(info.tokens) ?? current.tokens,
    time: {
      completed: optionalNumber(time?.completed) ?? current.time.completed,
      created: optionalNumber(time?.created) ?? current.time.created,
    },
  }));
};

const applyPartUpdate = (messages: SessionMessage[], properties: UnknownRecord): SessionMessage[] => {
  const rawPart = asRecord(properties.part);
  const messageID = stringValue(rawPart?.messageID);
  if (!rawPart || !messageID) return messages;
  const part = normalizePart(rawPart);
  return part ? upsertPart(messages, messageID, part) : messages;
};

const ensureTextPart = (
  messages: SessionMessage[],
  messageID: string,
  partID: string,
  type: "text" | "reasoning"
): SessionMessage[] => updateAssistant(messages, messageID, (message) => {
  if (message.content.some((part) => part.id === partID)) return message;
  return { ...message, content: [...message.content, { id: partID, text: "", type }] };
});

const applyPartDelta = (
  messages: SessionMessage[],
  properties: UnknownRecord,
  type: "text" | "reasoning"
): SessionMessage[] => {
  const messageID = stringValue(properties.messageID);
  const partID = stringValue(properties.partID);
  const text = stringValue(properties.delta);
  if (!messageID || !partID || !text) return messages;
  const withPart = ensureTextPart(messages, messageID, partID, type);
  return updateAssistant(withPart, messageID, (message) => {
    const index = message.content.findIndex((part) => part.id === partID);
    if (index < 0) return message;
    const current = message.content[index];
    if (current.type !== type) return message;
    const content = [...message.content];
    // OpenCode emits an incremental delta. Event IDs provide replay protection;
    // repeated text is valid output and must not be dropped as a duplicate.
    const nextText = current.text + text;
    content[index] = { ...current, text: nextText };
    return { ...message, content };
  });
};

const nextMessageID = (properties: UnknownRecord): string =>
  stringValue(properties.assistantMessageID) || stringValue(properties.messageID);

const nextPartID = (
  messages: SessionMessage[],
  messageID: string,
  properties: UnknownRecord,
  type: "text" | "reasoning" | "tool",
  createNew = false,
): string => {
  const explicit = type === "text"
    ? stringValue(properties.textID) || stringValue(properties.partID)
    : type === "reasoning"
      ? stringValue(properties.reasoningID) || stringValue(properties.partID)
      : stringValue(properties.callID) || stringValue(properties.partID);
  if (explicit) return explicit;
  const ordinal = properties.ordinal;
  if (typeof ordinal === "number" || typeof ordinal === "string") {
    // Persisted V2 messages use text-0 / reasoning-0. Matching those IDs keeps
    // the final reconciliation from mounting a second copy of the same part.
    return `${type}-${ordinal}`;
  }
  if (createNew) {
    const message = messages.find((item): item is AssistantMessage => item.type === "assistant" && item.id === messageID);
    const count = (message?.content ?? []).filter((part) => part.type === type).length;
    return `${type}:${messageID}:${count}`;
  }
  const message = messages.find((item): item is AssistantMessage => item.type === "assistant" && item.id === messageID);
  const current = (message?.content ?? []).filter((part) => part.type === type).at(-1);
  return current?.id ?? `${type}:${messageID}`;
};

const parseToolInput = (value: string): unknown => {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const updateToolPart = (
  messages: SessionMessage[],
  messageID: string,
  partID: string,
  update: (part: AssistantToolPart) => AssistantToolPart
): SessionMessage[] => updateAssistant(messages, messageID, (message) => {
  const index = message.content.findIndex((part) => part.id === partID && part.type === "tool");
  const current = index >= 0 ? message.content[index] as AssistantToolPart : {
    id: partID,
    name: "tool",
    state: { input: {}, status: "pending" as const },
    time: { created: Date.now() },
    type: "tool" as const,
  };
  const next = update(current);
  const content = [...message.content];
  if (index < 0) content.push(next);
  else content[index] = next;
  return { ...message, content };
});

const applyStreamEvent = (messages: SessionMessage[], rawType: string, properties: UnknownRecord): SessionMessage[] => {
  const type = canonicalStreamType(rawType);
  const messageID = nextMessageID(properties);
  if (!messageID) return messages;

  if (type === "session.text.started" || type === "session.reasoning.started") {
    const partType = type.includes("reasoning") ? "reasoning" : "text";
    return ensureTextPart(messages, messageID, nextPartID(messages, messageID, properties, partType, true), partType);
  }

  if (type === "session.text.delta" || type === "session.reasoning.delta") {
    const partType = type.includes("reasoning") ? "reasoning" : "text";
    return applyPartDelta(messages, {
      ...properties,
      messageID,
      partID: nextPartID(messages, messageID, properties, partType),
    }, partType);
  }

  if (type === "session.reasoning.ended") {
    const partID = nextPartID(messages, messageID, properties, "reasoning");
    const text = stringValue(properties.text);
    return updateAssistant(messages, messageID, (message) => {
      const index = message.content.findIndex((part) => part.id === partID && part.type === "reasoning");
      if (index < 0) {
        const completedAt = optionalNumber(properties.timestamp) ?? Date.now();
        return text
          ? { ...message, content: [...message.content, { id: partID, text, time: { completed: completedAt, created: completedAt }, type: "reasoning" }] }
          : message;
      }
      const current = message.content[index];
      if (current.type !== "reasoning") return message;
      const content = [...message.content];
      content[index] = {
        ...current,
        text: text || current.text,
        time: {
          completed: optionalNumber(properties.timestamp) ?? Date.now(),
          created: current.time?.created ?? optionalNumber(properties.timestamp) ?? Date.now(),
        },
      };
      return { ...message, content };
    });
  }

  if (type === "session.text.ended") {
    const partID = nextPartID(messages, messageID, properties, "text");
    const text = stringValue(properties.text);
    if (!text) return messages;
    return upsertPart(messages, messageID, { id: partID, text, type: "text" });
  }

  if (type === "session.tool.input.started") {
    const partID = nextPartID(messages, messageID, properties, "tool", true);
    return updateToolPart(messages, messageID, partID, (part) => ({
      ...part,
      name: stringValue(properties.name, part.name),
      state: { ...part.state, input: {}, status: "running" },
    }));
  }

  if (type === "session.tool.input.delta" || type === "session.tool.input.ended") {
    const partID = nextPartID(messages, messageID, properties, "tool");
    return updateToolPart(messages, messageID, partID, (part) => {
      const currentInput = typeof part.state.input === "string" ? part.state.input : "";
      const nextInput = type.endsWith("ended")
        ? parseToolInput(stringValue(properties.text))
        : currentInput + stringValue(properties.delta);
      return { ...part, state: { ...part.state, input: nextInput, status: "running" } };
    });
  }

  if (type === "session.tool.called" || type === "session.tool.progress" || type === "session.tool.success" || type === "session.tool.failed") {
    const partID = nextPartID(messages, messageID, properties, "tool");
    const status = type.endsWith("success") ? "completed" : type.endsWith("failed") ? "error" : "running";
    return updateToolPart(messages, messageID, partID, (part) => ({
      ...part,
      name: stringValue(properties.tool, part.name),
      state: {
        ...part.state,
        content: properties.content ?? part.state.content,
        error: properties.error ?? part.state.error,
        input: properties.input ?? part.state.input,
        outputPaths: Array.isArray(properties.outputPaths) ? properties.outputPaths.filter((path): path is string => typeof path === "string") : part.state.outputPaths,
        result: properties.result ?? part.state.result,
        status,
        structured: properties.structured ?? part.state.structured,
      },
      time: { ...part.time, completed: status === "completed" || status === "error" ? Date.now() : part.time.completed },
    }));
  }

  if (type === "session.step.started") {
    const model = asRecord(properties.model);
    const rawVariant = stringValue(model?.variant);
    return updateAssistant(messages, messageID, (message) => ({
      ...message,
      agent: stringValue(properties.agent, message.agent),
      model: {
        id: stringValue(model?.modelID) || stringValue(model?.id) || message.model.id,
        providerID: stringValue(model?.providerID) || message.model.providerID,
        variant: rawVariant ? (rawVariant === "default" ? undefined : rawVariant) : message.model.variant,
      },
    }));
  }

  if (type === "session.step.ended") {
    return updateAssistant(messages, messageID, (message) => ({
      ...message,
      finish: stringValue(properties.finish, message.finish),
      tokens: parseTokenUsage(properties.tokens) ?? message.tokens,
    }));
  }

  if (type === "session.step.failed") {
    const error = asRecord(properties.error);
    return updateAssistant(messages, messageID, (message) => ({
      ...message,
      error: stringValue(properties.error)
        || stringValue(asRecord(error?.data)?.message)
        || stringValue(error?.message)
        || stringValue(error?.name)
        || "OpenCode 执行失败",
    }));
  }

  return messages;
};

export const reconcileSessionMessages = (
  current: SessionMessage[],
  incoming: SessionMessage[]
): SessionMessage[] => {
  const currentByID = new Map(current.map((message) => [message.id, message]));
  const unique = new Map<string, SessionMessage>();
  incoming.forEach((message) => {
    const previous = currentByID.get(message.id);
    if (!previous || previous.type !== "assistant" || message.type !== "assistant") {
      unique.set(message.id, message);
      return;
    }
    unique.set(message.id, {
      ...previous,
      ...message,
      // The fetched V2 message is authoritative. Keeping obsolete live parts
      // here caused duplicate nodes and a visible collapse/re-mount at finish.
      content: message.content.length > 0 ? message.content : previous.content,
      error: message.error ?? previous.error,
      finish: message.finish ?? previous.finish,
      parentID: message.parentID ?? previous.parentID,
      snapshot: message.snapshot ?? previous.snapshot,
      tokens: hasTokenUsage(message.tokens) ? message.tokens : previous.tokens,
    });
  });
  current
    .filter((message) => message.type === "user" && !unique.has(message.id))
    .forEach((message) => unique.set(message.id, message));
  return [...unique.values()].sort(
    (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0)
  );
};

export const applyOpenCodeEvent = (messages: SessionMessage[], event: OpenCodeEvent): SessionMessage[] => {
  const properties = event.properties ?? event.data ?? {};
  const type = eventType(event);
  if (type && (
    type.startsWith("session.next.") ||
    type.startsWith("session.step.") ||
    type.startsWith("session.text.") ||
    type.startsWith("session.reasoning.") ||
    type.startsWith("session.tool.")
  )) return applyStreamEvent(messages, type, properties);
  if (type === "message.updated") return applyMessageInfo(messages, properties);
  if (type === "message.part.updated") return applyPartUpdate(messages, properties);
  if (type === "message.part.delta") {
    const field = stringValue(properties.field, "text").toLowerCase();
    return applyPartDelta(messages, properties, field.includes("reasoning") ? "reasoning" : "text");
  }
  if (type === "message.part.removed") {
    const messageID = stringValue(properties.messageID);
    const partID = stringValue(properties.partID);
    if (!messageID || !partID) return messages;
    return updateAssistant(messages, messageID, (message) => ({
      ...message,
      content: message.content.filter((part) => part.id !== partID),
    }));
  }
  if (type === "message.removed") {
    const messageID = stringValue(properties.messageID);
    return messageID ? messages.filter((message) => message.id !== messageID) : messages;
  }
  return messages;
};
