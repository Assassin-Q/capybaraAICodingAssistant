import { nanoid } from "nanoid";

import type {
  AgentInfo,
  AssistantReasoningPart,
  AssistantTextPart,
  AssistantToolPart,
  CommandInfo,
  McpStatus,
  ModelInfo,
  ModelModality,
  ModelRef,
  OpenCodeConfig,
  OpenCodeEvent,
  PermissionReply,
  PermissionRequest,
  PermissionRule,
  PromptAttachment,
  ProviderCatalog,
  ProviderInfo,
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
import { attachPersonaContext, stripPersonaContext } from "@/lib/personaContext";
import { extractTextAttachments } from "@/lib/textAttachments";

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

const permissionRules = (value: unknown): PermissionRule[] => recordArray(value).flatMap((item) => {
  const action = stringValue(item.action);
  const pattern = stringValue(item.pattern);
  const permission = stringValue(item.permission);
  return action === "allow" || action === "ask" || action === "deny"
    ? [{ action, pattern, permission }]
    : [];
});

const networkEnabledFromRules = (rules: PermissionRule[]): boolean => {
  const actionFor = (permission: string) => [...rules].reverse().find((rule) =>
    (rule.permission === permission || rule.permission === "*") && rule.pattern === "*"
  )?.action;
  return actionFor("websearch") !== "deny" && actionFor("webfetch") !== "deny";
};

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

const recordStringMap = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, stringValue(item)] as const)
      .filter(([, item]) => Boolean(item))
  );
};

const normalizeModelVariants = (value: unknown): Record<string, Record<string, unknown>> | undefined => {
  if (Array.isArray(value)) {
    const variants = Object.fromEntries(
      value
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => {
          const id = stringValue(item.id);
          if (!id) return undefined;
          const body = asRecord(item.body) ?? {};
          const headers = asRecord(item.headers);
          return [id, headers ? { ...body, headers } : body] as const;
        })
        .filter((item): item is readonly [string, Record<string, unknown>] => Boolean(item))
    );
    // `/api/model` uses an empty array to explicitly state that the runtime
    // model has no selectable variants. Preserve that signal so stale catalog
    // variants cannot be merged back into the active model.
    return variants;
  }

  const record = asRecord(value);
  if (!record) return undefined;
  const variants = Object.fromEntries(
    Object.entries(record).filter(([, variant]) => Boolean(asRecord(variant)))
  ) as Record<string, Record<string, unknown>>;
  return variants;
};

const mergeModelInfo = (base: ModelInfo, incoming: ModelInfo): ModelInfo => ({
  ...base,
  ...incoming,
  api: incoming.api ?? base.api,
  capabilities: {
    ...base.capabilities,
    ...incoming.capabilities,
    input: { ...base.capabilities?.input, ...incoming.capabilities?.input },
    output: { ...base.capabilities?.output, ...incoming.capabilities?.output },
  },
  variants: incoming.variants ?? base.variants,
});

const mergeModelMaps = (
  base: Record<string, ModelInfo>,
  incoming: Record<string, ModelInfo>
): Record<string, ModelInfo> => {
  const merged = { ...base };
  Object.entries(incoming).forEach(([id, model]) => {
    merged[id] = merged[id] ? mergeModelInfo(merged[id], model) : model;
  });
  return merged;
};

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
    return new Error(`OpenCode 请求失败，状态码 ${response.status}`);
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
      throw new Error("OpenCode 返回了网页内容，请检查当前连接的服务地址是否正确");
    }
    throw new Error("OpenCode 返回了无法解析的 JSON 数据");
  }
};

const toModelRef = (value: unknown): ModelRef | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id) || stringValue(record?.modelID);
  const providerID = stringValue(record?.providerID);
  if (!id || !providerID) return undefined;
  const variant = stringValue(record?.variant);
  return { id, providerID, ...(variant ? { variant } : {}) };
};

const toModelInfo = (
  value: unknown,
  providerID?: string,
  fallbackID?: string
): ModelInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id)
    || stringValue(record?.modelID)
    || fallbackID
    || "";
  const resolvedProviderID = stringValue(record?.providerID, providerID);
  if (!id || !resolvedProviderID) return undefined;
  const capabilities = asRecord(record?.capabilities);
  const input = Array.isArray(capabilities?.input)
    ? Object.fromEntries(capabilities.input.filter((item): item is string => typeof item === "string").map((item) => [item, true]))
    : asRecord(capabilities?.input);
  const output = Array.isArray(capabilities?.output)
    ? Object.fromEntries(capabilities.output.filter((item): item is string => typeof item === "string").map((item) => [item, true]))
    : asRecord(capabilities?.output);
  const limit = asRecord(record?.limit);
  const api = asRecord(record?.api);
  const variants = normalizeModelVariants(record?.variants);
  const hasVariants = Boolean(variants && Object.keys(variants).length > 0);
  const status = stringValue(record?.status, "active");
  return {
      api: api ? {
        id: stringValue(api.id) || undefined,
        type: stringValue(api.type) || undefined,
        npm: stringValue(api.npm) || stringValue(api.package) || undefined,
        url: stringValue(api.url) || undefined,
      } : undefined,
    capabilities: capabilities ? {
      attachment: Boolean(capabilities.attachment) || Boolean(input?.image),
      input: input as Partial<Record<ModelModality, boolean>>,
      interleaved: typeof capabilities.interleaved === "boolean"
        ? capabilities.interleaved
        : asRecord(capabilities.interleaved) as { field?: string } | undefined,
      output: output as Partial<Record<ModelModality, boolean>>,
      reasoning: Boolean(capabilities.reasoning) || hasVariants,
      temperature: Boolean(capabilities.temperature),
      toolcall: Boolean(capabilities.toolcall) || Boolean(capabilities.tools),
    } : undefined,
    enabled: typeof record?.enabled === "boolean" ? record.enabled : undefined,
    family: stringValue(record?.family) || undefined,
    id,
    limit: limit ? {
      context: numberValue(limit.context) || undefined,
      input: numberValue(limit.input) || undefined,
      output: numberValue(limit.output) || undefined,
    } : undefined,
    name: stringValue(record?.name, id),
    providerID: resolvedProviderID,
    status: status === "alpha" || status === "beta" || status === "deprecated" || status === "active"
      ? status
      : "active",
    variants,
  };
};

const toProvider = (value: unknown, sourceOverride?: ProviderInfo["source"]): ProviderInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id);
  if (!id) return undefined;
  const models = asRecord(record?.models);
  const normalizedModels = Object.fromEntries(
    Object.entries(models ?? {})
      .map(([modelID, model]) => [modelID, toModelInfo(model, id, modelID)] as const)
      .filter((entry): entry is [string, ModelInfo] => Boolean(entry[1]))
  );
  const source = stringValue(record?.source, sourceOverride ?? "custom");
  const api = asRecord(record?.api);
  const firstModel = normalizedModels[Object.keys(normalizedModels)[0] ?? ""];
  const providerApi = api || firstModel?.api
    ? {
        package: stringValue(api?.package) || firstModel?.api?.npm,
        type: stringValue(api?.type) || firstModel?.api?.type,
        url: stringValue(api?.url) || firstModel?.api?.url,
      }
    : undefined;
  return {
    api: providerApi,
    env: stringArray(record?.env),
    id,
    key: stringValue(record?.key) || undefined,
    models: normalizedModels,
    name: stringValue(record?.name, id),
    options: asRecord(record?.options) ?? {},
    source: source === "env" || source === "config" || source === "api" || source === "custom"
      ? source
      : "custom",
  };
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
        variant: stringValue(info.variant) || undefined,
      },
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
  const record = asRecord(value);
  const id = stringValue(record?.id);
  const sessionID = stringValue(record?.sessionID);
  if (!id || !sessionID) return undefined;
  return {
    action: stringValue(record?.permission) || stringValue(record?.action, "permission"),
    id,
    metadata: asRecord(record?.metadata),
    resources: stringArray(record?.patterns).length > 0 ? stringArray(record?.patterns) : stringArray(record?.resources),
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
    const catalog = await openCodeApi.listProviderCatalog(directory);
    const enabledProviders = new Set(catalog.connected);
    return catalog.all
      .filter((provider) => enabledProviders.has(provider.id))
      .flatMap((provider) => Object.values(provider.models).filter((model) => model.enabled !== false));
  },

  listProviderCatalog: async (directory?: string): Promise<ProviderCatalog> => {
    const [catalogResponse, providerResponse, modelResponse, integrationResponse] = await Promise.all([
      request<unknown>("/config/providers", undefined, directoryParams(directory)),
      request<unknown>("/api/provider", undefined, locationParams(directory)),
      request<unknown>("/api/model", undefined, locationParams(directory)),
      request<unknown>("/api/integration", undefined, locationParams(directory)),
    ]);
    const catalogPayload = asRecord(unwrapData<unknown>(catalogResponse)) ?? {};
    const catalogProviders = recordArray(catalogPayload.providers)
      .map((item) => toProvider(item))
      .filter((item): item is ProviderInfo => Boolean(item));
    const connectedProviderItems = recordArray(unwrapData<unknown>(providerResponse));
    const connectedProviders = connectedProviderItems
      .map((item) => toProvider(item, "api"))
      .filter((item): item is ProviderInfo => Boolean(item));
    const providers = new Map(catalogProviders.map((provider) => [provider.id, provider]));
    connectedProviders.forEach((provider) => {
      const existing = providers.get(provider.id);
      providers.set(provider.id, {
        ...provider,
        ...(existing?.name ? { name: existing.name } : {}),
        models: mergeModelMaps(existing?.models ?? {}, provider.models),
        source: existing?.source ?? provider.source,
      });
    });
    recordArray(unwrapData<unknown>(modelResponse)).forEach((item) => {
      const model = toModelInfo(item);
      if (!model) return;
      const provider = providers.get(model.providerID) ?? {
        api: model.api ? {
          package: model.api.npm,
          type: model.api.type,
          url: model.api.url,
        } : undefined,
        env: [],
        id: model.providerID,
        models: {},
        name: model.providerID,
        options: {},
        source: "api" as const,
      };
      providers.set(model.providerID, {
        ...provider,
        models: mergeModelMaps(provider.models, { [model.id]: model }),
      });
    });
    recordArray(unwrapData<unknown>(integrationResponse)).forEach((item) => {
      const id = stringValue(item.id);
      if (!id || providers.has(id)) return;
      const methods = recordArray(item.methods);
      const env = methods.flatMap((method) => stringArray(method.names));
      providers.set(id, {
        api: undefined,
        env,
        id,
        models: {},
        name: stringValue(item.name, id),
        options: {},
        source: "api",
      });
    });
    const all = [...providers.values()];
    // OpenCode can report configured credentials through /config/providers and
    // runtime-loaded providers through /api/provider. They are complementary:
    // using only one response hides valid built-in providers as soon as any
    // other provider is active.
    const connected = [...new Set([
      ...connectedProviders.map((provider) => provider.id),
      ...catalogProviders.filter((provider) => Boolean(provider.key)).map((provider) => provider.id),
    ])];
    return {
      all,
      connected,
      default: recordStringMap(catalogPayload.default),
    };
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
    if (!session) throw new Error("OpenCode 返回了无效会话");
    return session;
  },

  renameSession: async (sessionID: string, title: string, directory?: string) => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, {
      body: JSON.stringify({ title }),
      method: "PATCH",
    }, directoryParams(directory));
    const session = toSession(unwrapData<unknown>(response), directory);
    if (!session) throw new Error("OpenCode 返回了无效会话");
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

  getSessionNetwork: async (sessionID: string, directory?: string): Promise<boolean> => {
    const response = await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, undefined, directoryParams(directory));
    return networkEnabledFromRules(permissionRules(asRecord(unwrapData(response))?.permission));
  },

  setSessionNetwork: async (sessionID: string, enabled: boolean, directory?: string): Promise<void> => {
    const action = enabled ? "allow" : "deny";
    await request<unknown>(`/session/${encodeURIComponent(sessionID)}`, {
      // Session permission updates are append-only in OpenCode. Appending only
      // the two latest network rules keeps the final rule authoritative without
      // duplicating the rest of the session permission set on every toggle.
      body: JSON.stringify({ permission: [{ action, pattern: "*", permission: "websearch" }, { action, pattern: "*", permission: "webfetch" }] }),
      method: "PATCH",
    }, directoryParams(directory));
  },

  sendPrompt: async (sessionID: string, input: SendPromptInput) => {
    const messageID = input.messageID ?? createMessageID();
    if (!input.text.trim() && (input.files ?? []).length === 0) throw new Error("消息必须包含文字或附件");
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
    if (!credential) throw new Error("当前供应商没有可移除的 OpenCode 凭据");
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

  replyPermission: (sessionID: string, requestID: string, reply: PermissionReply, directory?: string) =>
    request<void>(`/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`, {
      body: JSON.stringify({ reply }),
      method: "POST",
    }, directoryParams(directory)),

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
  _directory: string | undefined,
  onEvent: (event: OpenCodeEvent) => void,
  onError?: () => void
) => {
  const source = new EventSource(buildUrl("/api/event"));
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
