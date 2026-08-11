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

  "memoryPlugin.opencode-mem": "A local Turso/libSQL vector store with automatic capture, a cross-project user profile and a management UI. Automatic capture costs one extra model call.",
  "memoryPlugin.opencode-agent-memory": "A local memory harness built on editable memory blocks and AGENTS.md.",
  "memoryPlugin.opencode-supermemory": "Supermemory cloud memory, self-hostable with npx supermemory local. By default the data leaves this machine.",
  "memoryPlugin.opencode-working-memory": "Folds extraction into OpenCode own compaction, so it costs no extra model call. No vector search.",
  "memoryPlugin.opencode-hindsight": "A hosted memory service from Vectorize.",
  "memoryPlugin.nowledge-mem": "The OpenCode integration for Nowledge Mem.",

  "run.autoRetry": "Connection dropped. Retrying in {seconds}s (attempt {attempt} of {max}). Press stop to cancel.",

  "todo.stoppedAt": "Stopped at step {current} of {total}",

  "message.copy": "Copy",
  "message.copied": "Copied",

  "diff.collapseFiles": "Collapse",
  "skill.enabled": "Enabled",

  "opencode.installTitle": "OpenCode is not installed",
  "opencode.upgradeTitle": "OpenCode is too old",
  "opencode.copyCommand": "Copy command",
  "opencode.officialDocs": "Official install guide",
  "opencode.restartHint": "Restart the IDE after installing or upgrading.",
} as const;
