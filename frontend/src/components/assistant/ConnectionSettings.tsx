import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsMessage, useSettingsFeedback } from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi } from "@/lib/idea";
import { setOpenCodeBaseUrl } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface ConnectionSettingsProps {
  baseUrl: string;
  connected: boolean;
  /** Reloads models, agents, sessions and commands after the endpoint changes. */
  onChanged: () => void;
  projectPath?: string;
}

export function ConnectionSettings({ baseUrl, connected, onChanged, projectPath }: ConnectionSettingsProps) {
  const [restarting, setRestarting] = useState(false);
  const { error, notice, setError, setNotice } = useSettingsFeedback();

  const restart = async () => {
    setRestarting(true);
    setNotice("正在重启 OpenCode 服务…");
    setError("");
    try {
      const runtime = await ideaApi.restartOpenCode();
      if (runtime.error) {
        setNotice("");
        setError(runtime.error);
        return;
      }
      if (runtime.baseUrl) setOpenCodeBaseUrl(runtime.baseUrl);
      setNotice(
        runtime.managed
          ? `已重启插件托管的 OpenCode：${runtime.baseUrl ?? ""}`
          : `已重新连接到 OpenCode：${runtime.baseUrl ?? ""}`
      );
      onChanged();
    } catch (restartError) {
      setNotice("");
      setError(errorMessage(restartError));
    } finally {
      setRestarting(false);
    }
  };

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">连接</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            当前插件直接连接 OpenCode；IDEA 仅提供服务发现和编辑器上下文。
          </p>
        </div>
        <Button disabled={restarting} onClick={() => void restart()} size="sm" type="button" variant="outline">
          <RotateCcw className={cn("size-3.5", restarting && "animate-spin")} />
          重启服务
        </Button>
      </header>

      <SettingsMessage error={error} notice={notice} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{connected ? "OpenCode 已连接" : "OpenCode 未连接"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connected ? "服务响应正常" : "可以点击右上角“重启服务”重新发现或启动"}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">服务地址</dt>
            <dd className="mt-1 break-all font-mono text-xs">{baseUrl}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">工作区</dt>
            <dd className="mt-1 break-all font-mono text-xs">{projectPath ?? "未获取到项目路径"}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-muted-foreground">
        重启只作用于本机的 OpenCode 服务：若服务由插件启动，会先结束再重新拉起；若是你自己启动的，
        插件只重新探测 12001-12100 端口并重新连接，不会结束你的进程。
      </p>
    </section>
  );
}
