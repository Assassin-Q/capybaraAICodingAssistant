import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

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
  /**
   * Lifts the scroll-to-bottom button clear of the task capsule.
   *
   * Raising its z-index cannot help: the composer is `relative z-10` and therefore its own
   * stacking context, so everything inside it — the capsule included — paints above this button
   * no matter what value it carries. Moving it is the only thing that actually works.
   */
  raiseScrollButton?: boolean;
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
  raiseScrollButton = false,
}: VirtualConversationProps) {
  const listRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  /** State, not a ref: the scroll listener below has to re-attach once Virtuoso hands it over. */
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  // Rebuilding this map on every footer change handed Virtuoso a new component *type*, which
  // unmounts and remounts the whole footer subtree — that is what made the approval dialog replay
  // its open animation on every poll. The types are created once and the content arrives through
  // Virtuoso's `context`, which re-renders them in place.
  const components = useMemo(() => ({
    Footer: ({ context }: { context?: { footer?: ReactNode } }) =>
      context?.footer ? <div className="px-3 pb-6 pt-0.5">{context.footer}</div> : <div className="h-5" />,
    Header: () => <div className="h-4" />,
  }), []);
  const context = useMemo(() => ({ footer }), [footer]);

  // scrollToIndex stops at the last item, which leaves the footer (thinking
  // indicator, permission and question cards) below the fold. Scrolling the
  // scroller itself reaches the true bottom.
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ behavior: "auto", top: Number.MAX_SAFE_INTEGER });
    // Virtuoso's handle can lag its own scroller by a frame during a re-measure, and the footer
    // lives outside the item list entirely, so the element is pinned directly as well.
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
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

  // Keep the newest content visible while streaming, but only if the user has not scrolled up.
  //
  // `items.length` alone misses the common case: during a run the last turn grows in place, so
  // the count never changes while the content gets taller and the view drifts off the bottom.
  // Watching the last item's identity as well re-anchors on every streamed update.
  const lastItemKey = items.length > 0 ? String(items[items.length - 1]?.key ?? "") : "";
  useEffect(() => {
    if (!atBottomRef.current) return;
    const timer = window.setTimeout(scrollToBottom, 60);
    return () => window.clearTimeout(timer);
  }, [footer, items.length, lastItemKey, scrollToBottom]);

  /**
   * Following is a user intention, so only the user may revoke it.
   *
   * Neither position nor direction can establish that on their own. Virtuoso drops `atBottom` past
   * a 72px gap, which one streamed code fence clears in a frame; and it also *lowers* scrollTop
   * itself when something above re-measures shorter — a tool card collapsing, a markdown block
   * reflowing — so "scrolled up" is not evidence of a user either. Both readings turned normal
   * streaming into a permanent loss of follow.
   *
   * A real gesture is the only reliable signal, so following is released only when the scroll
   * follows one closely enough in time to have caused it. Programmatic scrolls and re-measures
   * arrive with no gesture behind them and are ignored.
   */
  useEffect(() => {
    const scroller = scrollerEl;
    if (!scroller) return;
    let previousTop = scroller.scrollTop;
    let gestureAt = 0;
    const markGesture = () => { gestureAt = Date.now(); };
    const onScroll = () => {
      const top = scroller.scrollTop;
      const movedUp = top < previousTop - 2;
      previousTop = top;
      if (scroller.scrollHeight - top - scroller.clientHeight <= 72) {
        atBottomRef.current = true;
        setAtBottom(true);
        return;
      }
      // 180ms covers the gap between a wheel notch and the scroll it produces, including the
      // tail of a smooth-scroll, without letting an unrelated later reflow inherit the gesture.
      if (movedUp && Date.now() - gestureAt < 180) {
        atBottomRef.current = false;
        setAtBottom(false);
      }
    };
    // React effects fire on render, but the height a streamed block settles at arrives later and
    // without one. Observing the content is what keeps the view pinned through that final growth.
    const content = scroller.firstElementChild;
    const observer = content && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { if (atBottomRef.current) scrollToBottom(); })
      : undefined;
    if (content && observer) observer.observe(content);

    // pointerdown covers dragging the scrollbar itself, which fires no wheel or key event.
    scroller.addEventListener("wheel", markGesture, { passive: true });
    scroller.addEventListener("touchmove", markGesture, { passive: true });
    scroller.addEventListener("pointerdown", markGesture, { passive: true });
    scroller.addEventListener("keydown", markGesture);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      scroller.removeEventListener("wheel", markGesture);
      scroller.removeEventListener("touchmove", markGesture);
      scroller.removeEventListener("pointerdown", markGesture);
      scroller.removeEventListener("keydown", markGesture);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [scrollToBottom, scrollerEl]);

  if (items.length === 0 && !footer) {
    return <div className={cn("relative min-h-0 flex-1", className)}>{empty}</div>;
  }

  return (
    <div className={cn("relative min-h-0 flex-1", className)} role="log">
      <Virtuoso
        atBottomStateChange={(value) => {
          // Only ever re-arms. Virtuoso derives this from position, so letting it clear the flag
          // would reintroduce the very bug the scroll listener above exists to prevent.
          if (!value) return;
          atBottomRef.current = true;
          setAtBottom(true);
        }}
        atBottomThreshold={72}
        className="h-full overscroll-contain"
        components={components}
        context={context}
        computeItemKey={(_, item) => String(item.key)}
        data={items}
        followOutput={followOutput ? "auto" : false}
        increaseViewportBy={{ bottom: 700, top: 500 }}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        itemContent={(_, item) => <div className="px-3 pb-5">{item}</div>}
        ref={listRef}
        scrollerRef={(element) => {
          scrollerRef.current = element as HTMLElement | null;
          setScrollerEl(element as HTMLElement | null);
        }}
      />
      {!atBottom && items.length > 0 && (
        <Button
          aria-label={t("s_60f4cd8a8c")}
          // Right-aligned rather than centred: the todo capsule is centred on the same bottom edge
          // and covered this button whenever a run had a task list.
          className={cn(
            "absolute right-3 z-30 size-8 rounded-full border-0 bg-background/92 shadow-sm ring-1 ring-border/45 hover:bg-muted focus-visible:ring-1",
            raiseScrollButton ? "bottom-24" : "bottom-3"
          )}
          onClick={scrollToBottom}
          size="icon"
          title={t("s_60f4cd8a8c")}
          type="button"
          variant="ghost"
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );
}
