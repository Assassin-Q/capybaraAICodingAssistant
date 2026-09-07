import { ideaApi } from "@/lib/idea";
import { t } from "@/lib/i18n";
import { openCodeApi } from "@/lib/opencode";
import type { ModelInfo, OpenCodeConfig } from "@/lib/opencode";

const configCache = new Map<string, OpenCodeConfig>();
const selectableModelCache = new Map<string, ModelInfo[]>();

const configCacheKey = (directory?: string): string => directory?.trim() || "__default__";

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

/**
 * The bridge can answer while OpenCode is restarting with `{ success: false, config: {} }`.
 * That object is a failure envelope, not an empty user configuration. Keep the last successful
 * disk snapshot and retry briefly so a restart cannot make disabled providers reappear.
 */
interface ConfigReadResult {
  /** A successful read, including an intentionally empty config on a fresh install. */
  config?: OpenCodeConfig;
  /** True when the bridge answered, even if it returned a failure envelope. */
  responseReceived: boolean;
}

const readConfigSnapshot = async (directory?: string): Promise<ConfigReadResult> => {
  const key = configCacheKey(directory);
  let responseReceived = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await ideaApi.getOpenCodeConfig().catch(() => undefined);
    responseReceived ||= snapshot !== undefined;
    if (
      snapshot?.success === true
      && snapshot.config
      && typeof snapshot.config === "object"
    ) {
      const config = snapshot.config as OpenCodeConfig;
      configCache.set(key, config);
      return { config, responseReceived: true };
    }
    if (attempt < 2) await wait(120 * (attempt + 1));
  }
  return { config: configCache.get(key), responseReceived };
};

/**
 * MCP servers as configured on disk, skipping the disabled ones.
 *
 * These used to come from OpenCode's `/config`, which serves a snapshot cached when the instance
 * started, so a server added in settings did not appear until the service restarted. The settings
 * page writes opencode.jsonc, so reading the same file is what makes it show up at once. The
 * initial load also skipped the enabled check and offered servers the user had switched off.
 */
export const enabledMcpNames = async (directory?: string): Promise<string[]> => {
  const { config } = await readConfigSnapshot(directory);
  const mcp = config?.mcp ?? {};
  return Object.entries(mcp)
    .filter(([, config]) => config.enabled !== false)
    .map(([name]) => name);
};

/**
 * Models available to pick, filtered by the configuration file that the settings page edits.
 * OpenCode caches its own config at startup, so `/api/model` can still publish a model immediately
 * after it was disabled. Reading the disk snapshot makes every picker reflect the saved switch
 * without waiting for an externally managed OpenCode service to restart.
 */
export const selectableConfiguredModels = async (directory?: string): Promise<ModelInfo[]> => {
  const [models, snapshot] = await Promise.all([
    openCodeApi.listModels(directory),
    readConfigSnapshot(directory),
  ]);
  // A failed bridge response is not an empty configuration. Showing every live `/api/model`
  // entry here would make disabled providers/models reappear immediately after a restart. Keep
  // the last filtered list during a transient failure; if this is the first IDEA read, fail closed
  // with no models. If the bridge is unavailable altogether (standalone web mode), preserve the
  // old direct-API behavior.
  if (!snapshot.config) return snapshot.responseReceived ? (selectableModelCache.get(configCacheKey(directory)) ?? []) : models;
  const config = snapshot.config;
  const disabledProviders = new Set(config.disabled_providers ?? []);
  const selectable = models.filter((model) =>
    !disabledProviders.has(model.providerID)
    && !(config.provider?.[model.providerID]?.blacklist ?? []).includes(model.id));
  selectableModelCache.set(configCacheKey(directory), selectable);
  return selectable;
};

export interface ConfigApplyResult {
  /** False when OpenCode is still running with the old configuration. */
  live: boolean;
  message: string;
}

/**
 * Makes a just-written opencode.jsonc take effect in the running OpenCode.
 *
 * OpenCode reads its configuration once, at startup. Measured against a live server (1.18.x):
 * writing a new provider into the file and then calling `POST /instance/dispose`, `POST
 * /global/dispose`, or simply waiting five seconds all leave `GET /config` returning the old
 * provider list. There is no reload endpoint and no file watcher — only a restart works.
 *
 * So the restart is done here rather than being left to the user. When the plugin started the
 * server it is stopped and started again, and the new configuration is live by the time this
 * resolves. When the user started their own server the plugin only re-probes it and deliberately
 * does not kill someone else's process, so the caller is told plainly that it is still running the
 * old configuration instead of being shown a success that did not happen.
 */
export const applyConfigToOpenCode = async (): Promise<ConfigApplyResult> => {
  const runtime = await ideaApi.restartOpenCode().catch(() => undefined);
  if (!runtime || runtime.error) {
    return { live: false, message: runtime?.error ?? t("config.restartFailed") };
  }
  if (runtime.reconnectedOnly) {
    return { live: false, message: t("config.restartExternal") };
  }
  return { live: true, message: t("config.applied") };
};
