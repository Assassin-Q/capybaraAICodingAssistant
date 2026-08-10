import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface ConversationDividerProps {
  /** Renders a spinner and keeps the label muted while the work is still running. */
  busy?: boolean;
  className?: string;
  label: string;
}

/**
 * A rule across the conversation with a label in the middle, for events that happen *to* the
 * session rather than inside it — compaction, agent switches, model switches.
 *
 * These are not messages: giving them a bubble would imply someone said something. A divider
 * reads as a boundary in the transcript, which is what they actually are.
 */
export function ConversationDivider({ busy, className, label }: ConversationDividerProps) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-1.5 text-[11px] text-muted-foreground", className)}>
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className="flex shrink-0 items-center gap-1.5">
        {busy && <Loader2 className="size-3 animate-spin" />}
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
