"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrainIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";

import { Shimmer } from "./shimmer";
import { t } from "@/lib/i18n";

interface ReasoningContextValue {
  duration: number | undefined;
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) throw new Error("Reasoning components must be used within Reasoning");
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  autoClose?: boolean;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 650;

export const Reasoning = memo(({
  className,
  autoClose = true,
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration: durationProp,
  children,
  ...props
}: ReasoningProps) => {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    defaultProp: defaultOpen ?? isStreaming,
    onChange: onOpenChange,
    prop: open,
  });
  const [duration, setDuration] = useControllableState<number | undefined>({
    defaultProp: undefined,
    prop: durationProp,
  });
  const startedAt = useRef<number | null>(null);
  const hasStreamed = useRef(isStreaming);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      hasStreamed.current = true;
      startedAt.current ??= Date.now();
      return;
    }
    if (startedAt.current !== null) {
      setDuration(Math.ceil((Date.now() - startedAt.current) / 1000));
      startedAt.current = null;
    }
  }, [isStreaming, setDuration]);

  useEffect(() => {
    if (isStreaming && !isOpen && defaultOpen !== false) setIsOpen(true);
  }, [defaultOpen, isOpen, isStreaming, setIsOpen]);

  useEffect(() => {
    if (!autoClose || !hasStreamed.current || isStreaming || !isOpen || hasAutoClosed) return;
    const timer = window.setTimeout(() => {
      setIsOpen(false);
      setHasAutoClosed(true);
    }, AUTO_CLOSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [autoClose, hasAutoClosed, isOpen, isStreaming, setIsOpen]);

  const context = useMemo(
    () => ({ duration, isOpen, isStreaming, setIsOpen }),
    [duration, isOpen, isStreaming, setIsOpen]
  );

  return (
    <ReasoningContext.Provider value={context}>
      <Collapsible
        className={cn("not-prose mb-2", className)}
        onOpenChange={setIsOpen}
        open={isOpen}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
});

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) return <Shimmer duration={1}>{t("s_138d5364bb")}</Shimmer>;
  if (duration === undefined) return t("s_347bb96578");
  return t("s_53ab92eadf") + duration + t("s_d9ad5055c3");
};

export const ReasoningTrigger = memo(({
  className,
  children,
  getThinkingMessage = defaultGetThinkingMessage,
  ...props
}: ReasoningTriggerProps) => {
  const { isStreaming, isOpen, duration } = useReasoning();
  return (
    <CollapsibleTrigger
      className={cn("flex w-fit max-w-full items-center gap-1.5 rounded px-0.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground", className)}
      {...props}
    >
      {children ?? <><BrainIcon className="size-3.5 shrink-0" />{getThinkingMessage(isStreaming, duration)}<ChevronRightIcon className={cn("ml-auto size-3.5 transition-transform", isOpen ? "rotate-90" : "rotate-0")} /></>}
    </CollapsibleTrigger>
  );
});

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
  streaming?: boolean;
};

export const ReasoningContent = memo(({ className, children, streaming = false, ...props }: ReasoningContentProps) => (
  <CollapsibleContent
    className={cn(
      "ml-1 mt-1 border-l border-border/40 py-1 pl-3 text-xs leading-5 text-muted-foreground outline-none",
      className
    )}
    {...props}
  >
    <Streamdown isAnimating={false} mode={streaming ? "streaming" : "static"}>{children}</Streamdown>
  </CollapsibleContent>
));

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
