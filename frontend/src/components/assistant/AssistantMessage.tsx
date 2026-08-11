import { CircleAlert } from "lucide-react";
import { memo } from "react";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { AssistantProcess } from "@/components/assistant/AssistantProcess";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { SessionDiffSummary } from "@/components/assistant/SessionDiffSummary";
import { TokenUsageSummary } from "@/components/assistant/TokenUsage";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { t } from "@/lib/i18n";
import type {
  AssistantMessage as AssistantMessageData,
  SessionFileDiff,
} from "@/lib/opencode";

function ThinkingLine() {
  return (
    <div aria-label={t("s_fcb979ef0b")} className="px-0.5 py-1 text-xs text-muted-foreground">
      <Shimmer duration={1}>{t("s_fcb979ef0b")}</Shimmer>
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
    return t("s_a03b1f12c5");
  }
  if (normalized.includes("context") && normalized.includes("maximum") && normalized.includes("token")) {
    return t("s_4b3abc8591");
  }
  if (normalized.includes("insufficient_quota") || normalized.includes("exceeded your current quota")) {
    return t("s_3b32459688");
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
  onOpenSession,
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
  /** Opens the subagent session a task call created. */
  onOpenSession?: (sessionID: string) => void;
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
            {/* No recovery buttons here on purpose.
                "Save as new session" forked at `parentID`, and OpenCode's fork is exclusive of the
                message it is given — so the user's own prompt was dropped too, and a failure on the
                first turn produced an entirely empty session. "Back to before the error" called
                revert, which does not remove anything: it records `session.revert` and expects the
                client to stop rendering past that point, which this panel never did. Both looked
                like dead buttons. The card states the error and nothing else until the revert state
                is actually rendered. */}
          </div>
        )}
        {isStreaming && !hasProcess && !hasConclusion && <ThinkingLine />}
        <AssistantProcess conclusionPartID={conclusionPart?.id} isStreaming={isStreaming || runActive} message={message} onOpenSession={onOpenSession} />
        {conclusion.trim() && <MarkdownResponse isAnimating={false} mode={isStreaming ? "streaming" : "static"}>{conclusion}</MarkdownResponse>}
        {!isStreaming && !runActive && <SessionDiffSummary diffs={diffs} />}
        {!isStreaming && !runActive && <TokenUsageSummary model={message.model} usage={message.tokens} />}
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
