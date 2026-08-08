import { ideaRequest } from "@/lib/idea";

export type ManagedScope = "project" | "global";

export interface ManagedSkillInfo {
  name: string;
  description?: string;
  location: string;
  scope: ManagedScope;
  /** Which convention the skill directory follows: opencode, claude or agents. */
  source: string;
  enabled: boolean;
  editable?: boolean;
}

export interface SkillHubStatus {
  /** Whether skillhub.cn answered. No CLI, Python or Git Bash is involved. */
  available: boolean;
  endpoint: string;
  message?: string;
}

export interface SkillActionResponse {
  success: boolean;
  message?: string;
  imported?: ManagedSkillInfo;
  status?: SkillHubStatus;
}

export interface SkillHubSkill {
  slug: string;
  publicSlug?: string;
  name?: string;
  description?: string;
  version?: string;
  /** "community" or "@org" for enterprise sources. */
  source?: string;
  namespaceHandle?: string;
}

export interface SkillHubSearchResponse {
  success: boolean;
  query: string;
  results: SkillHubSkill[];
  warnings: string[];
  message?: string;
}

export interface ManagedPluginFile {
  name: string;
  location: string;
  scope: ManagedScope;
  enabled: boolean;
  language: string;
  content: string;
}

export interface PluginActionResponse {
  success: boolean;
  message?: string;
  plugin?: ManagedPluginFile;
}


export interface IdeaRunConfigurationInfo {
  id: string;
  name: string;
  type: string;
  folder?: string;
  temporary: boolean;
}

export interface IdeaExecutionLog {
  id: number;
  configurationID: string;
  name: string;
  executor: string;
  running: boolean;
  exitCode?: number;
  startedAt: number;
  completedAt?: number;
  text: string;
}

export interface IdeaExecutionResponse {
  success: boolean;
  message?: string;
  logs: IdeaExecutionLog[];
}

export interface IdeaBridgeStatus {
  installed: boolean;
  location: string;
  mavenAvailable: boolean;
  gradleAvailable: boolean;
}

const post = <T>(path: string, body?: unknown) =>
  ideaRequest<T>(path, {
    body: JSON.stringify(body ?? {}),
    method: "POST",
  });

export const skillsApi = {
  list: () => ideaRequest<ManagedSkillInfo[]>("/skills"),

  /** Opens IDEA's native file chooser, so it resolves only after the user picks or cancels. */
  import: (scope: ManagedScope, overwrite = false) =>
    post<SkillActionResponse>("/skills/import", { overwrite, scope }),

  setEnabled: (location: string, enabled: boolean) =>
    post<SkillActionResponse>("/skills/enabled", { enabled, location }),

  remove: (location: string) => post<SkillActionResponse>("/skills/delete", { location }),

  hubStatus: () => ideaRequest<SkillHubStatus>("/skills/hub/status"),


  searchHub: (query: string, limit = 20) =>
    post<SkillHubSearchResponse>("/skills/hub/search", { limit, query }),

  installFromHub: (input: {
    coordinate: string;
    scope: ManagedScope;
    overwrite?: boolean;
  }) => post<SkillActionResponse>("/skills/hub/install", input),
};

export const pluginsApi = {
  list: () => ideaRequest<ManagedPluginFile[]>("/plugins"),

  save: (input: {
    name: string;
    content: string;
    scope: ManagedScope;
    location?: string;
    overwrite?: boolean;
  }) => post<PluginActionResponse>("/plugins/save", input),

  import: (scope: ManagedScope, overwrite = false) =>
    post<PluginActionResponse>("/plugins/import", { overwrite, scope }),

  setEnabled: (location: string, enabled: boolean) =>
    post<PluginActionResponse>("/plugins/enabled", { enabled, location }),

  remove: (location: string) => post<PluginActionResponse>("/plugins/delete", { location }),
};

export interface GitChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatusResponse {
  available: boolean;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: GitChangedFile[];
  message?: string;
}

export interface GitDiffSummary {
  available: boolean;
  branch?: string;
  stat: string;
  nameStatus: string;
  message?: string;
}

/**
 * Read-only status plus hand-offs to IDEA's own commit and push dialogs — committing itself
 * is left to IDEA, which does it far better than anything reimplemented here.
 */
export const gitApi = {
  status: () => ideaRequest<GitStatusResponse>("/git/status"),

  diffSummary: () => ideaRequest<GitDiffSummary>("/git/diff-summary"),

  openCommitDialog: (message?: string) =>
    post<{ success: boolean; message?: string }>("/git/commit-dialog", { message }),

  openPushDialog: () => post<{ success: boolean; message?: string }>("/git/push"),
};

export const ideaExecutionApi = {
  configurations: () => ideaRequest<IdeaRunConfigurationInfo[]>("/ide/run-configurations"),

  run: (id: string, mode: "run" | "debug" = "run") =>
    post<IdeaExecutionResponse>("/ide/run", { id, mode }),

  maven: (tasks: string[]) => post<IdeaExecutionResponse>("/ide/maven", { tasks }),

  gradle: (tasks: string[]) => post<IdeaExecutionResponse>("/ide/gradle", { tasks }),

  logs: (configurationID?: string) =>
    ideaRequest<IdeaExecutionResponse>(
      configurationID
        ? `/ide/logs?configurationID=${encodeURIComponent(configurationID)}`
        : "/ide/logs"
    ),

  bridgeStatus: () => ideaRequest<IdeaBridgeStatus>("/ide/bridge"),

};
