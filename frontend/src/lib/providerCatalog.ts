import type {
  ModelInfo,
  ModelModality,
  ProviderCatalog,
  ProviderInfo,
} from "@/lib/opencodeTypes";

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

const recordStringMap = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, stringValue(item)] as const)
      .filter(([, item]) => Boolean(item))
  );
};

const normalizeModelVariants = (
  value: unknown
): Record<string, Record<string, unknown>> | undefined => {
  if (Array.isArray(value)) {
    const variants = value.flatMap((item) => {
      const record = asRecord(item);
      const id = stringValue(record?.id);
      if (!id) return [];
      const request = asRecord(record?.request);
      const body = asRecord(record?.body) ?? asRecord(request?.body) ?? {};
      const headers = asRecord(record?.headers) ?? asRecord(request?.headers);
      return [[id, headers ? { ...body, headers } : body] as const];
    });
    return Object.fromEntries(variants);
  }

  const record = asRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).flatMap(([id, variant]) => {
      const entry = asRecord(variant);
      if (entry) return [[id, entry] as const];
      // Some OpenCode-compatible catalog responses expose a variant as a null/empty
      // request body. It is still a valid selectable key.
      if (variant === null || variant === undefined) return [[id, {}] as const];
      return [];
    })
  );
};

const toModelInfo = (
  value: unknown,
  providerID: string,
  fallbackID: string
): ModelInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id) || stringValue(record?.modelID) || fallbackID;
  const resolvedProviderID = stringValue(record?.providerID, providerID);
  if (!id || !resolvedProviderID) return undefined;

  const capabilities = asRecord(record?.capabilities);
  const input = Array.isArray(capabilities?.input)
    ? Object.fromEntries(capabilities.input.filter((item): item is string => typeof item === "string").map((item) => [item, true]))
    : asRecord(capabilities?.input);
  const output = Array.isArray(capabilities?.output)
    ? Object.fromEntries(capabilities.output.filter((item): item is string => typeof item === "string").map((item) => [item, true]))
    : asRecord(capabilities?.output);
  const variants = normalizeModelVariants(record?.variants);
  const limit = asRecord(record?.limit);
  const api = asRecord(record?.api);
  const status = stringValue(record?.status, "active");
  const explicitToolCall = typeof capabilities?.toolcall === "boolean"
    ? capabilities.toolcall
    : typeof capabilities?.tools === "boolean"
      ? capabilities.tools
      : undefined;

  return {
    api: api ? {
      id: stringValue(api.id) || undefined,
      npm: stringValue(api.npm) || stringValue(api.package) || undefined,
      type: stringValue(api.type) || undefined,
      url: stringValue(api.url) || undefined,
    } : undefined,
    capabilities: capabilities ? {
      attachment: typeof capabilities.attachment === "boolean"
        ? capabilities.attachment
        : input ? Boolean(input.image) : undefined,
      input: input as Partial<Record<ModelModality, boolean>>,
      interleaved: typeof capabilities.interleaved === "boolean"
        ? capabilities.interleaved
        : asRecord(capabilities.interleaved) as { field?: string } | undefined,
      output: output as Partial<Record<ModelModality, boolean>>,
      reasoning: typeof capabilities.reasoning === "boolean"
        ? capabilities.reasoning
        : variants && Object.keys(variants).length > 0 ? true : undefined,
      temperature: typeof capabilities.temperature === "boolean" ? capabilities.temperature : undefined,
      toolcall: explicitToolCall,
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

const toProvider = (value: unknown): ProviderInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id);
  if (!id) return undefined;
  const models = asRecord(record?.models);
  const normalizedModels = Object.fromEntries(
    Object.entries(models ?? {})
      .map(([modelID, model]) => [modelID, toModelInfo(model, id, modelID)] as const)
      .filter((entry): entry is [string, ModelInfo] => Boolean(entry[1]))
  );
  const source = stringValue(record?.source, "custom");
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

const listPayload = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const wrapper = asRecord(value);
  if (Array.isArray(wrapper?.data)) return wrapper.data;
  return [];
};

/** `/config/providers` is the V2 source of truth for providers with usable credentials. */
export const parseConfigProviderIDs = (value: unknown): string[] => {
  const wrapper = asRecord(value);
  const providers = Array.isArray(wrapper?.providers) ? wrapper.providers : [];
  return providers
    .map((item) => stringValue(asRecord(item)?.id))
    .filter(Boolean);
};

/** Parse the V2 `/api/model` response, which is a location wrapper around an array. */
export const parseModelList = (value: unknown): ModelInfo[] =>
  listPayload(value)
    .map((item) => {
      const record = asRecord(item);
      return record
        ? toModelInfo(record, stringValue(record.providerID), stringValue(record.id))
        : undefined;
    })
    .filter((model): model is ModelInfo => Boolean(model));

const toV2Provider = (
  value: unknown,
  models: Record<string, ModelInfo>
): ProviderInfo | undefined => {
  const record = asRecord(value);
  const id = stringValue(record?.id);
  if (!id) return undefined;
  const api = asRecord(record?.api);
  return {
    api: api ? {
      package: stringValue(api.package) || undefined,
      type: stringValue(api.type) || undefined,
      url: stringValue(api.url) || undefined,
    } : undefined,
    env: [],
    id,
    models,
    name: stringValue(record?.name, id),
    options: asRecord(api?.settings) ?? {},
    source: "api",
  };
};

/** Parse the V2 `/api/provider` response and attach models from `/api/model`. */
export const parseV2ProviderCatalog = (
  providerValue: unknown,
  modelValue?: unknown
): ProviderCatalog => {
  const modelsByProvider = new Map<string, Record<string, ModelInfo>>();
  parseModelList(modelValue).forEach((model) => {
    const current = modelsByProvider.get(model.providerID) ?? {};
    current[model.id] = model;
    modelsByProvider.set(model.providerID, current);
  });
  const all = listPayload(providerValue)
    .map((provider) => {
      const id = stringValue(asRecord(provider)?.id);
      return toV2Provider(provider, modelsByProvider.get(id) ?? {});
    })
    .filter((provider): provider is ProviderInfo => Boolean(provider));
  return {
    all,
    connected: all.filter((provider) => provider.source === "api").map((provider) => provider.id),
    default: {},
  };
};

/** Merge V2 connected data into the full legacy catalog used by settings. */
export const mergeProviderCatalogs = (
  legacy: ProviderCatalog,
  v2: ProviderCatalog
): ProviderCatalog => {
  const providers = new Map(legacy.all.map((provider) => [provider.id, provider] as const));
  v2.all.forEach((provider) => {
    const previous = providers.get(provider.id);
    const models = { ...(previous?.models ?? {}) };
    Object.entries(provider.models).forEach(([modelID, model]) => {
      const previousModel = models[modelID];
      models[modelID] = {
        ...previousModel,
        ...model,
        // `/api/model` is runtime truth. Preserve an empty set instead of repopulating it
        // from legacy data with variants the current OpenCode process cannot resolve.
        variants: model.variants,
      };
    });
    providers.set(provider.id, {
      ...previous,
      ...provider,
      api: provider.api ?? previous?.api,
      models,
      name: provider.name || previous?.name || provider.id,
      // The V2 endpoint intentionally omits storage provenance. An ID absent from the models.dev
      // legacy catalog can only have come from user config/plugin data; classify it as config so
      // settings persist edits instead of taking the credential-only built-in-provider path.
      source: previous?.source === "config" || !previous ? "config" : provider.source,
    });
  });
  return {
    all: [...providers.values()],
    connected: v2.connected.length > 0 ? v2.connected : legacy.connected,
    default: { ...legacy.default, ...v2.default },
  };
};

export const parseProviderCatalog = (value: unknown): ProviderCatalog => {
  const wrapper = asRecord(value);
  const payload = asRecord(wrapper?.data) ?? wrapper ?? {};
  const all = (Array.isArray(payload.all) ? payload.all : [])
    .map(toProvider)
    .filter((provider): provider is ProviderInfo => Boolean(provider));
  return {
    all,
    connected: stringArray(payload.connected),
    default: recordStringMap(payload.default),
  };
};

export const connectedModels = (catalog: ProviderCatalog): ModelInfo[] => {
  const connected = new Set(catalog.connected);
  return catalog.all
    .filter((provider) => connected.has(provider.id))
    .flatMap((provider) => Object.values(provider.models))
    .filter((model) => model.enabled !== false);
};
