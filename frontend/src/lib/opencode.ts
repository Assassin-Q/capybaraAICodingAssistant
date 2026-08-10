import { nanoid } from "nanoid";

import type {
  AgentInfo,
  AssistantReasoningPart,
  AssistantTextPart,
  AssistantToolPart,
  CommandInfo,
  McpStatus,
  ModelInfo,
  ModelRef,
  OpenCodeConfig,
  OpenCodeEvent,
  PermissionReply,
  PermissionRequest,
  PermissionRule,
  PromptAttachment,
  ProviderCatalog,
  QuestionRequest,
  SendPromptInput,
  SessionInfo,
  SessionFileDiff,
  SessionMessage,
  SessionStatusInfo,
  SkillInfo,
  TodoInfo,
  UserMessage,
} from "@/lib/opencodeTypes";
import {
  inferApprovalMode,
  legacySessionRules,
  normalizePermissionRules,
  rulesForApprovalMode,
  type ApprovalMode,
} from "@/lib/approvalMode";
import { attachPersonaContext, stripPersonaContext } from "@/lib/personaContext";
import {
  connectedModels,
  mergeProviderCatalogs,
  parseModelList,
  parseProviderCatalog,
  parseV2ProviderCatalog,
} from "@/lib/providerCatalog";
import { extractTextAttachments } from "@/lib/textAttachments";
import { EMPTY_TOKEN_USAGE, parseTokenUsage } from "@/lib/tokenUsage";
import { t } from "@/lib/i18n";

export type * from "@/lib/opencodeTypes";

const DEFAULT_BASE_URL = "http://127.0.0.1:12001";

let activeOpenCodeBaseUrl = (
  import.meta.env.VITE_OPENCODE_BASE_URL || DEFAULT_BASE_URL
).replace(/\/$/, "");

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const permissionRules = (value: unknown): PermissionRule[] => normalizePermissionRules(value);

const errorMessage = (value: unknown): string => {
  const message = stringValue(value);
  if (!message) return "";
  try {
    const parsed = JSON.parse(message) as unknown;
    return typeof parsed === "string" ? parsed : message;
  } catch {
    return message;
  }
};

const arrayValue = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record?.value)) return record.value;
  if (Array.isArray(record?.data)) return record.data;
  if (Array.isArray(record?.items)) return record.items;
  return [];
};

const recordArray = (value: unknown): Record<string, unknown>[] =>
  arrayValue(value)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));

type QueryValue = string | number | boolean | { [key: string]: QueryValue } | QueryValue[] | undefined;

const locationParams = (directory?: string): Record<string, QueryValue> | undefined =>
  directory ? { location: { directory } } : undefined;

const directoryParams = (directory?: string): Record<string, QueryValue> | undefined =>
  directory ? { directory } : undefined;

const appendQuery = (params: URLSearchParams, key: string, value: QueryValue): void => {
  if (value === undefined || value === "") return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendQuery(params, key, item));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([child, item]) => appendQuery(params, `${key}[${child}]`, item));
    return;
  }
  params.set(key, String(value));
};

const buildUrl = (
  path: string,
  params?: Record<string, QueryValue>
) => {
  const url = new URL(`${activeOpenCodeBaseUrl}${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => appendQuery(url.searchParams, key, value));
  return url.toString();
};

const unwrapData = <T>(value: unknown): T => {
  const record = asRecord(value);
  return (record && Object.prototype.hasOwnProperty.call(record, "data") ? record.data : value) as T;
};

const responseError = async (response: Response): Promise<Error> => {
  const body = await response.text().catch(() => "");
  if (!body) {
    return new Error(t("s_c9c5901e35", { p0: response.status }));
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    const record = asRecord(parsed);
    const error = asRecord(record?.error);
    const message = errorMessage(record?.message)
      || errorMessage(asRecord(record?.data)?.message)
      || errorMessage(error?.message)
      || errorMessage(asRecord(error?.data)?.message);
    return new Error(message || body);
  } catch {
    return new Error(body);
  }
};

const request = async <T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, QueryValue>
): Promise<T> => {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (text.trimStart().startsWith("<")) {
      throw new Error(t("s_af2cf1abbb"));
    }
    throw new Error(t("s_cd976b7289"));
  }
};

const toModelRef = (value: unknown): ModelRef | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id) || stringValue(record?.modelID);
  const providerID = stringValue(record?.providerID);
  if (!id || !providerID) return undefined;
  const variant = stringValue(record?.variant);
  return { id, providerID, ...(variant && variant !== "default" ? { variant } : {}) };
};

const toSession = (value: unknown, directory?: string): SessionInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id);
  if (!id) return undefined;
  const time = asRecord(record?.time);
  const location = asRecord(record?.location);
  const rawDirectory = stringValue(record?.directory) || stringValue(location?.directory, directory ?? "");
  return {
    agent: stringValue(record?.agent) || undefined,
    id,
    location: {
      directory: rawDirectory,
      workspaceID: stringValue(record?.workspaceID) || stringValue(location?.workspaceID) || undefined,
    },
    model: toModelRef(record?.model),
    parentID: stringValue(record?.parentID) || undefined,
    projectID: stringValue(record?.projectID),
    subpath: stringValue(record?.subpath) || stringValue(record?.path) || undefined,
    time: {
      archived: numberValue(time?.archived) || undefined,
      created: numberValue(time?.created, Date.now()),
      updated: numberValue(time?.updated, numberValue(time?.created, Date.now())),
    },
    title: stringValue(record?.title, "New session"),
  };
};

const toAssistantPart = (
  value: unknown
): AssistantTextPart | AssistantReasoningPart | AssistantToolPart | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id);
  const type = stringValue(record?.type);
  if (!id) return undefined;
  if (type === "text") {
    return { id, text: stringValue(record?.text), type };
  }
  if (type === "reasoning") {
    const time = asRecord(record?.time);
    return {
      id,
      text: stringValue(record?.text),
      time: time ? {
        completed: numberValue(time.completed) || undefined,
        created: numberValue(time.created) || numberValue(time.start) || undefined,
      } : undefined,
      type,
    };
  }
  if (type !== "tool") return undefined;
  const state = asRecord(record?.state) ?? {};
  const stateStatus = stringValue(state.status, "pending");
  const time = asRecord(record?.time) ?? asRecord(state.time) ?? {};
  return {
    id,
    name: stringValue(record?.name) || stringValue(record?.tool, "tool"),
    state: {
      content: state.content,
      error: state.error,
      input: state.input,
      // The `task` tool reports its subagent session here as `sessionId`, and it is populated
      // while the tool is still running — the only place that link exists before the tool ends.
      metadata: asRecord(state.metadata),
      outputPaths: stringArray(state.outputPaths),
      result: state.result ?? state.output,
      status: stateStatus === "running" || stateStatus === "completed" || stateStatus === "error"
        ? stateStatus
        : "pending",
      structured: state.structured,
    },
    time: {
      completed: numberValue(time.completed) || numberValue(time.end) || undefined,
      created: numberValue(time.created) || numberValue(time.start) || Date.now(),
      ran: numberValue(time.ran) || numberValue(time.start) || undefined,
    },
    type,
  };
};

const toSessionMessage = (value: unknown): SessionMessage | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const info = asRecord(record.info) ?? record;
  const id = stringValue(info.id);
  if (!id) return undefined;
  const time = asRecord(info.time);
  const role = stringValue(info.role);
  const type = stringValue(info.type);
  const parts = recordArray(record.parts ?? record.content ?? info.parts ?? info.content);
  /**
   * Compaction is not a message type, despite reading like one.
   *
   * OpenCode marks it as a *user* message carrying a part of type `compaction`, and puts the
   * summary on the assistant reply. Verified against the shipped runtime, which selects it with
   * `info.role !== "user" || !parts.some(p => p.type === "compaction")`. Left alone it fell into
   * the branch below and rendered as an empty user bubble, because it has no text parts.
   */
  const compactionPart = parts.find((part) => part.type === "compaction");
  if (compactionPart) {
    return {
      // `auto` separates the pass OpenCode runs when the window fills from one the user asked
      // for. Only the automatic one needs explaining — nobody wonders why the history changed
      // right after they pressed compact. Verified on a live session: the part carries
      // { type: "compaction", auto: boolean }, and the summary text is the *next* assistant
      // message (info.summary === true), which renders on its own.
      auto: compactionPart.auto === true,
      id,
      time: { created: numberValue(time?.created, Date.now()) },
      type: "compaction",
    };
  }
  if (role === "user" || type === "user") {
    const textParts = parts.filter((part) => part.type === "text");
    const subtask = parts.find((part) => part.type === "subtask");
    const command = stringValue(subtask?.command);
    if (!subtask && textParts.length > 0 && textParts.every((part) => part.synthetic === true)) {
      return undefined;
    }
    const partFiles = parts
      .filter((part) => part.type === "file")
      .map((part) => ({
        mime: stringValue(part.mime) || undefined,
        name: stringValue(part.filename) || undefined,
        uri: stringValue(part.url),
      }))
      .filter((file) => Boolean(file.uri));
    const messageFiles = recordArray(record.files ?? info.files)
      .map((file) => ({
        mime: stringValue(file.mime) || undefined,
        name: stringValue(file.name) || undefined,
        uri: stringValue(file.uri),
      }))
      .filter((file) => Boolean(file.uri));
    const rawText = command ? `/${command}` : stringValue(info.text) || textParts
      .map((part) => stringValue(part.text))
      .join("");
    const embedded = extractTextAttachments(stripPersonaContext(rawText));
    const files = [...partFiles, ...messageFiles, ...embedded.files].filter((file, index, all) =>
      all.findIndex((candidate) => candidate.uri === file.uri && candidate.name === file.name) === index
    );
    return {
      files: files.length > 0 ? files : undefined,
      id,
      text: embedded.text,
      time: { created: numberValue(time?.created, Date.now()) },
      type: "user",
    };
  }
  if (role === "assistant" || type === "assistant") {
    const content = parts
      .map(toAssistantPart)
      .filter((part): part is AssistantTextPart | AssistantReasoningPart | AssistantToolPart => Boolean(part));
    const rawSnapshot = asRecord(info.snapshot);
    const snapshotStart = stringValue(rawSnapshot?.start);
    return {
      agent: stringValue(info.agent),
      content,
      error: errorMessage(asRecord(info.error)?.data && asRecord(asRecord(info.error)?.data)?.message)
        || errorMessage(asRecord(info.error)?.message)
        || undefined,
      finish: stringValue(info.finish) || undefined,
      id,
      parentID: stringValue(info.parentID) || undefined,
      model: toModelRef(info.model) ?? {
        id: stringValue(info.modelID),
        providerID: stringValue(info.providerID),
        variant: stringValue(info.variant) && stringValue(info.variant) !== "default"
          ? stringValue(info.variant)
          : undefined,
      },
      tokens: parseTokenUsage(record.tokens ?? info.tokens) ?? EMPTY_TOKEN_USAGE,
      snapshot: snapshotStart ? {
        end: stringValue(rawSnapshot?.end) || undefined,
        files: stringArray(rawSnapshot?.files),
        start: snapshotStart,
      } : undefined,
      time: {
        completed: numberValue(time?.completed) || undefined,
        created: numberValue(time?.created, Date.now()),
      },
      type: "assistant",
    };
  }
  const messageType = type === "agent-switched" || type === "model-switched" || type === "synthetic" || type === "shell" || type === "compaction"
    ? type
    : "system";
  return {
    agent: stringValue(info.agent) || undefined,
    id,
    model: toModelRef(info.model),
    text: stringValue(info.text) || stringValue(info.summary),
    time: { created: numberValue(time?.created, Date.now()) },
    type: messageType,
  };
};

const toAgent = (value: unknown): AgentInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.name) || stringValue(record?.id);
  const mode = stringValue(record?.mode, "primary");
  if (!id || (mode !== "primary" && mode !== "subagent" && mode !== "all")) return undefined;
  return {
    description: stringValue(record?.description) || undefined,
    disabled: Boolean(record?.disable),
    hidden: Boolean(record?.hidden),
    id,
    mode,
    model: toModelRef(record?.model),
    system: stringValue(record?.prompt) || stringValue(record?.system) || undefined,
  };
};

const toSkill = (value: unknown): SkillInfo | undefined => {
  const record = asRecord(value);
  const name = stringValue(record?.name);
  if (!name) return undefined;
  return {
    content: stringValue(record?.content),
    description: stringValue(record?.description) || undefined,
    location: stringValue(record?.location),
    name,
    slash: Boolean(record?.slash),
  };
};

const toCommand = (value: unknown): CommandInfo | undefined => {
  const record = asRecord(value);
  const name = stringValue(record?.name);
  if (!name) return undefined;
  return {
    description: stringValue(record?.description) || undefined,
    hints: stringArray(record?.hints),
    name,
    source: stringValue(record?.source) || undefined,
    template: stringValue(record?.template) || undefined,
  };
};

const toPermission = (value: unknown): PermissionRequest | undefined => {
  const raw = asRecord(value);
  const record = asRecord(raw?.request) ?? asRecord(raw?.info) ?? raw;
  const id = stringValue(record?.id)
    || stringValue(record?.requestID)
    || stringValue(record?.permissionID)
    || stringValue(raw?.requestID)
    || stringValue(raw?.permissionID);
  const sessionID = stringValue(record?.sessionID) || stringValue(raw?.sessionID);
  if (!id || !sessionID) return undefined;
  return {
    action: stringValue(record?.permission)
      || stringValue(record?.action)
      || stringValue(record?.tool)
      || "permission",
    id,
    metadata: asRecord(record?.metadata),
    resources: stringArray(record?.patterns).length > 0
      ? stringArray(record?.patterns)
      : stringArray(record?.resources).length > 0
        ? stringArray(record?.resources)
        : stringArray(record?.paths),
    save: stringArray(record?.always).length > 0 ? stringArray(record?.always) : stringArray(record?.save),
    sessionID,
  };
};

export const toQuestionRequest = (value: unknown): QuestionRequest | undefined => {
  const raw = asRecord(value);
  const record = asRecord(raw?.request) ?? asRecord(raw?.info) ?? raw;
  if (!record) return undefined;
  const id = stringValue(record?.id);
  const sessionID = stringValue(record?.sessionID) || stringValue(raw?.sessionID);
  if (!id || !sessionID) return undefined;
  const questions = recordArray(record?.questions ?? record?.data).map((question) => ({
    custom: question.custom !== false,
    header: stringValue(question.header),
    multiple: question.multiple === true,
    options: recordArray(question.options).map((option) => ({
      description: stringValue(option.description),
      label: stringValue(option.label),
    })),
    question: stringValue(question.question),
  }));
  return questions.length > 0 ? { id, questions, sessionID } : undefined;
};

const toTodo = (value: unknown): TodoInfo | undefined => {
  const record = asRecord(value);
  const content = stringValue(record?.content);
  if (!content) return undefined;
  return {
    content,
    id: stringValue(record?.id) || undefined,
    priority: stringValue(record?.priority, "medium"),
    status: stringValue(record?.status, "pending"),
  };
};

export const toTodoList = (value: unknown): TodoInfo[] => {
  const record = asRecord(value);
  return recordArray(record?.todos ?? value).map(toTodo).filter((item): item is TodoInfo => Boolean(item));
};

const toSessionFileDiff = (value: unknown): SessionFileDiff | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const status = stringValue(record.status);
  return {
    additions: numberValue(record.additions),
    deletions: numberValue(record.deletions),
    file: stringValue(record.file) || undefined,
    patch: stringValue(record.patch) || undefined,
    status: status === "added" || status === "deleted" || status === "modified" ? status : undefined,
  };
};

export const createMessageID = (): string => `msg_${nanoid(18)}`;

export const createOptimisticUserMessage = (
  id: string,
  text: string,
  files: PromptAttachment[]
): UserMessage => ({
  files: files.length > 0 ? files.map((file) => ({ mime: file.mime, name: file.name, uri: file.uri })) : undefined,
  id,
  text,
  time: { created: Date.now() },
  type: "user",
});

export const setOpenCodeBaseUrl = (baseUrl: string) => {
  activeOpenCodeBaseUrl = baseUrl.replace(/\/$/, "");
};

export const getOpenCodeBaseUrl = () => activeOpenCodeBaseUrl;

export const openCodeApi = {
  health: () => request<{ healthy: boolean; version?: string }>("/api/health"),

  listModels: async (directory?: string): Promise<ModelInfo[]> => {
    const [v2Response, legacyResponse] = await Promise.all([
      request<unknown>("/api/model", undefined, locationParams(directory)).catch(() => undefined),
      request<unknown>("/provider", undefined, directoryParams(directory)).catch(() => undefined),
    ]);
    const v2Models = parseModelList(v2Response);
    const legacyModels = connectedModels(parseProviderCatalog(legacyResponse));
    if (v2Models.length === 0) return legacyModels;
    const legacyByKey = new Map(legacyModels.map((model) => [`${model.providerID}/${model.id}`, model]));
    return v2Models
      .map((model) => {
        const legacy = legacyByKey.get(`${model.providerID}/${model.id}`);
        return {
          ...legacy,
          ...model,
          variants: Object.keys(model.variants ?? {}).length > 0
            ? model.variants
            : legacy?.variants,
        };
      })
      .filter((model) => model.enabled !== false && model.status !== "deprecated");
  },

  listProviderCatalog: async (directory?: string): Promise<ProviderCatalog> => {
    const [legacyResponse, v2ProviderResponse, v2ModelResponse] = await Promise.all([
      request<unknown>("/provider", undefined, directoryParams(directory)).catch(() => undefined),
      request<unknown>("/api/provider", undefined, locationParams(directory)).catch(() => undefined),
      request<unknown>("/api/model", undefined, locationParams(directory)).catch(() => undefined),
    ]);
    const legacy = parseProviderCatalog(legacyResponse);
    if (v2ProviderResponse === undefined) return legacy;
    return mergeProviderCatalogs(legacy, parseV2ProviderCatalog(v2ProviderResponse, v2ModelResponse));
  },

  getConfig: (directory?: string) =>
    request<OpenCodeConfig>("/config", undefined, directoryParams(directory)),

  updateConfig: (config: OpenCodeConfig, directory?: string) =>
    request<OpenCodeConfig>("/config", {
      body: JSON.stringify(config),
      method: "PATCH",
    }, directoryParams(directory)),

  listSessions: async (directory?: string, search?: string): Promise<SessionInfo[]> => {
    const response = await request<unknown>("/api/session", undefined, {
      ...directoryParams(directory),
      limit: 80,
      search,
      order: "desc",
    });
    return recordArray(unwrapData<unknown>(response))
      .map((item) => toSession(item, directory))
      .filter((item): item is SessionInfo => item !== undefined && !item.parentID);
  },

  /**
   * Subagent sessions spawned by the `task` tool.
   *
   * These are deliberately absent from `listSessions`, which drops anything with a parentID so the
   * session list stays a list of conversations the user started. They are reached from the task
   * card that created them instead.
   */
  listChildSessions: async (parentID: string, directory?: string): Promise<SessionInfo[]> => {
    const response = await request<unknown>(
      `/session/${encodeURIComponent(parentID)}/children`,
      undefined,
      directoryParams(directory)
    );
    return recordArray(unwrapData<unknown>(response))
      .map((item) => toSession(item, directory))
      .filter((item): item is SessionInfo => item !== undefined);
  },

  /** Reads one session by id, which is how a child is opened without being in any list. */
  getSession: async (sessionID: string, directory?: string): Promise<SessionInfo | undefined> => {
    const response = await request<unknown>(
      `/session/${encodeURIComponent(sessionID)}`,
      undefined,
      directoryParams(directory)
    );
    return toSession(unwrapData<unknown>(response), directory);
  },

  createSession: async (directory?: string, model?: ModelRef, agent?: string) => {
    const response = await request<unknown>("/api/session", {
      body: JSON.stringify({
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
        ...(directory ? { location: { directory } } : {}),
      }),
      method: "POST",
    });
    const session = toSession(unwrapData<unknown>(response), directory);
    if (!session) throw new Error(t("s_f3d0f756f6"));
    return session;
  },

  renameSession: async (sessionID: string, title: string, directory?: string) => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, {
      body: JSON.stringify({ title }),
      method: "PATCH",
    }, directoryParams(directory));
    const session = toSession(unwrapData<unknown>(response), directory);
    if (!session) throw new Error(t("s_f3d0f756f6"));
    return session;
  },

  deleteSession: (sessionID: string, directory?: string) =>
    request<boolean>(`/session/${encodeURIComponent(sessionID)}`, {
      method: "DELETE",
    }, directoryParams(directory)),

  getMessages: async (sessionID: string, directory?: string): Promise<SessionMessage[]> => {
    const response = await request<unknown>(`/api/session/${encodeURIComponent(sessionID)}/message`, undefined, {
      ...directoryParams(directory),
      limit: 200,
      order: "asc",
    });
    return recordArray(unwrapData<unknown>(response)).map(toSessionMessage).filter((item): item is SessionMessage => Boolean(item));
  },

  getSessionStatus: async (sessionID: string, directory?: string): Promise<SessionStatusInfo> => {
    const response = await request<unknown>("/api/session/active", undefined, directoryParams(directory));
    const active = asRecord(unwrapData<unknown>(response)) ?? {};
    return {
      type: active[sessionID] ? "busy" : "idle",
    };
  },

  waitForSession: (sessionID: string, directory?: string) =>
    request<void>(`/api/session/${encodeURIComponent(sessionID)}/wait`, {
      method: "POST",
    }, directoryParams(directory)),

  getSessionPermissionRules: async (sessionID: string, directory?: string): Promise<PermissionRule[]> => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, undefined, directoryParams(directory));
    return permissionRules(asRecord(unwrapData(response))?.permission);
  },

  getSessionApprovalMode: async (sessionID: string, directory?: string): Promise<ApprovalMode> => {
    const rules = await openCodeApi.getSessionPermissionRules(sessionID, directory);
    if (rules.length === 0) {
      await openCodeApi.setSessionApprovalMode(sessionID, "ask", directory);
      return "ask";
    }
    return inferApprovalMode(rules);
  },

  setSessionApprovalMode: async (sessionID: string, mode: ApprovalMode, directory?: string): Promise<void> => {
    const currentRules = await openCodeApi.getSessionPermissionRules(sessionID, directory);
    if (currentRules.length > 0 && inferApprovalMode(currentRules) === mode) return;
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, {
      body: JSON.stringify({ permission: legacySessionRules(rulesForApprovalMode(mode)) }),
      method: "PATCH",
    }, directoryParams(directory));
    const savedRules = permissionRules(asRecord(unwrapData(response))?.permission);
    if (inferApprovalMode(savedRules) !== mode) {
      throw new Error(t("s_62da5c5bc1"));
    }
  },

  /**
   * Rewinds the session to just before `messageID`, dropping everything after it.
   *
   * A failed turn leaves an empty assistant message (0 in / 0 out) in the history, and every
   * later request carries it along — one provider rejection can poison the rest of the session.
   */
  revertSession: (sessionID: string, messageID: string, directory?: string) =>
    request<unknown>(`/session/${encodeURIComponent(sessionID)}/revert`, {
      body: JSON.stringify({ messageID }),
      method: "POST",
    }, directoryParams(directory)),

  /** Undoes the last revert. */
  unrevertSession: (sessionID: string, directory?: string) =>
    request<unknown>(`/session/${encodeURIComponent(sessionID)}/unrevert`, {
      method: "POST",
    }, directoryParams(directory)),

  /**
   * Compacts the session — the same thing OpenCode's own `session.compact` binding does.
   *
   * `auto: false` marks it as user-requested rather than the automatic pass that fires when the
   * context window fills up. The model is taken from the caller so the summary is not written by
   * whatever default OpenCode would otherwise pick.
   */
  compactSession: (
    sessionID: string,
    input: { directory?: string; modelID?: string; providerID?: string } = {}
  ) =>
    request<unknown>(`/session/${encodeURIComponent(sessionID)}/summarize`, {
      body: JSON.stringify({
        auto: false,
        ...(input.providerID ? { providerID: input.providerID } : {}),
        ...(input.modelID ? { modelID: input.modelID } : {}),
      }),
      method: "POST",
    }, directoryParams(input.directory)),

  /** Copies the session up to `messageID` into a new one, leaving the original untouched. */
  forkSession: async (sessionID: string, messageID: string, directory?: string): Promise<SessionInfo> => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}/fork`, {
      body: JSON.stringify({ messageID }),
      method: "POST",
    }, directoryParams(directory));
    const session = toSession(unwrapData<unknown>(response), directory);
    if (!session) throw new Error(t("s_f3d0f756f6"));
    return session;
  },

  sendPrompt: async (sessionID: string, input: SendPromptInput) => {
    const messageID = input.messageID ?? createMessageID();
    if (!input.text.trim() && (input.files ?? []).length === 0) throw new Error(t("s_3c383555f8"));
    await request<unknown>(`/api/session/${encodeURIComponent(sessionID)}/prompt`, {
      body: JSON.stringify({
        id: messageID,
        prompt: {
          text: attachPersonaContext(input.text, input.personaInstructions),
          ...(input.files && input.files.length > 0 ? {
            files: input.files.map((file) => ({ uri: file.uri, ...(file.name ? { name: file.name } : {}) })),
          } : {}),
          ...(input.agents && input.agents.length > 0 ? {
            agents: input.agents.map((agent) => ({
              name: agent.name,
              ...(agent.source ? { source: agent.source } : {}),
            })),
          } : {}),
        },
        delivery: "queue",
        resume: true,
      }),
      method: "POST",
    }, directoryParams(input.directory));
    return messageID;
  },

  interrupt: (sessionID: string, directory?: string) =>
    request<void>(`/api/session/${encodeURIComponent(sessionID)}/interrupt`, { method: "POST" }, directoryParams(directory)),

  initSession: (
    sessionID: string,
    model: ModelRef,
    messageID: string,
    directory?: string
  ) => openCodeApi.executeCommand(sessionID, "init", "", {
    agent: undefined,
    directory,
    files: [],
    messageID,
    model,
  }).then(() => undefined),

  switchAgent: (sessionID: string, agent: string, directory?: string) =>
    request<void>(`/api/session/${encodeURIComponent(sessionID)}/agent`, {
      body: JSON.stringify({ agent }),
      method: "POST",
    }, directoryParams(directory)),

  switchModel: (sessionID: string, model: ModelRef, directory?: string) =>
    request<void>(`/api/session/${encodeURIComponent(sessionID)}/model`, {
      body: JSON.stringify({ model }),
      method: "POST",
    }, directoryParams(directory)),

  setProviderAuth: (providerID: string, key: string, directory?: string) =>
    request<void>(`/api/integration/${encodeURIComponent(providerID)}/connect/key`, {
      body: JSON.stringify({ key }),
      method: "POST",
    }, locationParams(directory)),

  removeProviderAuth: async (providerID: string, directory?: string) => {
    const response = await request<unknown>(`/api/integration/${encodeURIComponent(providerID)}`, undefined, locationParams(directory));
    const integration = asRecord(unwrapData<unknown>(response));
    const credential = recordArray(integration?.connections).find((connection) =>
      stringValue(connection.type) === "credential" && Boolean(stringValue(connection.id))
    );
    if (!credential) throw new Error(t("s_de519171f7"));
    await request<void>(`/api/credential/${encodeURIComponent(stringValue(credential.id))}`, {
      method: "DELETE",
    }, locationParams(directory));
  },

  listAgents: async (directory?: string): Promise<AgentInfo[]> => {
    const response = await request<unknown>("/api/agent", undefined, locationParams(directory));
    return recordArray(unwrapData<unknown>(response)).map(toAgent).filter((item): item is AgentInfo => Boolean(item));
  },

  listSkills: async (directory?: string): Promise<SkillInfo[]> => {
    const response = await request<unknown>("/api/skill", undefined, locationParams(directory));
    return recordArray(unwrapData<unknown>(response)).map(toSkill).filter((item): item is SkillInfo => Boolean(item));
  },

  listCommands: async (directory?: string): Promise<CommandInfo[]> => {
    const response = await request<unknown>("/api/command", undefined, locationParams(directory));
    return recordArray(unwrapData<unknown>(response)).map(toCommand).filter((item): item is CommandInfo => Boolean(item));
  },

  executeCommand: async (
    sessionID: string,
    command: string,
    argumentsText: string,
    input: Omit<SendPromptInput, "text">
  ) => {
    const messageID = input.messageID ?? createMessageID();
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}/command`, {
      body: JSON.stringify({
        agent: input.agent,
        arguments: argumentsText,
        command,
        messageID,
        model: input.model ? `${input.model.providerID}/${input.model.id}` : undefined,
        parts: input.files?.map((file) => ({
          filename: file.name,
          id: `prt_${nanoid(18)}`,
          mime: file.mime,
          type: "file",
          url: file.uri,
        })),
        variant: input.model?.variant,
      }),
      method: "POST",
    }, directoryParams(input.directory));
    return { message: toSessionMessage(unwrapData<unknown>(response)), messageID };
  },

  listMcp: async (directory?: string): Promise<Record<string, McpStatus>> => {
    const response = await request<unknown>("/mcp", undefined, directoryParams(directory));
    return (asRecord(response) ?? {}) as Record<string, McpStatus>;
  },

  listPermissions: async (sessionID: string, directory?: string): Promise<PermissionRequest[]> => {
    const response = await request<unknown>(`/api/session/${encodeURIComponent(sessionID)}/permission`, undefined, directoryParams(directory));
    return recordArray(unwrapData<unknown>(response)).map(toPermission).filter((item): item is PermissionRequest => Boolean(item));
  },

  /**
   * OpenCode runs two permission systems side by side, and a request lands in exactly one.
   *
   * Verified against a live server: a pending `bash` request appeared in `GET /permission` while
   * `GET /api/session/{id}/permission` reported an empty list for the very same session, and each
   * system only answers to its own reply route. Listing one and replying through the other is why
   * a card could vanish without the run continuing — the reply 404'd against the wrong registry.
   *
   * So the global route is tried first and the session-scoped one is the fallback. Whichever
   * system owns the request accepts it; a 404 from the first only means "not mine".
   */
  replyPermission: async (sessionID: string, requestID: string, reply: PermissionReply, directory?: string) => {
    try {
      await request<void>(`/permission/${encodeURIComponent(requestID)}/reply`, {
        body: JSON.stringify({ reply }),
        method: "POST",
      }, directoryParams(directory));
      return;
    } catch (error) {
      if (!/not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
    await request<void>(
      `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
      { body: JSON.stringify({ reply }), method: "POST" },
      directoryParams(directory)
    );
  },

  /** Pending requests across all sessions — the registry the session-scoped list does not see. */
  listPendingPermissions: async (directory?: string): Promise<PermissionRequest[]> => {
    const response = await request<unknown>("/permission", undefined, directoryParams(directory));
    return recordArray(unwrapData<unknown>(response))
      .map(toPermission)
      .filter((item): item is PermissionRequest => Boolean(item));
  },

  listQuestions: async (sessionID: string, directory?: string): Promise<QuestionRequest[]> => {
    const response = await request<unknown>(`/api/session/${encodeURIComponent(sessionID)}/question`, undefined, directoryParams(directory));
    return recordArray(unwrapData<unknown>(response)).map(toQuestionRequest).filter((item): item is QuestionRequest => Boolean(item));
  },

  replyQuestion: (sessionID: string, requestID: string, answers: string[][], directory?: string) =>
    request<boolean>(`/api/session/${encodeURIComponent(sessionID)}/question/${encodeURIComponent(requestID)}/reply`, {
      body: JSON.stringify({ answers }),
      method: "POST",
    }, directoryParams(directory)).then(() => undefined),

  rejectQuestion: (sessionID: string, requestID: string, directory?: string) =>
    request<boolean>(`/api/session/${encodeURIComponent(sessionID)}/question/${encodeURIComponent(requestID)}/reject`, { method: "POST" }, directoryParams(directory)).then(() => undefined),

  getTodos: async (sessionID: string, directory?: string): Promise<TodoInfo[]> => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}/todo`, undefined, directoryParams(directory));
    return toTodoList(unwrapData<unknown>(response));
  },

  getDiff: async (sessionID: string, messageID: string, directory?: string): Promise<SessionFileDiff[]> => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}/diff`, undefined, {
      ...directoryParams(directory),
      messageID,
    });
    return recordArray(unwrapData<unknown>(response))
      .map(toSessionFileDiff)
      .filter((item): item is SessionFileDiff => Boolean(item));
  },
};

export const subscribeOpenCodeEvents = (
  directory: string | undefined,
  onEvent: (event: OpenCodeEvent) => void,
  onError?: () => void
) => {
  const source = new EventSource(buildUrl("/api/event", locationParams(directory)));
  const handleEvent = (message: MessageEvent<string>) => {
    if (!message.data) return;
    try {
      const parsed = JSON.parse(message.data) as Record<string, unknown>;
      const payload = asRecord(parsed.payload) ?? parsed;
      const properties = asRecord(payload.properties) ?? asRecord(payload.data) ?? {};
      onEvent({
        data: properties,
        id: stringValue(payload.id) || stringValue(parsed.id) || message.lastEventId || undefined,
        properties,
        type: stringValue(payload.type) || stringValue(parsed.type) || message.type,
      });
    } catch {
      onEvent({ properties: { raw: message.data }, type: message.type });
    }
  };
  source.onmessage = handleEvent;
  source.onerror = () => onError?.();
  return () => source.close();
};
