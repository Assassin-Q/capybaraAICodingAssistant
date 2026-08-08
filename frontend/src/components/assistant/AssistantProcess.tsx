import { Check, Circle, LoaderCircle } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolOutput } from "@/components/ai-elements/tool";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { formatToolValue, toolState } from "@/components/assistant/shared";
import { ToolCallInput, ToolCallOutput } from "@/components/assistant/ToolCallDetails";
import type {
  AssistantMessage,
  AssistantReasoningPart,
  AssistantTextPart,
  AssistantToolPart,
  TodoInfo,
} from "@/lib/opencode";

const toolLabels: Record<string, string> = {
  apply_patch: "应用补丁",
  bash: "执行命令",
  edit: "编辑文件",
  glob: "查找文件",
  grep: "搜索内容",
  list: "列出文件",
  question: "等待回答",
  read: "读取文件",
  task: "执行任务",
  todo: "更新任务清单",
  todowrite: "更新任务清单",
  write: "写入文件",
};

const toolActions: Record<string, string> = {
  apply_patch: "编辑了文件",
  bash: "运行了命令",
  edit: "编辑了文件",
  glob: "搜索了文件",
  grep: "搜索了内容",
  list: "浏览了文件",
  question: "等待了回答",
  read: "读取了文件",
  task: "调用了子智能体",
  todo: "更新了任务清单",
  todowrite: "更新了任务清单",
  write: "编辑了文件",
};

const toolTitle = (name: string): string => toolLabels[name.toLowerCase()] ?? name;

const toolAction = (name: string): string => toolActions[name.toLowerCase()] ?? `调用了 ${name}`;

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
    .map(([label, count]) => count > 1 ? `${label} ${count} 次` : label)
    .join("，");
};

const formatDuration = (created: number, completed?: number): string => {
  const elapsed = Math.max(0, (completed ?? Date.now()) - created);
  const seconds = Math.max(1, Math.round(elapsed / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${rest}秒`;
  return `${rest}秒`;
};

function ToolEntry({
  onOpenChange,
  open,
  part,
}: {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  part: AssistantToolPart;
}) {
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
  open,
  tools,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tools: AssistantToolPart[];
}) {
  if (tools.length === 1) {
    return <ToolEntry onOpenChange={onOpenChange} open={open} part={tools[0]} />;
  }
  const activeTool = [...tools].reverse().find((tool) => tool.state.status === "pending" || tool.state.status === "running");
  const failed = tools.some((tool) => tool.state.status === "error");
  const groupState = failed ? "error" : activeTool ? "running" : "completed";
  // Driven by the tools' own state rather than by "is this the last block", which flipped
  // the moment the next reasoning block appeared and made the header flash between
  // "正在…" and the collapsed summary while a tool was still running.
  const title = activeTool ? `正在${toolTitle(activeTool.name)}` : actionGroupTitle(tools);
  return (
    <Tool onOpenChange={onOpenChange} open={open}>
      <ToolHeader
        detail={activeTool ? undefined : `${tools.length} 个操作`}
        state={toolState(groupState)}
        title={title}
        toolName="tool-group"
        type="dynamic-tool"
      />
      <ToolContent className="ml-5 mt-0.5 bg-transparent p-0">
        <div className="space-y-0.5">{tools.map((part) => <ToolEntry key={part.id} part={part} />)}</div>
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
  runIsStreaming,
}: {
  isStreaming: boolean;
  part: NarrativePart;
  runIsStreaming: boolean;
}) {
  if (part.type === "reasoning") {
    if (!part.text.trim()) return null;
    const reasoningStreaming = isStreaming && part.time?.completed === undefined;
    return (
      <Reasoning autoClose={!runIsStreaming} defaultOpen={reasoningStreaming} isStreaming={reasoningStreaming}>
        <ReasoningTrigger
          getThinkingMessage={(streaming) => streaming ? <Shimmer duration={1}>思考中</Shimmer> : "思考完成"}
        />
        <ReasoningContent streaming={reasoningStreaming}>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (!part.text.trim()) return null;
  return <div className="max-w-full py-1 text-sm leading-6"><MarkdownResponse isAnimating={false} mode={isStreaming ? "streaming" : "static"}>{part.text}</MarkdownResponse></div>;
}, (previous, next) =>
  previous.isStreaming === next.isStreaming
  && previous.runIsStreaming === next.runIsStreaming
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
  onToolGroupOpenChange,
  toolGroupOpen,
}: {
  blocks: ProcessBlock[];
  isStreaming: boolean;
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
              runIsStreaming={isStreaming}
            />
          );
        }
        const groupID = block.tools[0]?.id ?? `tools-${index}`;
        return (
          <ToolGroup
            key={groupID}
            onOpenChange={(nextOpen) => onToolGroupOpenChange(groupID, nextOpen)}
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
}: {
  conclusionPartID?: string;
  isStreaming: boolean;
  message: AssistantMessage;
}) {
  const parts = useMemo(() => message.content.filter((part) =>
    part.type === "reasoning" || part.type === "tool" || (part.type === "text" && part.id !== conclusionPartID && Boolean(part.text.trim()))
  ) as Array<NarrativePart | AssistantToolPart>, [conclusionPartID, message.content]);
  const blocks = useMemo(() => buildProcessBlocks(parts), [parts]);
  const hasExecution = parts.some((part) => part.type === "tool" || part.type === "reasoning");
  const [open, setOpen] = useState(false);
  const [toolGroupOpen, setToolGroupOpen] = useState<Record<string, boolean>>({});
  // Expand while the run is live, collapse once it settles — without remounting, so the
  // user can still toggle it manually mid-run.
  const wasStreaming = useRef(isStreaming);
  useEffect(() => {
    if (isStreaming !== wasStreaming.current) {
      setOpen(isStreaming);
      wasStreaming.current = isStreaming;
    }
  }, [isStreaming]);
  const handleToolGroupOpenChange = (groupID: string, nextOpen: boolean): void => {
    setToolGroupOpen((current) => current[groupID] === nextOpen
      ? current
      : { ...current, [groupID]: nextOpen });
  };
  if (!hasExecution || blocks.length === 0) return null;
  const activeTool = [...parts].reverse().find((part): part is AssistantToolPart =>
    part.type === "tool" && (part.state.status === "pending" || part.state.status === "running")
  );
  const streamingLabel = activeTool ? `正在${toolTitle(activeTool.name)}` : "正在处理";
  const completedLabel = `已处理 ${formatDuration(message.time.created, message.time.completed)}`;

  // One tree for both states. Swapping between a plain div and ChainOfThought remounted the
  // whole panel every time `isStreaming` flipped — which happens mid-run whenever OpenCode
  // starts the next assistant message — and that read as a collapse/flash.
  return (
    <ChainOfThought isStreaming={isStreaming} onOpenChange={setOpen} open={open}>
      <ChainOfThoughtHeader className="inline-flex h-6 w-fit max-w-full items-center gap-1.5 px-0.5 py-0 text-[11px] leading-none">
        {isStreaming ? (
          <span className="inline-flex h-4 min-w-0 items-center gap-1.5 leading-none">
            <LoaderCircle className="size-3 shrink-0 animate-spin" />
            <Shimmer duration={1.2}>{streamingLabel}</Shimmer>
          </span>
        ) : (
          <span className="inline-flex h-4 min-w-0 items-center leading-none">{completedLabel}</span>
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="space-y-2 pl-0.5">
        <ProcessBlocks
          blocks={blocks}
          isStreaming={isStreaming}
          onToolGroupOpenChange={handleToolGroupOpenChange}
          toolGroupOpen={toolGroupOpen}
        />
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
