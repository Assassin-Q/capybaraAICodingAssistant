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
import { t } from "@/lib/i18n";

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
        aria-label={t("s_429b34f8cf")}
        className="h-7 min-w-0 gap-1 rounded-md border-0 bg-transparent px-1.5 text-[10px] text-muted-foreground shadow-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-0"
        title={t("s_dafb5b06b8")}
      />
      <ContextContent
        align="end"
        className="z-50 w-56 divide-y-0 border-border/40 shadow-sm"
        side="top"
        sideOffset={8}
      >
        <ContextContentHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">{t("s_9a1fbe0bb9")}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{formatPercent(usedPercent)}</span>
          </div>
          <Progress className="bg-muted" value={usedPercent} />
          <div className="text-[11px] text-muted-foreground">
            {t("s_4c9426f3cb")} {formatTokens(context.usedTokens)}{t("s_e6d3975537")} {formatTokens(maxTokens)}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-[11px]">
            <span className="text-muted-foreground">{t("s_98fd0cbd9c")}</span>
            <span className="max-w-36 truncate font-mono text-[10px]" title={context.modelId}>
              {context.model?.name ?? context.modelId ?? t("s_8b2303608f")}
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
    : t("s_8b2303608f");

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-muted-foreground">
      <span className="font-medium text-foreground/70">{t("s_566e162e8b")}</span>
      <span className="max-w-48 truncate" title={modelName}>{modelName}</span>
      {model?.variant && <span>{t("s_2cfe7e4072")} {variantLabel(model.variant)}</span>}
      <span>{t("s_e8850440f2")} {formatTokens(usage?.input ?? 0)}</span>
      <span>{t("s_ded698ae1e")} {formatTokens(usage?.output ?? 0)}</span>
      <span>{t("s_c9d3b085e2")} {formatTokens(usage?.reasoning ?? 0)}</span>
      {usage?.cache.reported ? (
        <>
          <span title={t("s_d9eab7bfeb")}>{t("s_37ec7f1ba3")} {formatTokens(usage.cache.read)}</span>
          <span title={t("s_2c58c7a1ce")}>{t("s_6d103bdf73")} {formatTokens(usage.cache.write)}</span>
        </>
      ) : (
        <span title={t("s_82d0657b3f")}>{t("s_f9d6d763ff")}</span>
      )}
    </div>
  );
}
