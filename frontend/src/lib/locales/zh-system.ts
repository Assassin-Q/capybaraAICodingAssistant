/**
 * Chinese strings for the language picker, the update notice and the OpenCode requirement notice.
 *
 * These were written by hand during the localisation pass and landed in `en.ts` only, so the
 * Chinese UI rendered the key names themselves. They live here, outside the generated tables, so
 * the next extraction run cannot drop them again.
 */
export const zhSystem = {
  "i18n.title": "界面语言",
  "i18n.description": "立即生效，并随工作区偏好一起保存。",
  "i18n.auto": "跟随环境",
  "i18n.autoHint": "检测为{p0}",
  "i18n.zhHint": "始终使用中文",
  "i18n.enHint": "始终使用英文",

  "update.current": "版本 {p0}",
  "update.available": "有新版本：{p0}",
  "update.latest": "已是最新",
  "update.unavailable": "无法检查更新",
  "update.download": "下载",
  "update.tooltip": "有可用更新",

  "skill.shadowed": "被同名技能覆盖",

  "opencode.installTitle": "尚未安装 OpenCode",
  "opencode.upgradeTitle": "OpenCode 版本过低",
  "opencode.copyCommand": "复制命令",
  "opencode.officialDocs": "官方安装文档",
  "opencode.restartHint": "安装或升级后请重启 IDE。",
} as const;
