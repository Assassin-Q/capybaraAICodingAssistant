"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { BundledLanguage } from "shiki";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";
import { t } from "@/lib/i18n";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-1 w-fit max-w-full overflow-hidden rounded-md bg-transparent data-[state=open]:w-full", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  detail?: string;
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | { type: DynamicToolUIPart["type"]; state: DynamicToolUIPart["state"]; toolName: string }
);

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const statusLabels = (): Record<ToolPart["state"], string> => ({
  "approval-requested": t("s_25a45621ed"),
  "approval-responded": t("s_712c9a0ec7"),
  "input-available": t("s_1f425b6bf0"),
  "input-streaming": t("s_4f1f8aa3ff"),
  "output-available": t("s_e99b48a29b"),
  "output-denied": t("s_4c7c52c706"),
  "output-error": t("s_9746cfc7d2"),
});

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3 text-amber-600" />,
  "approval-responded": <CheckCircleIcon className="size-3 text-sky-600" />,
  "input-available": <ClockIcon className="size-3 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-3" />,
  "output-available": <CheckCircleIcon className="size-3 text-emerald-600" />,
  "output-denied": <XCircleIcon className="size-3 text-amber-600" />,
  "output-error": <XCircleIcon className="size-3 text-destructive" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="h-5 gap-1 rounded-md border-0 bg-transparent px-0 text-[10px] font-normal text-muted-foreground" variant="ghost">
    {statusIcons[status]}
    {statusLabels()[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  detail,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  return (
    <CollapsibleTrigger
      className={cn("inline-flex h-7 w-fit max-w-full items-center justify-start gap-1.5 rounded-md px-1.5 py-1 text-left leading-none outline-none hover:bg-muted/60 focus-visible:ring-0", className)}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-1.5 leading-none">
        <WrenchIcon className="size-3.5 shrink-0 self-center text-muted-foreground" />
        <span className="truncate text-xs font-medium leading-none">{title ?? derivedName}</span>
        {detail && <span className="max-w-[min(34rem,60vw)] truncate font-mono text-[10px] font-normal text-muted-foreground">{detail}</span>}
        {getStatusBadge(state)}
      </div>
      <ChevronRightIcon className="size-3.5 shrink-0 self-center text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "ml-5 space-y-2 rounded-md bg-muted/30 px-2.5 py-2.5 text-xs outline-none",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & { input: ToolPart["input"] };

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
    <h4 className="text-[10px] font-medium text-muted-foreground">{t("s_749d765242")}</h4>
    <CodeBlock
      className="border-0 bg-muted/20"
      code={typeof input === "string" ? input : JSON.stringify(input, null, 2)}
      language="json"
    />
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) return null;
  let renderedOutput = <div className="whitespace-pre-wrap">{output as ReactNode}</div>;
  if (typeof output === "object" && !isValidElement(output)) {
    renderedOutput = <CodeBlock className="border-0 bg-muted/20" code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    renderedOutput = <CodeBlock className="border-0 bg-muted/20" code={output} language={"text" as BundledLanguage} />;
  }
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-medium text-muted-foreground">{errorText ? t("s_b859c7be75") : t("s_0a2c91cec6")}</h4>
      <div className={cn("overflow-x-auto rounded-md text-xs [&_table]:w-full", errorText ? "bg-destructive/10 px-2 py-1.5 text-destructive" : "")}>
        {errorText && <div className="whitespace-pre-wrap">{errorText}</div>}
        {!errorText && renderedOutput}
      </div>
    </div>
  );
};
