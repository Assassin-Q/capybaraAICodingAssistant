import { CircleAlert } from "lucide-react";
import { memo } from "react";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { AssistantProcess } from "@/components/assistant/AssistantProcess";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { SessionDiffSummary } from "@/components/assistant/SessionDiffSummary";
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
  return value;
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
