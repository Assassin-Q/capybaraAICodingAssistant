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
  "run.autoRetry": "Connection dropped. Retrying in {seconds}s (attempt {attempt} of {max}).",
  "run.cancelRetry": "Cancel retry",

  "todo.stoppedAt": "Stopped at step {current} of {total}",

  "message.copy": "Copy",
  "message.copied": "Copied",

  "diff.collapseFiles": "Collapse",
  "skillhub.clawhubSubtitle": "Data from ClawHub (clawhub.ai)",
  "skill.contextInstruction": "Use the \"{name}\" skill. It lives outside this project; its instructions are at the absolute path {path}. Read that file first and follow what it says.",
  "skill.chipLabel": "Skill",
  "vision.header": "[Image analysis] The conversation model cannot read images. These {count} image(s) were described by a vision model:",
  "vision.entry": "{name}: {description}",
  "vision.prompt": "Describe this image ({name}) in full: transcribe any text verbatim, and state UI elements, structure, error messages, code and data accurately. Describe only what you can actually see; do not speculate.",
  "vision.failed": "(analysis failed: {error})",
  "vision.empty": "The vision model returned nothing",
  "vision.settingsTitle": "Vision model",
  "vision.settingsHint": "Used to turn images into text when the conversation model cannot read them. Leave unset to send images unchanged.",
  "vision.none": "Disabled",
  "vision.noneAvailable": "No model with image input is configured yet — add one above first.",
  "vision.busy": "Analysing images…",

  "command.chipLabel": "Command",
  "command.clear": "Remove command",
  "skill.enabled": "Enabled",

  "opencode.installTitle": "OpenCode is not installed",
  "opencode.upgradeTitle": "OpenCode is too old",
  "opencode.copyCommand": "Copy command",
  "opencode.officialDocs": "Official install guide",
  "opencode.restartHint": "Restart the IDE after installing or upgrading.",
} as const;
