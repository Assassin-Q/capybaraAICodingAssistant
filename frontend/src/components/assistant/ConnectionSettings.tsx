import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppearanceSettings } from "@/components/assistant/AppearanceSettings";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import { SettingsMessage, useConfirm, useSettingsFeedback } from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi, type IdeaRuntimeConfig } from "@/lib/idea";
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
  /** Set when a restart turned out to be a no-op against an externally started server. */
  const [external, setExternal] = useState<IdeaRuntimeConfig>();
  const confirm = useConfirm();
  const { error, notice, setError, setNotice } = useSettingsFeedback();

  const restart = async (force: boolean) => {
    setRestarting(true);
    setNotice(force ? "正在结束并重新启动 OpenCode…" : "正在重新连接 OpenCode…");
    setError("");
    setExternal(undefined);
    try {
      const runtime = await ideaApi.restartOpenCode(force);
      if (runtime.error) {
        setNotice("");
        setError(runtime.error);
        return;
      }
      if (runtime.baseUrl) setOpenCodeBaseUrl(runtime.baseUrl);
      if (runtime.reconnectedOnly) {
        // Be explicit: nothing was restarted, so plugin changes are still not loaded.
        setNotice("");
        setExternal(runtime);
      } else {
        setNotice(
          runtime.managed
            ? `已重启插件托管的 OpenCode：${runtime.baseUrl ?? ""}`
            : `已结束原进程并重新启动：${runtime.baseUrl ?? ""}`
        );
      }
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
        <Button disabled={restarting} onClick={() => void restart(false)} size="sm" type="button" variant="outline">
          <RotateCcw className={cn("size-3.5", restarting && "animate-spin")} />
          重启服务
        </Button>
      </header>

      <SettingsMessage error={error} notice={notice} />

      {external && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <p className="font-medium">没有真正重启——这个 OpenCode 不是插件启动的</p>
          <p className="mt-1 leading-5">
            插件只是重新连接到了同一个进程
            {external.externalPid ? `（PID ${external.externalPid}）` : ""}，进程从未停止。
            <b>OpenCode 只在启动时加载插件</b>，所以工具桥接、审批模式、新装的技能都不会生效。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              disabled={restarting}
              onClick={() =>
                confirm.ask({
                  confirmLabel: "结束并重启",
                  description: `将结束进程${external.externalPid ? ` PID ${external.externalPid}` : ""}，然后由插件重新启动 OpenCode。该进程上正在进行的任何工作都会中断。`,
                  destructive: true,
                  onConfirm: async () => {
                    confirm.close();
                    await restart(true);
                  },
                  title: "结束外部启动的 OpenCode？",
                })
              }
              size="sm"
              type="button"
              variant="destructive"
            >
              强制重启
            </Button>
            <span className="text-[11px] opacity-80">或者到你启动它的终端里自行重启</span>
          </div>
        </div>
      )}

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
      {/* Appearance had its own page for two settings; it lives here now. */}
      <div className="border-t border-border pt-5">
        <AppearanceSettings />
      </div>

      <ConfirmDialog
        busy={restarting}
        onOpenChange={(open) => {
          if (!open) confirm.close();
        }}
        request={confirm.request}
      />
    </section>
  );
}
