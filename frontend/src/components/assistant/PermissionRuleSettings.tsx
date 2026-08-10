import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Trash2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/assistant/ConfirmDialog";
import {
  EmptyState,
  SettingsHeader,
  SettingsMessage,
  useConfirm,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { permissionRuleApi, type PermissionRule } from "@/lib/ideaIntegrations";
import { cn } from "@/lib/utils";

const actionLabels: Record<string, string> = {
  bash: "执行终端命令",
  edit: "修改文件",
  external_directory: "访问工作区外文件",
  skill: "调用技能",
  task: "派生子任务",
  webfetch: "抓取网页",
  websearch: "联网搜索",
};

const actionLabel = (action: string): string => actionLabels[action] ?? action;

const formatTime = (value: number): string => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

/**
 * Shows and revokes the standing approvals created by answering "always".
 *
 * They are stored by OpenCode, outrank the approval mode, and survive restarts — so a rule granted
 * once keeps its category silent forever. Until this page existed there was nowhere to see that had
 * happened, which is how `websearch: *` could sit there suppressing every prompt unnoticed.
 */
export function PermissionRuleSettings() {
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const { error, notice, report, setError } = useSettingsFeedback();
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await permissionRuleApi.list();
      if (!result.success) {
        setError(result.message ?? "无法读取已授权规则");
        return;
      }
      setRules(result.rules ?? []);
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

  const blanket = useMemo(() => rules.filter((rule) => rule.blanket), [rules]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return rules;
    return rules.filter((rule) =>
      `${rule.action} ${rule.resource}`.toLocaleLowerCase().includes(normalized)
    );
  }, [query, rules]);

  const runAction = useCallback(async (ids: string[], fallback: string) => {
    setBusy(true);
    try {
      const result = await permissionRuleApi.remove(ids);
      if (report({ message: result.message ?? `已撤销 ${result.removed} 条规则`, success: result.success }, fallback)) {
        await refresh();
      }
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }, [refresh, report, setError]);

  const revoke = (rule: PermissionRule) =>
    confirm.ask({
      confirmLabel: "撤销",
      description: rule.blanket
        ? `撤销后，「${actionLabel(rule.action)}」将重新按当前审批模式询问。`
        : `撤销后，该操作将重新按当前审批模式询问：\n${rule.resource}`,
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction([rule.id], "规则已撤销");
      },
      title: `撤销「${actionLabel(rule.action)}」授权`,
    });

  const revokeAll = () =>
    confirm.ask({
      confirmLabel: "全部撤销",
      description: `将删除全部 ${rules.length} 条已授权规则，之后所有操作重新按审批模式询问。此操作不可撤销。`,
      destructive: true,
      onConfirm: async () => {
        confirm.close();
        await runAction([], "已撤销全部规则");
      },
      title: "撤销全部授权",
    });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SettingsHeader
        actions={rules.length > 0 && (
          <Button disabled={busy} onClick={revokeAll} size="sm" type="button" variant="outline">
            <Trash2 className="size-3.5" />
            全部撤销
          </Button>
        )}
        description="点击审批卡片上的「始终允许」会在这里留下一条永久规则。规则按项目保存，跨会话和重启生效，并且优先于审批模式——所以一条规则可以让某类操作永远不再询问。"
        loading={loading}
        onRefresh={() => void refresh()}
        title="已授权规则"
      />

      <SettingsMessage error={error} notice={notice} />

      {blanket.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            有 {blanket.length} 条<b>通配规则</b>（{blanket.map((rule) => actionLabel(rule.action)).join("、")}）。
            它们放行整类操作，无论审批模式选什么都不会再询问。
          </span>
        </div>
      )}

      {rules.length > 0 && (
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索规则..."
          value={query}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60">
        {visible.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-6" />}>
            {rules.length === 0
              ? "还没有任何永久授权。审批时选择「允许一次」不会在这里留下记录。"
              : "没有匹配的规则。"}
          </EmptyState>
        ) : visible.map((rule) => (
          <article
            className="flex items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0"
            key={rule.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{actionLabel(rule.action)}</span>
                <Badge variant={rule.blanket ? "outline" : "secondary"}>
                  {rule.blanket ? "通配 · 整类放行" : "指定操作"}
                </Badge>
                {rule.createdAt > 0 && (
                  <span className="text-[10px] text-muted-foreground">{formatTime(rule.createdAt)}</span>
                )}
              </div>
              <p className={cn(
                "mt-1 break-all font-mono text-[11px] leading-5",
                rule.blanket ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
              )}>
                {rule.blanket ? "* （全部）" : rule.resource}
              </p>
            </div>
            <Button
              aria-label="撤销这条规则"
              className="size-8 shrink-0 text-destructive"
              disabled={busy}
              onClick={() => revoke(rule)}
              size="icon"
              title="撤销"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </article>
        ))}
      </div>

      <ConfirmDialog
        busy={busy}
        onOpenChange={(open) => {
          if (!open) confirm.close();
        }}
        request={confirm.request}
      />
    </section>
  );
}
