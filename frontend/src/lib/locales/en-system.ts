/** English counterpart of [zhSystem]. Keys must stay in sync with it. */
export const enSystem = {
  "i18n.title": "Interface language",
  "i18n.description": "Applies immediately and is saved with your workspace preferences.",
  "i18n.auto": "Follow environment",
  "i18n.autoHint": "Detected as {p0}",
  // Each option names itself in its own language, so this one stays Chinese in both locales.
  "i18n.zhHint": "始终使用中文",
  "i18n.enHint": "Always use English",

  "update.current": "Version {p0}",
  "update.available": "Update available: {p0}",
  "update.latest": "Up to date",
  "update.unavailable": "Update check unavailable",
  "update.download": "Download",
  "update.tooltip": "An update is available",

  "opencode.installTitle": "OpenCode is not installed",
  "opencode.upgradeTitle": "OpenCode is too old",
  "opencode.copyCommand": "Copy command",
  "opencode.officialDocs": "Official install guide",
  "opencode.restartHint": "Restart the IDE after installing or upgrading.",
} as const;
