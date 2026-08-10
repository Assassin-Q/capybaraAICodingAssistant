import { Check, Circle, CornerDownRight, LoaderCircle } from "lucide-react";
import { memo, useMemo, useState } from "react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { formatToolValue, toolState } from "@/components/assistant/shared";
import { ToolCallInput, ToolCallOutput } from "@/components/assistant/ToolCallDetails";
import { t } from "@/lib/i18n";
import type {
  AssistantMessage,
  AssistantReasoningPart,
  AssistantTextPart,
  AssistantToolPart,
  TodoInfo,
} from "@/lib/opencode";

const toolLabels: Record<string, string> = {
  apply_patch: t("s_80e1ecebdb"),
  bash: t("s_bf162782f5"),
  edit: t("s_fa65902674"),
  glob: t("s_acf33b0f89"),
  grep: t("s_9131beb744"),
  idea_diagnostics: t("s_205dc38bbd"),
  idea_editor_context: t("s_db9ccfc42f"),
  idea_browser: t("s_c7f43c2a38"),
  idea_gradle: t("s_91f9f469b5"),
  idea_maven: t("s_1a64e6ede4"),
  idea_navigate: t("s_4385b51155"),
  idea_project_context: t("s_333b0ae2f7"),
  idea_read_run_log: t("s_1c1deb0506"),
  idea_refresh_project: t("s_194fa9eeda"),
  idea_run_configuration: t("s_1005ab48e2"),
  idea_symbol: t("s_f1908323b6"),
  list: t("s_64e86e0d07"),
  question: t("s_ac6995265c"),
  read: t("s_dc995cddfa"),
  task: t("s_d3c1926c04"),
  todo: t("s_94464c4619"),
  todowrite: t("s_94464c4619"),
  write: t("s_e620fd4b1f"),
};

const toolActions: Record<string, string> = {
  apply_patch: t("s_b4ddc6bbab"),
  bash: t("s_f3f2330801"),
  edit: t("s_b4ddc6bbab"),
  glob: t("s_aee0becc24"),
  grep: t("s_fd45887b39"),
  idea_diagnostics: t("s_7fbd257a26"),
  idea_editor_context: t("s_55b6ee2057"),
  idea_browser: t("s_f90322ecb1"),
  idea_gradle: t("s_8291a51792"),
  idea_maven: t("s_32e40b46a8"),
  idea_navigate: t("s_0744fd62cd"),
  idea_project_context: t("s_3f771e4374"),
  idea_read_run_log: t("s_82cb98360c"),
  idea_refresh_project: t("s_026da51d8f"),
  idea_run_configuration: t("s_43f6d04083"),
  idea_symbol: t("s_a9d9dcd1a6"),
  list: t("s_33dce06cc1"),
  question: t("s_2be24f9324"),
  read: t("s_be2848d624"),
  task: t("s_ffc4e1cfb3"),
  todo: t("s_13b6dc6f05"),
  todowrite: t("s_13b6dc6f05"),
  write: t("s_b4ddc6bbab"),
};

const toolTitle = (name: string): string => toolLabels[name.toLowerCase()] ?? name;

const toolAction = (name: string): string => toolActions[name.toLowerCase()] ?? t("s_536714e7dd", { p0: name });

const normalizedToolValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const objectValue = (value: unknown): Record<string, unknown> | undefined => {
  const normalized = normalizedToolValue(value);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : undefined;
};

const compactValue = (value: unknown): string => {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const toolInlineDetail = (name: string, value: unknown): string => {
  const input = objectValue(value);
  if (!input) {
    const compact = compactValue(value);
    return compact.startsWith("{") || compact.startsWith("[") ? "" : compact;
  }
  const lowerName = name.toLowerCase();
  if (lowerName === "bash") return compactValue(input.command ?? input.cmd);
  if (["read", "write", "edit"].includes(lowerName)) {
    return compactValue(input.filePath ?? input.path ?? input.filename);
  }
  if (lowerName === "task") return compactValue(input.description ?? input.command ?? input.subagent_type ?? input.agent);
  if (lowerName === "grep") return compactValue(input.pattern ?? input.query ?? input.path);
  if (lowerName === "glob") return compactValue(input.pattern ?? input.path);
  if (["idea_editor_context", "idea_diagnostics"].includes(lowerName)) {
    return compactValue(input.path) || t("s_da166942c7");
  }
  if (["idea_navigate", "idea_symbol"].includes(lowerName)) {
    const path = compactValue(input.path) || t("s_da166942c7");
    const line = compactValue(input.line);
    return line ? `${path}:${line}` : path;
  }
  return compactValue(input.name ?? input.description ?? input.command);
};

const todosFromTool = (tool: AssistantToolPart): TodoInfo[] => {
  const input = objectValue(tool.state.input);
  const values = Array.isArray(input?.todos) ? input.todos : [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const todo = value as Record<string, unknown>;
    if (typeof todo.content !== "string") return [];
    return [{
      content: todo.content,
      priority: typeof todo.priority === "string" ? todo.priority : "medium",
      status: typeof todo.status === "string" ? todo.status : "pending",
    }];
  });
};

function TodoSnapshot({ todos }: { todos: TodoInfo[] }) {
  return (
    <div className="space-y-1 py-0.5">
      {todos.map((todo, index) => {
        const complete = todo.status === "completed";
        const active = todo.status === "in_progress";
        const Icon = complete ? Check : active ? LoaderCircle : Circle;
        return (
          <div className="flex items-start gap-2 text-xs" key={`${todo.content}-${index}`}>
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${active ? "animate-spin text-primary" : complete ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span className={complete ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>{todo.content}</span>
          </div>
        );
      })}
    </div>
  );
}

type NarrativePart = AssistantTextPart | AssistantReasoningPart;
type ProcessBlock =
  | { type: "narrative"; part: NarrativePart }
  | { type: "tools"; tools: AssistantToolPart[] };

const buildProcessBlocks = (parts: Array<NarrativePart | AssistantToolPart>): ProcessBlock[] => {
  const blocks: ProcessBlock[] = [];
  parts.forEach((part) => {
    const previous = blocks[blocks.length - 1];
    if (part.type === "tool" && previous?.type === "tools") {
      previous.tools.push(part);
      return;
    }
    if (part.type === "tool") {
      blocks.push({ type: "tools", tools: [part] });
      return;
    }
    blocks.push({ part, type: "narrative" });
  });
  return blocks;
};

const actionGroupTitle = (tools: AssistantToolPart[]): string => {
  const counts = new Map<string, number>();
  tools.forEach((tool) => counts.set(toolAction(tool.name), (counts.get(toolAction(tool.name)) ?? 0) + 1));
  return [...counts.entries()]
    .map(([label, count]) => count > 1 ? t("s_d8a1a5ace4", { p0: label, p1: count }) : label)
    .join("，");
};

const formatDuration = (created: number, completed?: number): string => {
  const elapsed = Math.max(0, (completed ?? Date.now()) - created);
  const seconds = Math.max(1, Math.round(elapsed / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return t("s_1ef1d4c74a", { p0: hours, p1: minutes });
  if (minutes > 0) return t("s_02b5a41527", { p0: minutes, p1: rest });
  return t("s_ad7dee82f4", { p0: rest });
};

/**
 * The subagent session a `task` call created, if it announced one.
 *
 * Read from `state.metadata.sessionId`, verified against a live server: the value matches the id
 * returned by `/session/{parent}/children` exactly, and it is already there while the tool is
 * still running. The `task_id:` line in the output is the documented handle for *resuming* a
 * subagent and only appears once the tool finishes, so it is kept as a fallback rather than the
 * primary source — a running task would otherwise offer no way in.
 */
const childSessionID = (part: AssistantToolPart): string | undefined => {
  if (part.name.toLowerCase() !== "task") return undefined;
  const fromMetadata = part.state.metadata?.sessionId;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;
  const raw = part.state.structured ?? part.state.result ?? part.state.content;
  const text = typeof raw === "string" ? raw : formatToolValue(raw);
  return /(?:^|\n)\s*task_id:\s*(\S+)/.exec(text)?.[1];
};

function ToolEntry({
  onOpenChange,
  onOpenSession,
  open,
  part,
}: {
  onOpenChange?: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
  open?: boolean;
  part: AssistantToolPart;
}) {
  const childID = childSessionID(part);
  const outputValue = part.state.structured ?? part.state.result ?? part.state.content;
  const output = outputValue === undefined || outputValue === null || outputValue === ""
    ? undefined
    : <ToolCallOutput name={part.name} output={outputValue} />;
  const errorText = part.state.status === "error" ? formatToolValue(part.state.error) : "";
  const todos = ["todo", "todowrite"].includes(part.name.toLowerCase()) ? todosFromTool(part) : [];
  return (
    <Tool onOpenChange={onOpenChange} open={open}>
      <ToolHeader
        detail={toolInlineDetail(part.name, part.state.input)}
        state={toolState(part.state.status)}
        title={toolTitle(part.name)}
        toolName={part.name}
        type="dynamic-tool"
      />
      <ToolContent className="ml-5 mt-0.5">
        {todos.length > 0 ? <TodoSnapshot todos={todos} /> : <ToolCallInput input={part.state.input} name={part.name} />}
        <ToolOutput errorText={errorText} output={output} />
        {childID && onOpenSession && (
          <Button
            className="ml-1 h-7 gap-1.5 px-2 text-xs font-normal"
            onClick={() => onOpenSession(childID)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <CornerDownRight className="size-3.5" />
            {t("s_125e64b339")}
          </Button>
        )}
      </ToolContent>
    </Tool>
  );
}

const sameToolPart = (left: AssistantToolPart, right: AssistantToolPart): boolean =>
  left.id === right.id
  && left.name === right.name
  && left.state.status === right.state.status
  && left.state.input === right.state.input
  && left.state.result === right.state.result
  && left.state.content === right.state.content
  && left.state.structured === right.state.structured
  && left.state.error === right.state.error
  && left.time.created === right.time.created
  && left.time.ran === right.time.ran
  && left.time.completed === right.time.completed;

const ToolGroup = memo(function ToolGroup({
  onOpenChange,
  onOpenSession,
  open,
  tools,
}: {
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
  open: boolean;
  tools: AssistantToolPart[];
}) {
  if (tools.length === 1) {
    return <ToolEntry onOpenChange={onOpenChange} onOpenSession={onOpenSession} open={open} part={tools[0]} />;
  }
  const activeTool = [...tools].reverse().find((tool) => tool.state.status === "pending" || tool.state.status === "running");
  const failedCount = tools.filter((tool) => tool.state.status === "error").length;
  const groupState = failedCount > 0 ? "error" : activeTool ? "running" : "completed";
  // Driven by the tools' own state rather than by "is this the last block", which flipped
  // the moment the next reasoning block appeared and made the header flash between
  // "正在…" and the collapsed summary while a tool was still running.
  const title = activeTool ? t("s_18b31b08ed", { p0: toolTitle(activeTool.name) }) : actionGroupTitle(tools);
  // The collapsed header said only 执行失败, which reads as "the group failed" whether one call of
  // twelve failed or all of them did. The count is what tells the user whether to go looking.
  const detail = [
    t("s_242075c58d", { p0: tools.length }),
    failedCount > 0 ? t("s_649dc604d5", { p0: failedCount }) : "",
  ].filter(Boolean).join(" · ");
  return (
    <Tool onOpenChange={onOpenChange} open={open}>
      <ToolHeader
        detail={activeTool ? undefined : detail}
        state={toolState(groupState)}
        title={title}
        toolName="tool-group"
        type="dynamic-tool"
      />
      <ToolContent className="ml-5 mt-0.5 bg-transparent p-0">
        <div className="space-y-0.5">{tools.map((part) => <ToolEntry key={part.id} onOpenSession={onOpenSession} part={part} />)}</div>
      </ToolContent>
    </Tool>
  );
}, (previous, next) =>
  previous.open === next.open
  && previous.tools.length === next.tools.length
  && previous.tools.every((tool, index) => sameToolPart(tool, next.tools[index]))
);

const Narrative = memo(function Narrative({
  isStreaming,
  part,
}: {
  isStreaming: boolean;
  part: NarrativePart;
}) {
  if (part.type === "reasoning") {
    if (!part.text.trim()) return null;
    const reasoningStreaming = isStreaming && part.time?.completed === undefined;
    // Collapsed until the user opens it; `autoClose` would slam it shut mid-read when the
    // next reasoning chunk lands.
    return (
      <Reasoning autoClose={false} defaultOpen={false} isStreaming={reasoningStreaming}>
        <ReasoningTrigger
          getThinkingMessage={(streaming) => streaming ? <Shimmer duration={1}>{t("s_138d5364bb")}</Shimmer> : t("s_edab852efe")}
        />
        <ReasoningContent streaming={reasoningStreaming}>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (!part.text.trim()) return null;
  return <div className="max-w-full py-1 text-sm leading-6"><MarkdownResponse isAnimating={false} mode={isStreaming ? "streaming" : "static"}>{part.text}</MarkdownResponse></div>;
}, (previous, next) =>
  previous.isStreaming === next.isStreaming
  && previous.part.id === next.part.id
  && previous.part.type === next.part.type
  && previous.part.text === next.part.text
  && (previous.part.type !== "reasoning"
    || next.part.type !== "reasoning"
    || previous.part.time?.completed === next.part.time?.completed)
);

function ProcessBlocks({
  blocks,
  isStreaming,
  onOpenSession,
  onToolGroupOpenChange,
  toolGroupOpen,
}: {
  blocks: ProcessBlock[];
  isStreaming: boolean;
  onOpenSession?: (sessionID: string) => void;
  onToolGroupOpenChange: (groupID: string, open: boolean) => void;
  toolGroupOpen: Record<string, boolean>;
}) {
  const lastVisibleBlockIndex = blocks.findLastIndex((block) =>
    block.type === "tools" || Boolean(block.part.text.trim())
  );
  return (
    <div className="space-y-2 pl-0.5">
      {blocks.map((block, index) => {
        const blockIsStreaming = isStreaming && index === lastVisibleBlockIndex;
        if (block.type === "narrative") {
          return (
            <Narrative
              isStreaming={blockIsStreaming}
              key={block.part.id}
              part={block.part}
            />
          );
        }
        const groupID = block.tools[0]?.id ?? `tools-${index}`;
        return (
          <ToolGroup
            key={groupID}
            onOpenChange={(nextOpen) => onToolGroupOpenChange(groupID, nextOpen)}
            onOpenSession={onOpenSession}
            open={toolGroupOpen[groupID] ?? false}
            tools={block.tools}
          />
        );
      })}
    </div>
  );
}

export function AssistantProcess({
  conclusionPartID,
  isStreaming,
  message,
  onOpenSession,
}: {
  onOpenSession?: (sessionID: string) => void;
  conclusionPartID?: string;
  isStreaming: boolean;
  message: AssistantMessage;
}) {
  const parts = useMemo(() => message.content.filter((part) =>
    part.type === "reasoning" || part.type === "tool" || (part.type === "text" && part.id !== conclusionPartID && Boolean(part.text.trim()))
  ) as Array<NarrativePart | AssistantToolPart>, [conclusionPartID, message.content]);
  const blocks = useMemo(() => buildProcessBlocks(parts), [parts]);
  const hasExecution = parts.some((part) => part.type === "tool" || part.type === "reasoning");
  // Collapsed until the user opens it, in both states. Nothing here may auto-toggle `open`:
  // new reasoning or tool parts keep arriving mid-run, and collapsing under the user's cursor
  // because the run advanced is worse than never expanding at all.
  const [open, setOpen] = useState(false);
  const [toolGroupOpen, setToolGroupOpen] = useState<Record<string, boolean>>({});
  const handleToolGroupOpenChange = (groupID: string, nextOpen: boolean): void => {
    setToolGroupOpen((current) => current[groupID] === nextOpen
      ? current
      : { ...current, [groupID]: nextOpen });
  };
  if (!hasExecution || blocks.length === 0) return null;

  const processBlocks = (
    <ProcessBlocks
      blocks={blocks}
      isStreaming={isStreaming}
      onOpenSession={onOpenSession}
      onToolGroupOpenChange={handleToolGroupOpenChange}
      toolGroupOpen={toolGroupOpen}
    />
  );

  // The container is always the same element, even while running. Returning a bare <div> during
  // the run and a collapsible after it unmounted the whole subtree the instant streaming ended,
  // which is the flash between one tool round finishing and the next starting.
  //
  // While running there is no header, so there is no "正在处理" box to open — the content is
  // simply laid out flat. When the turn finishes the header appears and `open` falls back to the
  // user's own state, so the trace folds away behind "已处理 N秒" as an animated collapse of a
  // mounted element instead of a remount.
  return (
    <ChainOfThought onOpenChange={setOpen} open={isStreaming || open}>
      {!isStreaming && (
        <ChainOfThoughtHeader className="inline-flex h-6 w-fit max-w-full items-center gap-1.5 px-0.5 py-0 text-[11px] leading-none">
          <span className="inline-flex h-4 min-w-0 items-center leading-none">
            {t("s_c1ca09f80e", { p0: formatDuration(message.time.created, message.time.completed) })}
          </span>
        </ChainOfThoughtHeader>
      )}
      <ChainOfThoughtContent className="space-y-2 pl-0.5">{processBlocks}</ChainOfThoughtContent>
    </ChainOfThought>
  );
}
