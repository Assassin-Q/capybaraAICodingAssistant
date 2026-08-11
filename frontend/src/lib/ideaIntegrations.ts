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
  /** False when the file is nested deeper than the one level OpenCode scans — no restart helps. */
  /** Containing directory, which is the key OpenCode registers the skill under. */
  directoryName?: string;
  /** From the SKILL.md frontmatter; used to mark the installed release on SkillHub. */
  version?: string;
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
  /** clawhub / community / enterprise. */
  source?: string;
  namespaceHandle?: string;
  category?: string;
  iconUrl?: string;
  homepage?: string;
  owner?: string;
  downloads: number;
  installs: number;
  stars: number;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  requiresApiKey: boolean;
}

export interface SkillHubSearchResponse {
  success: boolean;
  query: string;
  results: SkillHubSkill[];
  warnings: string[];
  total: number;
  page: number;
  pageSize: number;
  message?: string;
}

export interface SkillHubSearchRequest {
  query: string;
  limit?: number;
  /** Exactly what GET /api/skills accepts; anything else comes back as a 400. */
  sortBy?: "score" | "downloads" | "stars" | "installs" | "updated_at";
  order?: "asc" | "desc";
  page?: number;
  category?: string;
  source?: string;
  requiresApiKey?: boolean;
  /** "en" routes the query to clawhub.ai instead of skillhub.cn. */
  locale?: string;
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
  /** Null until OpenCode's permission.ask hook has actually reached the plugin. */
  lastApprovalHook?: string;
  success: boolean;
  installed: boolean;
  enabled: boolean;
  location: string;
  mavenAvailable: boolean;
  gradleAvailable: boolean;
  message?: string;
}

const post = <T>(path: string, body?: unknown) =>
  ideaRequest<T>(path, {
    body: JSON.stringify(body ?? {}),
    method: "POST",
  });

export interface SkillHubFileEntry {
  path: string;
  size: number;
}

export interface SkillHubVersion {
  version: string;
  changelog: string;
  createdAt: number;
  latest: boolean;
}

export interface SkillHubTraceItem {
  key: string;
  score: number;
  reason: string;
}

export interface SkillHubTraceDimension {
  key: string;
  label: string;
  score: number;
  reason: string;
  items: SkillHubTraceItem[];
}

export interface SkillHubEvaluation {
  overall: number;
  userSummary: string;
  dimensions: SkillHubTraceDimension[];
}

export interface SkillHubSecurityReport {
  lab: string;
  status: string;
  statusText: string;
  reportUrl: string;
}

export interface SkillHubDetail {
  success: boolean;
  message?: string;
  slug: string;
  canonicalName: string;
  name: string;
  owner: string;
  iconUrl: string;
  description: string;
  category: string;
  subCategories: string[];
  version: string;
  updatedAt: number;
  downloads: number;
  stars: number;
  installs: number;
  requiresApiKey: boolean;
  homepage: string;
  files: SkillHubFileEntry[];
  versions: SkillHubVersion[];
  evaluation?: SkillHubEvaluation;
  security: SkillHubSecurityReport[];
}

export interface SkillHubFileContent {
  success: boolean;
  message?: string;
  path: string;
  text: string;
  truncated: boolean;
}

export const skillsApi = {
  list: () => ideaRequest<ManagedSkillInfo[]>("/skills"),

  /** Opens IDEA's native file chooser, so it resolves only after the user picks or cancels. */
  import: (scope: ManagedScope, overwrite = false) =>
    post<SkillActionResponse>("/skills/import", { overwrite, scope }),

  setEnabled: (location: string, enabled: boolean) =>
    post<SkillActionResponse>("/skills/enabled", { enabled, location }),

  remove: (location: string) => post<SkillActionResponse>("/skills/delete", { location }),

  hubStatus: (locale: string) => ideaRequest<SkillHubStatus>(`/skills/hub/status?locale=${encodeURIComponent(locale)}`),

  /** Topics the English catalogue currently carries; the Chinese one has fixed scene categories. */
  hubTopics: () => ideaRequest<string[]>("/skills/hub/topics"),


  searchHub: (input: SkillHubSearchRequest) =>
    post<SkillHubSearchResponse>("/skills/hub/search", input),

  installFromHub: (input: {
    coordinate: string;
    scope: ManagedScope;
    overwrite?: boolean;
    /** "en" installs from clawhub.ai. */
    locale?: string;
  }) => post<SkillActionResponse>("/skills/hub/install", input),

  /** Detail, file tree, versions and the TRACE report in one round trip. */
  hubDetail: (slug: string, namespace: string) =>
    post<SkillHubDetail>("/skills/hub/detail", { namespace, slug }),

  hubFile: (slug: string, namespace: string, path: string) =>
    post<SkillHubFileContent>("/skills/hub/file", { namespace, path, slug }),
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
  additions: number;
  deletions: number;
  binary: boolean;
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

  /** Opens IDEA's native diff for one file: HEAD on the left, working tree on the right. */
  openFileDiff: (path: string) =>
    post<{ success: boolean; message?: string }>("/git/file-diff", { path }),
};

export interface FileSearchHit {
  path: string;
  relativePath: string;
  name: string;
  /** Content matches only: 1-based line of the first hit. */
  line?: number;
  /** Content matches only: the matching line. */
  preview?: string;
}

export interface FileSearchResponse {
  success: boolean;
  hits: FileSearchHit[];
  /** IDEA is still indexing, so results are partial. */
  indexing?: boolean;
  /** The scan stopped at its time or file budget. */
  truncated?: boolean;
  message?: string;
}

/**
 * File lookup through IDEA's project model, so the results match Ctrl+N rather than a raw
 * directory walk — excluded folders and build output never show up.
 */
export const ideaFileSearchApi = {
  search: (query: string, mode: "name" | "content" = "name", limit = 30) =>
    post<FileSearchResponse>("/ide/file-search", { limit, mode, query }),

  /** Attaches the file as context through the same channel as the editor's right-click action. */
  attach: (path: string) => post<FileSearchResponse>("/ide/file-attach", { path }),
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

  setBridgeEnabled: (enabled: boolean) =>
    post<IdeaBridgeStatus>("/ide/bridge/enabled", { enabled }),

};
