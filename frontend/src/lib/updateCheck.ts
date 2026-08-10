import { version } from "../../package.json";

export const APP_VERSION = version as string;

const GITEE_REPO = "qianguanshui/capybaraAICodingAssistant";
const GITEE_API = `https://gitee.com/api/v5/repos/${GITEE_REPO}/releases/latest`;
const RELEASES_URL = `https://gitee.com/${GITEE_REPO}/releases`;

export interface UpdateStatus {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  /** True when the check itself could not run — offline, blocked, rate limited. */
  unavailable: boolean;
}

/** Numeric, segment by segment, so 3.10.0 sorts above 3.9.0 rather than below it. */
export const compareVersions = (left: string, right: string): number => {
  const a = left.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/**
 * Asks Gitee for the newest release.
 *
 * A failure is reported as `unavailable` rather than "up to date": the header dot turns amber only
 * on a real newer version, and claiming currency when the check never ran would be a quiet lie.
 */
export const checkForUpdate = async (): Promise<UpdateStatus> => {
  const base: UpdateStatus = {
    currentVersion: APP_VERSION,
    downloadUrl: RELEASES_URL,
    hasUpdate: false,
    latestVersion: APP_VERSION,
    unavailable: true,
  };
  try {
    const response = await fetch(GITEE_API, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return base;
    const data = await response.json() as { tag_name?: string; html_url?: string };
    const latestVersion = (data.tag_name ?? "").replace(/^v/i, "");
    if (!latestVersion) return base;
    return {
      currentVersion: APP_VERSION,
      downloadUrl: data.html_url || `${RELEASES_URL}/tag/${data.tag_name}`,
      hasUpdate: compareVersions(latestVersion, APP_VERSION) > 0,
      latestVersion,
      unavailable: false,
    };
  } catch {
    return base;
  }
};
