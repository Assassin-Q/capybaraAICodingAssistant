import type { LanguageModelUsage } from "ai";

import type {
  AssistantMessage,
  ModelInfo,
  SessionMessage,
  TokenUsage,
} from "@/lib/opencodeTypes";

export const EMPTY_TOKEN_USAGE: TokenUsage = {
  cache: { read: 0, reported: false, write: 0 },
  input: 0,
  output: 0,
  reasoning: 0,
};

const finiteToken = (value: unknown): number => {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

export const parseTokenUsage = (value: unknown): TokenUsage | undefined => {
  const record = recordValue(value);
  if (!record) return undefined;
  const cache = recordValue(record.cache);
  const hasUsage = ["input", "output", "reasoning", "cache"].some((key) => key in record);
  if (!hasUsage) return undefined;
  return {
    cache: {
      read: finiteToken(cache?.read),
      reported: Boolean(cache) && ("read" in cache! || "write" in cache!),
      write: finiteToken(cache?.write),
    },
    input: finiteToken(record.input),
    output: finiteToken(record.output),
    reasoning: finiteToken(record.reasoning),
  };
};

export const addTokenUsage = (left?: TokenUsage, right?: TokenUsage): TokenUsage => ({
  cache: {
    read: (left?.cache.read ?? 0) + (right?.cache.read ?? 0),
    reported: Boolean(left?.cache.reported) || Boolean(right?.cache.reported),
    write: (left?.cache.write ?? 0) + (right?.cache.write ?? 0),
  },
  input: (left?.input ?? 0) + (right?.input ?? 0),
  output: (left?.output ?? 0) + (right?.output ?? 0),
  reasoning: (left?.reasoning ?? 0) + (right?.reasoning ?? 0),
});

export const tokenTotal = (usage?: TokenUsage): number =>
  (usage?.input ?? 0)
  + (usage?.output ?? 0)
  + (usage?.reasoning ?? 0)
  + (usage?.cache.read ?? 0)
  + (usage?.cache.write ?? 0);

export const hasTokenUsage = (usage?: TokenUsage): boolean => tokenTotal(usage) > 0;

export const toLanguageModelUsage = (usage?: TokenUsage): LanguageModelUsage => ({
  inputTokenDetails: {
    cacheReadTokens: usage?.cache.read ?? 0,
    cacheWriteTokens: usage?.cache.write ?? 0,
    noCacheTokens: usage?.input ?? 0,
  },
  inputTokens: usage?.input ?? 0,
  outputTokenDetails: {
    reasoningTokens: usage?.reasoning ?? 0,
    textTokens: usage?.output ?? 0,
  },
  outputTokens: usage?.output ?? 0,
  totalTokens: tokenTotal(usage),
});

export interface ContextUsageInfo {
  maxTokens?: number;
  model?: ModelInfo;
  modelId?: string;
  tokens: TokenUsage;
  usedTokens: number;
}

const modelMatches = (model: ModelInfo, providerID: string, id: string): boolean =>
  model.providerID === providerID && model.id === id;

export const getContextUsage = (
  messages: SessionMessage[],
  models: ModelInfo[],
  fallbackModel?: ModelInfo,
): ContextUsageInfo => {
  const latest = [...messages]
    .reverse()
    .find((message): message is AssistantMessage =>
      message.type === "assistant" && hasTokenUsage(message.tokens)
    );
  const model = latest
    ? models.find((item) => modelMatches(item, latest.model.providerID, latest.model.id)) ?? fallbackModel
    : fallbackModel;
  const modelRef = latest?.model ?? (model
    ? { id: model.id, providerID: model.providerID }
    : undefined);
  const tokens = latest?.tokens ?? EMPTY_TOKEN_USAGE;
  return {
    maxTokens: model?.limit?.context,
    model,
    modelId: modelRef ? `${modelRef.providerID}/${modelRef.id}` : undefined,
    tokens,
    usedTokens: tokenTotal(tokens),
  };
};
