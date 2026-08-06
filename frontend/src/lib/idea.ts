export interface IdeLineRange {
  start: number;
  end: number;
}

export interface IdeContextEvent {
  id: string;
  action: "add_to_chat" | "explain_code" | "optimize_code" | "generate_test";
  content: string;
  fileName?: string;
  lineRange?: IdeLineRange;
  timestamp: number;
}

export interface IdeaRuntimeConfig {
  projectPath?: string;
  baseUrl?: string;
  port?: number;
  managed?: boolean;
  connected?: boolean;
  ideaTheme?: "dark" | "light";
  error?: string;
}

export type IdeaTheme = "dark" | "light";

export interface MemoryPluginInfo {
  id: string;
  name: string;
  spec: string;
  description: string;
  capabilities: string[];
  fullIntegration: boolean;
}

export interface DevelopmentEnvironmentInfo {
  id: string;
  name: string;
  version?: string;
  paths: string[];
  source: string;
}

export interface MemorySystemStatus {
  enabled: boolean;
  autoInstall: boolean;
  installing: boolean;
  installed: boolean;
  pluginReady: boolean;
  restartRequired: boolean;
  plugins: MemoryPluginInfo[];
  defaultPlugin: string;
  autoCaptureEnabled: boolean;
  crossProjectEnabled: boolean;
  profileEnabled: boolean;
  environmentSyncEnabled: boolean;
  memoryProvider?: string;
  memoryModel?: string;
  storagePath: string;
  dashboardUrl: string;
  lastEnvironmentScan?: number;
  environments: DevelopmentEnvironmentInfo[];
  stats?: unknown;
  error?: string;
}

export interface MemorySettingsRequest {
  enabled: boolean;
  autoInstall: boolean;
  autoCaptureEnabled: boolean;
  crossProjectEnabled: boolean;
  profileEnabled: boolean;
  environmentSyncEnabled: boolean;
  memoryProvider?: string;
  memoryModel?: string;
}

export interface MemoryActionResponse {
  success: boolean;
  status?: MemorySystemStatus;
  message?: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  displayName?: string;
  projectName?: string;
  memoryType?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface MemoryProfileItem {
  category?: string;
  description?: string;
  confidence?: number;
  frequency?: number;
  steps?: string[];
}

export interface MemoryUserProfile {
  exists: boolean;
  message?: string;
  displayName?: string;
  totalPromptsAnalyzed?: number;
  lastAnalyzedAt?: string;
  profileData?: {
    preferences?: MemoryProfileItem[];
    patterns?: MemoryProfileItem[];
    workflows?: MemoryProfileItem[];
  };
}

export interface MemoryApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const localApiBaseUrl = (
  import.meta.env.VITE_IDEA_API_BASE || `${window.location.origin}/api`
).replace(/\/$/, "");

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${localApiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `IDEA bridge request failed with ${response.status}`);
  }

  return (await response.json()) as T;
};

const normalizeLineRange = (value: unknown): IdeLineRange | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { start?: unknown; end?: unknown };
  if (typeof candidate.start === "number" && typeof candidate.end === "number") {
    return { start: candidate.start, end: candidate.end };
  }

  return undefined;
};

const normalizeContextEvent = (raw: unknown): IdeContextEvent | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const action = data.type ?? data.action;
  const content = data.content;

  if (
    action !== "add_to_chat" &&
    action !== "explain_code" &&
    action !== "optimize_code" &&
    action !== "generate_test"
  ) {
    return null;
  }

  if (typeof content !== "string" || content.trim() === "") {
    return null;
  }

  return {
    action,
    content,
    fileName: typeof data.fileName === "string" ? data.fileName : undefined,
    id:
      typeof data.id === "number" || typeof data.id === "string"
        ? String(data.id)
        : `${Date.now()}`,
    lineRange: normalizeLineRange(data.lineRange),
    timestamp:
      typeof data.timestamp === "number" ? data.timestamp : Date.now(),
  };
};

export const ideaApi = {
  getRuntimeConfig: () => request<IdeaRuntimeConfig>("/opencode-info"),

  getProjectPath: async () => {
    const response = await request<{ path?: string }>("/project-path");
    return response.path;
  },

  reloadFileSystem: () =>
    request<{ success: boolean }>("/reload", { method: "POST" }),

  saveFile: (filename: string, content: string) =>
    request<{ path?: string; saved: boolean }>("/save-file", {
      body: JSON.stringify({ content, filename }),
      method: "POST",
    }),

  getMemoryStatus: () => request<MemorySystemStatus>("/memory/status"),

  installMemorySystem: (force = false) =>
    request<MemoryActionResponse>("/memory/install", {
      body: JSON.stringify({ force }),
      method: "POST",
    }),

  updateMemorySettings: (settings: MemorySettingsRequest) =>
    request<MemoryActionResponse>("/memory/settings", {
      body: JSON.stringify(settings),
      method: "POST",
    }),

  scanDevelopmentEnvironments: (sync = true) =>
    request<MemoryActionResponse>("/memory/scan", {
      body: JSON.stringify({ sync }),
      method: "POST",
    }),

  listMemories: () =>
    request<MemoryApiResult<{ items: MemoryItem[]; total: number }>>(
      "/memory/memories?page=1&pageSize=100&includePrompts=false"
    ),

  addMemory: (content: string) =>
    request<MemoryApiResult<MemoryItem>>("/memory/memories", {
      body: JSON.stringify({
        content,
        displayName: "用户全局记忆",
        tags: ["capybara", "user", "global"],
        type: "preference",
      }),
      method: "POST",
    }),

  deleteMemory: (id: string) =>
    request<MemoryApiResult<unknown>>(`/memory/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getMemoryProfile: () =>
    request<MemoryApiResult<MemoryUserProfile>>("/memory/profile"),

  refreshMemoryProfile: () =>
    request<MemoryApiResult<MemoryUserProfile>>("/memory/profile/refresh", {
      body: "{}",
      method: "POST",
    }),

  openMemoryDashboard: () =>
    request<MemoryActionResponse>("/memory/dashboard", { method: "POST" }),
};

export const subscribeIdeaEvents = (
  onContext: (event: IdeContextEvent) => void,
  onTheme?: (theme: IdeaTheme) => void,
  onError?: () => void
) => {
  const source = new EventSource(`${localApiBaseUrl}/events`);

  const handleMessage = (event: MessageEvent<string>) => {
    if (!event.data) {
      return;
    }

    try {
      const parsed = JSON.parse(event.data) as unknown;
      const contextEvent = normalizeContextEvent(parsed);
      if (contextEvent) {
        onContext(contextEvent);
      }
    } catch {
      // Ignore malformed plugin events; the stream should stay alive.
    }
  };

  const handleTheme = (event: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(event.data) as { theme?: unknown };
      if (parsed.theme === "dark" || parsed.theme === "light") onTheme?.(parsed.theme);
    } catch {
      // Ignore malformed theme events without interrupting the shared stream.
    }
  };

  source.onmessage = handleMessage;
  source.onerror = () => onError?.();
  source.addEventListener("chat_message", handleMessage);
  source.addEventListener("ide.context", handleMessage);
  source.addEventListener("ide.theme", handleTheme);

  return () => source.close();
};
