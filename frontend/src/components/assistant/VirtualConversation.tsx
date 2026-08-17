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
  // Virtuoso treats `scrollerRef` like a React callback ref. Passing a fresh function on every
  // render makes React clear the old ref with `null` and assign the element again; mirroring both
  // values into state then creates a null -> element -> render loop. Keep the ref callback stable.
  const handleScrollerRef = useCallback((element: HTMLElement | Window | null) => {
    const next = element instanceof HTMLElement ? element : null;
    scrollerRef.current = next;
    setScrollerEl((current) => current === next ? current : next);
  }, []);
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

  /**
   * Pins the scroller itself, which is the only thing that reaches the true bottom.
   *
   * `scrollToIndex` stops at the last item and leaves the footer — thinking indicator, permission
   * and question cards — below the fold. Virtuoso's `scrollTo` is worse still: it repositions
   * asynchronously, so calling it after the element had already been pinned nudged the view back
   * off the bottom a moment later. Its handle is used only before the scroller exists, when there
   * is nothing else to pin.
   */
  const scrollToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      listRef.current?.scrollTo({ behavior: "auto", top: Number.MAX_SAFE_INTEGER });
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, []);

  /**
   * Opening a session lands at the newest message, and keeps landing there until the height stops
   * moving.
   *
   * Virtuoso measures variable-height items after the first paint, so the anchor has to be
   * re-applied while that settles. A ladder of fixed timeouts was guessing when it finished, and
   * the last rung fired *after* the view had settled — which is the half-second jump off the
   * bottom. Watching `scrollHeight` stops as soon as it is stable, which is exactly the moment
   * there is nothing left to correct.
   */
  useEffect(() => {
    if (!conversationKey) return;
    atBottomRef.current = true;
    setAtBottom(true);
    let frame = 0;
    let lastHeight = -1;
    let stableFrames = 0;
    const deadline = performance.now() + 1500;
    const settle = () => {
      const height = scrollerRef.current?.scrollHeight ?? -1;
      stableFrames = height === lastHeight ? stableFrames + 1 : 0;
      lastHeight = height;
      scrollToBottom();
      if (stableFrames < 3 && performance.now() < deadline) {
        frame = window.requestAnimationFrame(settle);
      }
    };
    frame = window.requestAnimationFrame(settle);
    return () => window.cancelAnimationFrame(frame);
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
   * Re-anchor whenever the content itself gets taller, not only when the item list changes.
   *
   * The per-turn token usage line is appended inside the last message once the run reports its
   * totals: no new item, same last key, and the footer has already gone. None of the dependencies
   * above notice, so the view stopped just short of it and the user had to scroll by hand. Height
   * is the one signal that covers this and every other in-place growth.
   */
  useEffect(() => {
    if (!scrollerEl) return;
    let lastHeight = 0;
    let frame = 0;
    /*
     * Growth is measured as `scrollHeight`, deliberately.
     *
     * Watching the observed element's own box instead was wrong twice over: scrolling makes
     * Virtuoso re-measure and resize it, so reacting to that fed straight back into another scroll
     * — a loop that saturated the renderer and left the panel blank and unresponsive — while the
     * viewport child it was watching has a fixed height and never reported the growth that
     * mattered. `scrollHeight` is the content's height: it rises when there is more to show and is
     * untouched by scrolling, so it cannot feed itself.
     */
    const followIfGrown = () => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const height = scroller.scrollHeight;
      const grew = height > lastHeight;
      lastHeight = height;
      if (!grew || !atBottomRef.current || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        scrollToBottom();
      });
    };
    const observer = new ResizeObserver(followIfGrown);
    // Both the scroller and its content: the first catches the panel being resized, the second the
    // last message growing in place — which is how the per-turn usage line arrives.
    observer.observe(scrollerEl);
    if (scrollerEl.firstElementChild) observer.observe(scrollerEl.firstElementChild);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrollerEl, scrollToBottom]);

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
    let draggingScrollbar = false;
    const markGesture = () => { gestureAt = Date.now(); };
    const isScrollbarPointer = (event: PointerEvent | MouseEvent): boolean => {
      const bounds = scroller.getBoundingClientRect();
      const scrollbarWidth = Math.max(scroller.offsetWidth - scroller.clientWidth, 10);
      return event.clientX >= bounds.right - scrollbarWidth;
    };
    const beginPointerGesture = (event: PointerEvent | MouseEvent) => {
      markGesture();
      draggingScrollbar = isScrollbarPointer(event);
    };
    const trackPointerGesture = (event: PointerEvent | MouseEvent) => {
      if (event.buttons !== 1 || !isScrollbarPointer(event)) return;
      draggingScrollbar = true;
      markGesture();
    };
    const endPointerGesture = () => { draggingScrollbar = false; };
    const onScroll = () => {
      const top = scroller.scrollTop;
      const movedUp = top < previousTop - 2;
      previousTop = top;
      if (scroller.scrollHeight - top - scroller.clientHeight <= 72) {
        atBottomRef.current = true;
        setAtBottom(true);
        return;
      }
      // A native scrollbar drag can keep emitting scroll events well past the short wheel window,
      // so it holds an explicit flag until pointer release. Reflow has neither condition.
      if (movedUp && (draggingScrollbar || Date.now() - gestureAt < 180)) {
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

    // Chromium reports a native scrollbar drag as scroll events, but it does not reliably fire a
    // wheel event. Pointer and mouse fallbacks cover both JCEF implementations IDEA ships.
    scroller.addEventListener("wheel", markGesture, { passive: true });
    scroller.addEventListener("touchmove", markGesture, { passive: true });
    scroller.addEventListener("pointerdown", beginPointerGesture);
    scroller.addEventListener("pointermove", trackPointerGesture);
    scroller.addEventListener("mousedown", beginPointerGesture);
    scroller.addEventListener("mousemove", trackPointerGesture);
    scroller.addEventListener("keydown", markGesture);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerup", endPointerGesture);
    window.addEventListener("pointercancel", endPointerGesture);
    window.addEventListener("mouseup", endPointerGesture);
    window.addEventListener("blur", endPointerGesture);
    return () => {
      observer?.disconnect();
      scroller.removeEventListener("wheel", markGesture);
      scroller.removeEventListener("touchmove", markGesture);
      scroller.removeEventListener("pointerdown", beginPointerGesture);
      scroller.removeEventListener("pointermove", trackPointerGesture);
      scroller.removeEventListener("mousedown", beginPointerGesture);
      scroller.removeEventListener("mousemove", trackPointerGesture);
      scroller.removeEventListener("keydown", markGesture);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerup", endPointerGesture);
      window.removeEventListener("pointercancel", endPointerGesture);
      window.removeEventListener("mouseup", endPointerGesture);
      window.removeEventListener("blur", endPointerGesture);
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
        scrollerRef={handleScrollerRef}
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
