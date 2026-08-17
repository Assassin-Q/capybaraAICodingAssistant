import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VirtualConversationProps {
  className?: string;
  conversationKey?: string;
  empty?: ReactNode;
  footer?: ReactNode;
  items: ReactElement[];
  /** Incremented when the user submits a prompt. */
  pinToBottom?: number;
  raiseScrollButton?: boolean;
  /** True until the current OpenCode run has fully finished. */
  runActive: boolean;
}

const BOTTOM_THRESHOLD = 50;
const COMPLETION_FOLLOW_DELAY = 3000;

/**
 * Virtualized conversation history with explicit user-controlled output following.
 *
 * Streaming content changes height without adding a new list item. A single ResizeObserver follows
 * that growth while auto-scroll is enabled; wheel-up, touch and native scrollbar gestures disable
 * it immediately. This avoids treating Virtuoso remeasurement as user intent.
 */
export function VirtualConversation({
  className,
  conversationKey,
  empty,
  footer,
  items,
  pinToBottom,
  raiseScrollButton = false,
  runActive,
}: VirtualConversationProps) {
  const listRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [autoScroll, setAutoScroll] = useState(runActive);
  const autoScrollRef = useRef(runActive);
  const runActiveRef = useRef(runActive);
  const previousRunActive = useRef(runActive);
  const previousPin = useRef(pinToBottom);

  const setAutoScrollEnabled = useCallback((enabled: boolean) => {
    autoScrollRef.current = enabled;
    setAutoScroll((current) => current === enabled ? current : enabled);
  }, []);

  const handleScrollerRef = useCallback((element: HTMLElement | Window | null) => {
    const next = element instanceof HTMLElement ? element : null;
    scrollerRef.current = next;
    setScrollerEl((current) => current === next ? current : next);
  }, []);

  const components = useMemo(() => ({
    Footer: ({ context }: { context?: { footer?: ReactNode } }) =>
      context?.footer ? <div className="px-3 pb-6 pt-0.5">{context.footer}</div> : <div className="h-5" />,
    Header: () => <div className="h-4" />,
  }), []);
  const context = useMemo(() => ({ footer }), [footer]);

  const scrollToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      setAtBottom(true);
      return;
    }
    listRef.current?.scrollTo({ behavior: "auto", top: Number.MAX_SAFE_INTEGER });
  }, []);

  // A selected conversation always opens at its newest content. An active run also resumes follow.
  useEffect(() => {
    if (!conversationKey) return;
    setAutoScrollEnabled(runActive);
    let frame = 0;
    let previousHeight = -1;
    let stableFrames = 0;
    const deadline = performance.now() + 1200;
    const settle = () => {
      const height = scrollerRef.current?.scrollHeight ?? -1;
      stableFrames = height === previousHeight ? stableFrames + 1 : 0;
      previousHeight = height;
      scrollToBottom();
      if (stableFrames < 2 && performance.now() < deadline) {
        frame = window.requestAnimationFrame(settle);
      }
    };
    frame = window.requestAnimationFrame(settle);
    return () => window.cancelAnimationFrame(frame);
  }, [conversationKey, scrollToBottom, setAutoScrollEnabled]);

  // Submitting is an explicit request to follow the new round, even if the user had scrolled up.
  useEffect(() => {
    if (pinToBottom === undefined || pinToBottom === previousPin.current) return;
    previousPin.current = pinToBottom;
    setAutoScrollEnabled(true);
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [pinToBottom, scrollToBottom, setAutoScrollEnabled]);

  // Keep following long enough for the final token-usage row to mount, then release the observer.
  useEffect(() => {
    runActiveRef.current = runActive;
    let timer = 0;
    if (runActive) {
      previousRunActive.current = true;
      return;
    }
    if (previousRunActive.current) {
      previousRunActive.current = false;
      timer = window.setTimeout(() => setAutoScrollEnabled(false), COMPLETION_FOLLOW_DELAY);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [runActive, setAutoScrollEnabled]);

  // Streamed Markdown, reasoning, tools and the token footer all grow in place.
  useEffect(() => {
    if (!scrollerEl || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const followGrowth = () => {
      if (!autoScrollRef.current || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        scrollToBottom();
      });
    };
    const observer = new ResizeObserver(followGrowth);
    observer.observe(scrollerEl);
    if (scrollerEl.firstElementChild) observer.observe(scrollerEl.firstElementChild);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrollerEl, scrollToBottom]);

  // New footer nodes can mount before ResizeObserver sees their final dimensions.
  const lastItemKey = items.length > 0 ? String(items[items.length - 1]?.key ?? "") : "";
  useEffect(() => {
    if (!autoScrollRef.current) return;
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [footer, items.length, lastItemKey, scrollToBottom]);

  useEffect(() => {
    const scroller = scrollerEl;
    if (!scroller) return;

    const stopFollowing = () => setAutoScrollEnabled(false);
    const isScrollbarPointer = (event: MouseEvent | PointerEvent): boolean => {
      const bounds = scroller.getBoundingClientRect();
      const gutter = Math.max(scroller.offsetWidth - scroller.clientWidth, 12);
      return event.clientX >= bounds.right - gutter;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) stopFollowing();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (isScrollbarPointer(event)) stopFollowing();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (isScrollbarPointer(event)) stopFollowing();
    };
    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const nextAtBottom = distance < BOTTOM_THRESHOLD;
      setAtBottom((current) => current === nextAtBottom ? current : nextAtBottom);
      if (nextAtBottom && runActiveRef.current && !autoScrollRef.current) {
        setAutoScrollEnabled(true);
      }
    };

    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("mousedown", onMouseDown);
    scroller.addEventListener("touchstart", stopFollowing, { passive: true });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("mousedown", onMouseDown);
      scroller.removeEventListener("touchstart", stopFollowing);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [scrollerEl, setAutoScrollEnabled]);

  const handleScrollToBottom = () => {
    setAutoScrollEnabled(runActiveRef.current);
    scrollToBottom();
  };

  if (items.length === 0 && !footer) {
    return <div className={cn("relative min-h-0 flex-1", className)}>{empty}</div>;
  }

  return (
    <div className={cn("relative min-h-0 flex-1", className)} role="log">
      <Virtuoso
        atBottomThreshold={BOTTOM_THRESHOLD}
        className="h-full overscroll-contain"
        components={components}
        computeItemKey={(_, item) => String(item.key)}
        context={context}
        data={items}
        followOutput={autoScroll ? "auto" : false}
        increaseViewportBy={{ bottom: 700, top: 500 }}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        itemContent={(_, item) => <div className="px-3 pb-5">{item}</div>}
        ref={listRef}
        scrollerRef={handleScrollerRef}
      />
      {!atBottom && items.length > 0 && (
        <Button
          aria-label={t("s_60f4cd8a8c")}
          className={cn(
            "absolute right-3 z-30 size-8 rounded-full border-0 bg-background/92 shadow-sm ring-1 ring-border/45 hover:bg-muted focus-visible:ring-1",
            raiseScrollButton ? "bottom-24" : "bottom-3"
          )}
          onClick={handleScrollToBottom}
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
