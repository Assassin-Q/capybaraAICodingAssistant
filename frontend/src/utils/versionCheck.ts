import { version } from '../../package.json'

export const APP_VERSION = version
const GITEE_REPO = 'qianguanshui/capybaraAICodingAssistant'
const GITEE_API = `https://gitee.com/api/v5/repos/${GITEE_REPO}/releases/latest`
const RELEASES_URL = `https://gitee.com/${GITEE_REPO}/releases`

interface GiteeRelease {
  tag_name: string
  html_url: string
  prerelease: boolean
}

function compareVersions(a: string, b: string): number {
  const aParts = a.replace(/^v/, '').split('.').map(Number)
  const bParts = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] || 0
    const bNum = bParts[i] || 0
    if (aNum !== bNum) return aNum - bNum
  }
  return 0
}

export async function checkUpdate(): Promise<{
  hasUpdate: boolean
  latestVersion: string
  downloadUrl: string
}> {
  try {
    const response = await fetch(GITEE_API, { method: 'GET', signal: AbortSignal.timeout(8000) })
    if (!response.ok) {
      return { hasUpdate: false, latestVersion: APP_VERSION, downloadUrl: RELEASES_URL }
    }
    const data: GiteeRelease = await response.json()
    const latestVersion = data.tag_name.replace(/^v/, '')
    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0
    return {
      hasUpdate,
      latestVersion,
      downloadUrl: data.html_url || `${RELEASES_URL}/tag/${data.tag_name}`,
    }
  } catch {
    return { hasUpdate: false, latestVersion: APP_VERSION, downloadUrl: RELEASES_URL }
  }
}
