export type ChatRunStatus = "ready" | "submitted" | "streaming" | "error";

export interface SessionStatusInfo {
  type: "busy" | "idle" | string;
}

export interface LocationRef {
  directory: string;
  workspaceID?: string;
}

export interface ModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

export type ModelModality = "text" | "audio" | "image" | "video" | "pdf";

export interface ModelInfo {
  id: string;
  providerID: string;
  family?: string;
  name: string;
  enabled?: boolean;
  status: "alpha" | "beta" | "deprecated" | "active";
  api?: {
    id?: string;
    type?: "aisdk" | "native" | string;
    npm?: string;
    url?: string;
  };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  capabilities?: {
    temperature?: boolean;
    reasoning?: boolean;
    attachment?: boolean;
    toolcall?: boolean;
    input?: Partial<Record<ModelModality, boolean>>;
    output?: Partial<Record<ModelModality, boolean>>;
    interleaved?: boolean | { field?: string };
  };
  variants?: Record<string, Record<string, unknown>>;
}

export interface AgentInfo {
  id: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  hidden: boolean;
  model?: ModelRef;
  system?: string;
  disabled?: boolean;
}

export interface McpStatus {
  status:
    | "connected"
    | "disabled"
    | "failed"
    | "needs_auth"
    | "needs_client_registration";
  error?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  source: "env" | "config" | "custom" | "api";
  env: string[];
  key?: string;
  options: Record<string, unknown>;
  models: Record<string, ModelInfo>;
  api?: {
    type?: "aisdk" | "native" | string;
    package?: string;
    url?: string;
  };
}

export interface ProviderCatalog {
  all: ProviderInfo[];
  connected: string[];
  default: Record<string, string>;
}

export interface CustomModelConfig {
  id?: string;
  name?: string;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  status?: "active" | "alpha" | "beta" | "deprecated";
  temperature?: boolean;
  tool_call?: boolean;
  interleaved?: boolean | string | { field?: string };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  modalities?: {
    input?: ModelModality[];
    output?: ModelModality[];
  };
  variants?: Record<string, Record<string, unknown>>;
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface ProviderConfig {
  api?: string;
  name?: string;
  env?: string[];
  id?: string;
  npm?: string;
  whitelist?: string[];
  blacklist?: string[];
  options?: Record<string, unknown> & {
    apiKey?: string;
    baseURL?: string;
    enterpriseUrl?: string;
    timeout?: number | false;
    headerTimeout?: number | false;
    chunkTimeout?: number;
  };
  models?: Record<string, CustomModelConfig>;
}

export interface AgentConfig {
  description?: string;
  disable?: boolean;
  hidden?: boolean;
  maxSteps?: number;
  mode?: "subagent" | "primary" | "all";
  model?: string;
  permission?: Record<string, unknown> | "ask" | "allow" | "deny";
  prompt?: string;
  temperature?: number;
  top_p?: number;
  variant?: string;
  [key: string]: unknown;
}

export interface CommandConfig {
  agent?: string;
  description?: string;
  model?: string;
  subtask?: boolean;
  template: string;
  variant?: string;
}

export interface OpenCodeConfig {
  agent?: Record<string, AgentConfig>;
  command?: Record<string, CommandConfig>;
  disabled_providers?: string[];
  mcp?: Record<string, McpConfig>;
  provider?: Record<string, ProviderConfig>;
  [key: string]: unknown;
}

export interface PermissionRule {
  action: "allow" | "ask" | "deny";
  pattern: string;
  permission: string;
}

export interface SkillInfo {
  name: string;
  description?: string;
  slash?: boolean;
  location: string;
  content: string;
}

export interface CommandInfo {
  name: string;
  description?: string;
  source?: string;
  template?: string;
  hints?: string[];
}

export interface McpConfig {
  type: "local" | "remote";
  enabled?: boolean;
  command?: string[];
  cwd?: string;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: false | {
    callbackPort?: number;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scope?: string;
  };
  timeout?: number;
  url?: string;
  [key: string]: unknown;
}

export interface PromptAttachment {
  uri: string;
  mime: string;
  name?: string;
}

export interface PromptAgentAttachment {
  name: string;
  source?: {
    start: number;
    end: number;
    text: string;
  };
}

export interface SessionInfo {
  id: string;
  parentID?: string;
  projectID: string;
  agent?: string;
  model?: ModelRef;
  title: string;
  location: LocationRef;
  subpath?: string;
  time: {
    created: number;
    updated: number;
    archived?: number;
  };
}

export interface UserMessage {
  id: string;
  type: "user";
  text: string;
  files?: Array<{ mime?: string; name?: string; uri: string }>;
  time: {
    created: number;
  };
}

export interface AssistantTextPart {
  type: "text";
  id: string;
  text: string;
}

export interface AssistantReasoningPart {
  type: "reasoning";
  id: string;
  text: string;
  time?: {
    created?: number;
    completed?: number;
  };
}

export interface AssistantToolPart {
  type: "tool";
  id: string;
  name: string;
  state: {
    status: "pending" | "running" | "completed" | "error";
    input?: unknown;
    structured?: unknown;
    content?: unknown;
    result?: unknown;
    error?: unknown;
    outputPaths?: string[];
  };
  time: {
    created: number;
    ran?: number;
    completed?: number;
  };
}

export interface AssistantMessage {
  id: string;
  type: "assistant";
  parentID?: string;
  agent: string;
  model: ModelRef;
  content: Array<AssistantTextPart | AssistantReasoningPart | AssistantToolPart>;
  error?: string;
  finish?: string;
  time: {
    created: number;
    completed?: number;
  };
}

export interface SystemMessage {
  id: string;
  type: "system" | "synthetic" | "shell" | "compaction" | "agent-switched" | "model-switched";
  agent?: string;
  model?: ModelRef;
  text?: string;
  time?: {
    created?: number;
  };
}

export type SessionMessage = UserMessage | AssistantMessage | SystemMessage;

export interface PermissionRequest {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save?: string[];
  metadata?: Record<string, unknown>;
}

export type PermissionReply = "once" | "always" | "reject";

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
}

export interface TodoInfo {
  id?: string;
  content: string;
  priority: "high" | "medium" | "low" | string;
  status: "pending" | "in_progress" | "completed" | "cancelled" | string;
}

export interface SessionFileDiff {
  additions: number;
  deletions: number;
  file?: string;
  patch?: string;
  status?: "added" | "deleted" | "modified";
}

export interface OpenCodeEvent {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface SendPromptInput {
  agent?: string;
  agents?: PromptAgentAttachment[];
  directory?: string;
  files?: PromptAttachment[];
  messageID?: string;
  model?: ModelRef;
  personaInstructions?: string;
  text: string;
}
