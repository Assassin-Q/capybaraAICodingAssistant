import { ideaApi } from "@/lib/idea";
import { t } from "@/lib/i18n";
import type { OpenCodeConfig } from "@/lib/opencode";

/**
 * MCP servers as configured on disk, skipping the disabled ones.
 *
 * These used to come from OpenCode's `/config`, which serves a snapshot cached when the instance
 * started, so a server added in settings did not appear until the service restarted. The settings
 * page writes opencode.jsonc, so reading the same file is what makes it show up at once. The
 * initial load also skipped the enabled check and offered servers the user had switched off.
 */
export const enabledMcpNames = async (): Promise<string[]> => {
  const snapshot = await ideaApi.getOpenCodeConfig().catch(() => undefined);
  const mcp = (snapshot?.config as OpenCodeConfig | undefined)?.mcp ?? {};
  return Object.entries(mcp)
    .filter(([, config]) => config.enabled !== false)
    .map(([name]) => name);
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
