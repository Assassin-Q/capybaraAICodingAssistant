import { CircleAlert } from "lucide-react";
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
}: {
  diffs?: SessionFileDiff[];
  isStreaming: boolean;
  message: AssistantMessageData;
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
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{visibleError}</span>
          </div>
        )}
        {isStreaming && !hasProcess && !hasConclusion && <ThinkingLine />}
        <AssistantProcess conclusionPartID={conclusionPart?.id} isStreaming={isStreaming} message={message} />
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
