import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Progress } from "@/components/ui/progress";
import type { ContextUsageInfo } from "@/lib/tokenUsage";
import { hasTokenUsage, toLanguageModelUsage } from "@/lib/tokenUsage";
import type { TokenUsage } from "@/lib/opencode";
import type { ModelRef } from "@/lib/opencode";
import { variantLabel } from "@/components/assistant/modelVariants";

const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const formatTokens = (value: number): string => compactFormatter.format(Math.max(0, value));

const formatPercent = (value: number): string =>
  `${Math.round(Math.max(0, Math.min(100, value)))}%`;

export function ContextUsageIndicator({ context }: { context?: ContextUsageInfo }) {
  const maxTokens = context?.maxTokens;
  if (!context || !maxTokens || maxTokens <= 0) return null;

  const usedTokens = Math.min(context.usedTokens, maxTokens);
  const usedPercent = (usedTokens / maxTokens) * 100;
  const usage = toLanguageModelUsage(context.tokens);

  return (
    <Context
      maxTokens={maxTokens}
      modelId={context.modelId}
      openDelay={80}
      usedTokens={usedTokens}
      usage={usage}
    >
      <ContextTrigger
        aria-label="查看上下文占用"
        className="h-7 min-w-0 gap-1 rounded-md border-0 bg-transparent px-1.5 text-[10px] text-muted-foreground shadow-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-0"
        title="上下文占用"
      />
      <ContextContent
        align="end"
        className="z-50 w-56 divide-y-0 border-border/40 shadow-sm"
        side="top"
        sideOffset={8}
      >
        <ContextContentHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">上下文窗口</span>
            <span className="font-mono tabular-nums text-muted-foreground">{formatPercent(usedPercent)}</span>
          </div>
          <Progress className="bg-muted" value={usedPercent} />
          <div className="text-[11px] text-muted-foreground">
            已用 {formatTokens(context.usedTokens)}，共 {formatTokens(maxTokens)}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-[11px]">
            <span className="text-muted-foreground">模型</span>
            <span className="max-w-36 truncate font-mono text-[10px]" title={context.modelId}>
              {context.model?.name ?? context.modelId ?? "未知模型"}
            </span>
          </div>
        </ContextContentHeader>
      </ContextContent>
    </Context>
  );
}

export function TokenUsageSummary({ model, usage }: { model?: ModelRef; usage?: TokenUsage }) {
  if (!hasTokenUsage(usage) && !model?.id) return null;

  const modelName = model?.id
    ? `${model.providerID}/${model.id}`
    : "未知模型";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-muted-foreground">
      <span className="font-medium text-foreground/70">本轮用量</span>
      <span className="max-w-48 truncate" title={modelName}>{modelName}</span>
      {model?.variant && <span>档位 {variantLabel(model.variant)}</span>}
      <span>输入 {formatTokens(usage?.input ?? 0)}</span>
      <span>输出 {formatTokens(usage?.output ?? 0)}</span>
      <span>推理 {formatTokens(usage?.reasoning ?? 0)}</span>
      {usage?.cache.reported ? (
        <>
          <span title="OpenCode 返回的缓存读取 Token">缓存读 {formatTokens(usage.cache.read)}</span>
          <span title="OpenCode 返回的缓存写入 Token">缓存写 {formatTokens(usage.cache.write)}</span>
        </>
      ) : (
        <span title="当前供应商没有返回缓存用量">缓存 不可用</span>
      )}
    </div>
  );
}
