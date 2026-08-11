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

  "memoryPlugin.opencode-mem": "本地 Turso/libSQL 向量库，自动捕获、跨项目用户画像与管理面板。自动捕获会额外调用一次模型。",
  "memoryPlugin.opencode-agent-memory": "基于可编辑记忆块和 AGENTS.md 的本地记忆 harness。",
  "memoryPlugin.opencode-supermemory": "Supermemory 云端记忆，可用 npx supermemory local 自托管。默认数据会离开本机。",
  "memoryPlugin.opencode-working-memory": "把提取折进 OpenCode 自带的 compaction，不产生额外模型调用；没有向量检索。",
  "memoryPlugin.opencode-hindsight": "Vectorize 提供的托管记忆服务。",
  "memoryPlugin.nowledge-mem": "Nowledge Mem 的 OpenCode 集成。",

  "run.autoRetry": "连接中断，{seconds} 秒后自动重试（第 {attempt}/{max} 次）。点击右下角停止可取消。",

  "todo.stoppedAt": "停在第 {current}/{total} 步",

  "message.copy": "复制",
  "message.copied": "已复制",

  "diff.collapseFiles": "收起",
  "skillhub.clawhubSubtitle": "数据来自 ClawHub（clawhub.ai）",
  "skill.contextInstruction": "请使用技能「{name}」。该技能不在当前项目内，其说明文件位于本机绝对路径：{path}。请先读取该文件，按其中的说明执行。",
  "skill.chipLabel": "技能",
  "skill.enabled": "已启用",

  "opencode.installTitle": "尚未安装 OpenCode",
  "opencode.upgradeTitle": "OpenCode 版本过低",
  "opencode.copyCommand": "复制命令",
  "opencode.officialDocs": "官方安装文档",
  "opencode.restartHint": "安装或升级后请重启 IDE。",
} as const;
