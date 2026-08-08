import { useCallback, useEffect, useState } from "react";
import { Bug, Globe, Hammer, Play, ScrollText, TerminalSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  SettingsHeader,
  SettingsMessage,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { ideaExecutionApi, type IdeaBridgeStatus } from "@/lib/ideaIntegrations";

/** What the bridge exposes to OpenCode. Listed so you can see what the AI is allowed to do. */
const bridgeTools = [
  {
    description: "列出并启动本项目的 Run/Debug 配置",
    icon: Play,
    name: "idea_run_configuration",
  },
  {
    description: "读取 Run、Debug、Maven、Gradle 的控制台输出",
    icon: ScrollText,
    name: "idea_read_run_log",
  },
  { description: "用 IDEA 内置 Maven Runner 执行目标", icon: Hammer, name: "idea_maven" },
  { description: "用 IDEA 外部构建系统执行 Gradle 任务", icon: Hammer, name: "idea_gradle" },
  { description: "控制内置浏览器窗口（工具 → 打开水豚浏览器）", icon: Globe, name: "idea_browser" },
];

export function IdeaExecutionSettings() {
  const [bridge, setBridge] = useState<IdeaBridgeStatus>();
  const [configurationCount, setConfigurationCount] = useState<number>();
  const [loading, setLoading] = useState(false);
  const { error, notice, setError } = useSettingsFeedback();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBridge, configurations] = await Promise.all([
        ideaExecutionApi.bridgeStatus(),
        ideaExecutionApi.configurations(),
      ]);
      setBridge(nextBridge);
      setConfigurationCount(configurations.length);
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <SettingsHeader
        description="这些能力由 AI 自动调用，运行过程和输出都显示在 IDEA 原生的 Run / Maven / Gradle 窗口里。这里只负责授权和状态检查。"
        loading={loading}
        onRefresh={() => void refresh()}
        title="IDEA 执行"
      />

      <SettingsMessage error={error} notice={notice} />

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/50 bg-card/60 px-4 py-3">
        <TerminalSquare className="size-4 text-muted-foreground" />
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">OpenCode 工具桥接</p>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">
            {bridge?.installed
              ? `运行中：${bridge.location}`
              : "未安装。若要停用，请到「插件」页把 capybara-idea 停用。"}
          </p>
        </div>
        <Badge variant={bridge?.installed ? "secondary" : "outline"}>
          {bridge?.installed ? "已启用" : "未启用"}
        </Badge>
      </div>

      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        桥接会在 IDEA 打开本项目时自动安装、关闭时自动移除，所以在 IDEA 之外运行的 OpenCode 不会看到这些工具。
        它同时负责执行输入框里的审批模式——OpenCode 的 REST 接口会丢弃权限设置，只有这个插件钩子能真正拦下联网、命令等操作。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>环境检查：</span>
        <Badge variant={bridge?.mavenAvailable ? "secondary" : "outline"}>
          Maven 插件{bridge?.mavenAvailable ? "可用" : "未启用"}
        </Badge>
        <Badge variant={bridge?.gradleAvailable ? "secondary" : "outline"}>
          Gradle 插件{bridge?.gradleAvailable ? "可用" : "未启用"}
        </Badge>
        <Badge variant="outline">
          识别到 {configurationCount ?? "—"} 个 Run/Debug 配置
        </Badge>
      </div>

      <div className="overflow-hidden rounded-md border border-border/50">
        <p className="border-b border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          桥接开启后 AI 可用的工具
        </p>
        {bridgeTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <article
              className="flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              key={tool.name}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <code className="shrink-0 text-xs">{tool.name}</code>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {tool.description}
              </span>
            </article>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        <Bug className="mr-1 inline size-3" />
        想手动运行任务时请直接用 IDEA 自带的运行配置下拉框、Maven 和 Gradle 工具窗口，那里的功能更完整。
      </p>
    </section>
  );
}
