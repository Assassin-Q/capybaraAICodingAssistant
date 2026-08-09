export interface IdeLineRange {
  start: number;
  end: number;
}

export interface IdeContextEvent {
  id: string;
  action: "add_to_chat" | "explain_code" | "optimize_code" | "generate_test";
  content: string;
  kind?: "file" | "directory" | "selection" | "binary";
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
  /** True when a restart only re-probed an external server without stopping it. */
  reconnectedOnly?: boolean;
  /** PID owning the port when the server is not plugin-managed. */
  externalPid?: number;
}

export type IdeaTheme = "dark" | "light";

export interface IdeaThemeOption {
  current: boolean;
  dark: boolean;
  id: string;
  name: string;
}

export interface IdeaThemeSettings {
  currentThemeId?: string;
  currentThemeName?: string;
  darkThemeId?: string;
  lightThemeId?: string;
  message?: string;
  success: boolean;
  syncWithOs: boolean;
  syncWithOsSupported: boolean;
  theme: IdeaTheme;
  themes: IdeaThemeOption[];
}

export interface IdeaThemeMappingRequest {
  darkThemeId: string;
  lightThemeId: string;
  syncWithOs?: boolean;
}

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
  manual?: boolean;
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
  /** One captured memory ≈ one extra structured-output request to the capture model. */
  captureCallsTotal: number;
  captureCallsThisMonth: number;
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
  storagePath?: string;
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

export interface IdeaDiffFile {
  file: string;
  patch: string;
  title?: string;
}

export interface IdeaDiffResponse {
  success: boolean;
  message?: string;
}

export interface IdeaSnapshotDiffRequest {
  start: string;
  end: string;
  files?: string[];
}

export interface IdeaSnapshotFileDiff {
  additions: number;
  deletions: number;
  file: string;
  patch: string;
  status: "added" | "deleted" | "modified";
}

export const localApiBaseUrl = (
  import.meta.env.VITE_IDEA_API_BASE || `${window.location.origin}/api`
).replace(/\/$/, "");

/** Shared IDEA bridge fetch helper. Also used by `lib/ideaIntegrations.ts`. */
export const ideaRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
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

const request = ideaRequest;

const normalizeLineRange =(value: unknown): IdeLineRange | undefined => {
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
    kind: data.kind === "directory" || data.kind === "selection" || data.kind === "binary" || data.kind === "file"
      ? data.kind
      : undefined,
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

  /**
   * Re-discovers the local OpenCode server. A plugin-managed server is relaunched; an
   * externally started one is only re-probed unless `force` is set, because OpenCode loads
   * plugins once at startup and re-probing does not reload them.
   */
  restartOpenCode: (force = false) =>
    request<IdeaRuntimeConfig>("/opencode/restart", {
      body: JSON.stringify({ force }),
      method: "POST",
    }),

  /**
   * Approval mode lives in the plugin, not in OpenCode: `PATCH /session` and `PATCH /config`
   * both accept a `permission` payload, return 200 and discard it (verified against 1.18.12).
   * The bridge plugin enforces the mode through OpenCode's `permission.ask` hook, which reads
   * the decision back from `/api/approval-mode/decide`.
   */
  getApprovalMode: (sessionID: string) =>
    request<{ sessionID: string; mode: string }>(
      `/approval-mode?sessionID=${encodeURIComponent(sessionID)}`
    ),

  setApprovalMode: (sessionID: string, mode: string) =>
    request<{ sessionID: string; mode: string }>("/approval-mode", {
      body: JSON.stringify({ mode, sessionID }),
      method: "POST",
    }),

  /** Sessions currently blocked on an approval, across every session — not just the visible one. */
  getPendingApprovals: () => request<{ sessions: string[] }>("/approval-mode/pending"),

  setPendingApproval: (sessionID: string, pending: boolean) =>
    request<{ sessions: string[] }>("/approval-mode/pending", {
      body: JSON.stringify({ pending, sessionID }),
      method: "POST",
    }),

  /** Mode → operation labels, so the picker renders exactly what the plugin enforces. */
  getApprovalModeRules: () =>
    request<{
      modes: Array<{ id: string; label: string; allow: string[]; ask: string[] }>;
    }>("/approval-mode/rules"),

  /**
   * Deletes a provider from opencode.jsonc. OpenCode's `PATCH /config` can only merge, so this
   * is the only way to actually remove one; the plugin backs the file up before editing.
   */
  removeProvider: (providerID: string) =>
    request<{ success: boolean; message?: string; file?: string }>("/opencode/remove-provider", {
      body: JSON.stringify({ providerID }),
      method: "POST",
    }),

  /** Switches IDEA's own look-and-feel so the IDE and the panel stay in sync. */
  setIdeaTheme: (theme: IdeaTheme) =>
    request<IdeaThemeSettings>("/ide/theme", {
      body: JSON.stringify({ theme }),
      method: "POST",
    }),

  getIdeaThemeSettings: () => request<IdeaThemeSettings>("/ide/theme"),

  updateIdeaThemeSettings: (settings: IdeaThemeMappingRequest) =>
    request<IdeaThemeSettings>("/ide/theme/settings", {
      body: JSON.stringify(settings),
      method: "POST",
    }),

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

  openDiff: (file: IdeaDiffFile) =>
    request<IdeaDiffResponse>("/diff/open", {
      body: JSON.stringify(file),
      method: "POST",
    }),

  getSnapshotDiff: (snapshot: IdeaSnapshotDiffRequest) =>
    request<IdeaSnapshotFileDiff[]>("/diff/snapshot", {
      body: JSON.stringify(snapshot),
      method: "POST",
    }),

  applyInlineDiffs: (files: IdeaDiffFile[]) =>
    request<IdeaDiffResponse>("/diff/inline", {
      body: JSON.stringify({ files }),
      method: "POST",
    }),

  clearInlineDiffs: () =>
    request<IdeaDiffResponse>("/diff/inline", { method: "DELETE" }),

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

  saveDevelopmentEnvironments: (environments: DevelopmentEnvironmentInfo[], sync = true) =>
    request<MemoryActionResponse>("/memory/environments", {
      body: JSON.stringify({ environments, sync }),
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
  onError?: () => void,
  onApprovalPending?: (sessionIDs: string[]) => void
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
  source.addEventListener("approval.pending", (event: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(event.data) as { sessions?: unknown };
      if (Array.isArray(parsed.sessions)) onApprovalPending?.(parsed.sessions.map(String));
    } catch {
      // Ignore malformed events without interrupting the shared stream.
    }
  });

  return () => source.close();
};
