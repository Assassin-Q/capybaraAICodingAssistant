import { Button } from "@/components/ui/button";
import { CircleAlert, GitFork, Undo2 } from "lucide-react";
import { memo } from "react";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { AssistantProcess } from "@/components/assistant/AssistantProcess";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { SessionDiffSummary } from "@/components/assistant/SessionDiffSummary";
import { TokenUsageSummary } from "@/components/assistant/TokenUsage";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type {
  AssistantMessage as AssistantMessageData,
  SessionFileDiff,
} from "@/lib/opencode";

function ThinkingLine() {
  return (
    <div aria-label="思考中" className="px-0.5 py-1 text-xs text-muted-foreground">
      <Shimmer duration={1}>思考中</Shimmer>
    </div>
  );
}

/**
 * Turns known provider failures into something actionable. The raw payloads are long JSON
 * blobs whose meaning is not obvious — the reasoning_content one in particular just means the
 * gateway cannot round-trip thinking output, which the user fixes by changing the variant.
 */
const explainProviderError = (value: string): string | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes("reasoning_content") && normalized.includes("thinking mode")) {
    return "当前中转站要求把思考内容原样回传，但它与 OpenCode 的请求格式不兼容。把思考档位切回「默认」，或换一个模型即可继续。";
  }
  if (normalized.includes("context") && normalized.includes("maximum") && normalized.includes("token")) {
    return "对话已超出该模型的上下文窗口。可以新开会话，或换一个上下文更大的模型。";
  }
  if (normalized.includes("insufficient_quota") || normalized.includes("exceeded your current quota")) {
    return "供应商返回额度不足，请检查该 API Key 的余额或配额。";
  }
  return undefined;
};

const visibleMessageError = (error?: string): string => {
  const value = error?.trim() ?? "";
  const normalized = value.toLowerCase();
  if (
    normalized === "provider turn interrupted"
    || normalized === "request aborted"
    || normalized === "aborterror"
  ) {
    return "";
  }
  return explainProviderError(value) ?? value;
};

export const AssistantMessage = memo(function AssistantMessage({
  message,
  isStreaming,
  diffs = [],
  onRecover,
  runActive = false,
}: {
  diffs?: SessionFileDiff[];
  isStreaming: boolean;
  /**
   * The session is still working, even if this particular message finished. OpenCode ends one
   * assistant message and starts the next mid-run, so a per-message flag folded the execution
   * trace the moment the first paragraph landed.
   */
  runActive?: boolean;
  message: AssistantMessageData;
  /** Offered on a failed turn so a provider rejection cannot poison the rest of the session. */
  onRecover?: (action: "revert" | "fork", messageID: string) => void;
}) {
  const visibleError = visibleMessageError(message.error);
  const lastProcessIndex = message.content.reduce(
    (index, part, currentIndex) => part.type === "reasoning" || part.type === "tool" ? currentIndex : index,
    -1
  );
  const conclusionPart = [...message.content]
    .map((part, index) => ({ index, part }))
    .reverse()
    .find(({ index, part }) => part.type === "text" && Boolean(part.text.trim()) && index > lastProcessIndex)?.part;
  const conclusion = conclusionPart?.type === "text" ? conclusionPart.text : "";
  const hasConclusion = Boolean(visibleError) || Boolean(conclusion.trim());
  const hasProcess = message.content.some((part) => part.type === "reasoning" || part.type === "tool");

  return (
    <Message from="assistant">
      <MessageContent className="max-w-full gap-2.5">
        {visibleError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">{visibleError}</span>
            </div>
            {/* A failed turn stays in the history and every later request carries it along, so one
                provider rejection can poison the rest of the session. These are the ways out. */}
            {onRecover && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-destructive/20 pt-2">
                <span className="text-[11px] opacity-80">这条失败的回合会留在上下文里：</span>
                <Button
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onRecover("revert", message.id)}
                  size="sm"
                  title="删除这条以及之后的所有消息，回到出错前的状态"
                  type="button"
                  variant="outline"
                >
                  <Undo2 className="size-3" />回到出错前
                </Button>
                <Button
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onRecover("fork", message.id)}
                  size="sm"
                  title="把出错前的内容复制成新会话，原会话保持不变"
                  type="button"
                  variant="outline"
                >
                  <GitFork className="size-3" />另存为新会话
                </Button>
              </div>
            )}
          </div>
        )}
        {isStreaming && !hasProcess && !hasConclusion && <ThinkingLine />}
        <AssistantProcess conclusionPartID={conclusionPart?.id} isStreaming={isStreaming || runActive} message={message} />
        {conclusion.trim() && <MarkdownResponse isAnimating={false} mode={isStreaming ? "streaming" : "static"}>{conclusion}</MarkdownResponse>}
        {!isStreaming && <SessionDiffSummary diffs={diffs} />}
        {!isStreaming && <TokenUsageSummary model={message.model} usage={message.tokens} />}
      </MessageContent>
    </Message>
  );
});

export function AssistantThinking() {
  return (
    <Message from="assistant">
      <MessageContent className="max-w-full gap-2.5 py-1 text-xs text-muted-foreground">
        <ThinkingLine />
      </MessageContent>
    </Message>
  );
}
