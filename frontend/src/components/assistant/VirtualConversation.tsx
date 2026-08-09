import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VirtualConversationProps {
  className?: string;
  empty?: ReactNode;
  footer?: ReactNode;
  followOutput: boolean;
  items: ReactElement[];
  /**
   * Bump to force a scroll to the very bottom — used when the user submits, so the
   * thinking placeholder is fully visible instead of half cut off.
   */
  pinToBottom?: number;
  /** Changes when a different conversation is shown, so the view can re-anchor to the bottom. */
  conversationKey?: string;
}

/**
 * AI Elements intentionally leaves list virtualization to the host app.
 * Virtuoso keeps dynamic Markdown/tool heights stable while only mounting the
 * visible history, which is important inside IDEA's smaller JCEF heap.
 */
export function VirtualConversation({
  className,
  empty,
  footer,
  followOutput,
  conversationKey,
  items,
  pinToBottom,
}: VirtualConversationProps) {
  const listRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const components = useMemo(() => ({
    Footer: () => footer ? <div className="px-3 pb-6 pt-0.5">{footer}</div> : <div className="h-5" />,
    Header: () => <div className="h-4" />,
  }), [footer]);

  // scrollToIndex stops at the last item, which leaves the footer (thinking
  // indicator, permission and question cards) below the fold. Scrolling the
  // scroller itself reaches the true bottom.
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ behavior: "auto", top: Number.MAX_SAFE_INTEGER });
  }, []);

  // Opening a session must land at the newest message. `initialTopMostItemIndex` only positions
  // by index, and with unmeasured variable-height items that lands short of the true bottom — so
  // the anchor is re-applied over a few frames while heights settle.
  useEffect(() => {
    if (!conversationKey) return;
    atBottomRef.current = true;
    setAtBottom(true);
    const timers = [0, 80, 240, 500].map((delay) => window.setTimeout(scrollToBottom, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [conversationKey, scrollToBottom]);

  // Virtuoso's followOutput only reacts to item changes, not to the Footer growing,
  // so the thinking placeholder would otherwise appear half below the fold.
  useEffect(() => {
    if (pinToBottom === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToBottom();
      // A second pass after layout settles, once the placeholder has real height.
      window.setTimeout(scrollToBottom, 120);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pinToBottom, scrollToBottom]);

  // Keep the newest content visible while streaming, but only if the user has not
  // scrolled up to read something.
  useEffect(() => {
    if (!atBottomRef.current) return;
    const timer = window.setTimeout(scrollToBottom, 60);
    return () => window.clearTimeout(timer);
  }, [footer, items.length, scrollToBottom]);

  if (items.length === 0 && !footer) {
    return <div className={cn("relative min-h-0 flex-1", className)}>{empty}</div>;
  }

  return (
    <div className={cn("relative min-h-0 flex-1", className)} role="log">
      <Virtuoso
        atBottomStateChange={(value) => {
          atBottomRef.current = value;
          setAtBottom(value);
        }}
        atBottomThreshold={72}
        className="h-full overscroll-contain"
        components={components}
        computeItemKey={(_, item) => String(item.key)}
        data={items}
        followOutput={followOutput ? "auto" : false}
        increaseViewportBy={{ bottom: 700, top: 500 }}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        itemContent={(_, item) => <div className="px-3 pb-5">{item}</div>}
        ref={listRef}
      />
      {!atBottom && items.length > 0 && (
        <Button
          aria-label="滚动到底部"
          className="absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full border-0 bg-background/92 shadow-sm ring-1 ring-border/45 hover:bg-muted focus-visible:ring-1"
          onClick={scrollToBottom}
          size="icon"
          title="滚动到底部"
          type="button"
          variant="ghost"
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );
}
