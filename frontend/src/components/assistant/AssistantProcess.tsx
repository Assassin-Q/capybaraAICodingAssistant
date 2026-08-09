import { Check, Circle, LoaderCircle } from "lucide-react";
import { memo, useMemo, useState } from "react";

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
  idea_diagnostics: "读取 IDEA 诊断",
  idea_editor_context: "读取编辑器上下文",
  idea_browser: "控制内置浏览器",
  idea_gradle: "运行 IDEA Gradle",
  idea_maven: "运行 IDEA Maven",
  idea_navigate: "定位代码",
  idea_project_context: "读取项目结构",
  idea_read_run_log: "读取运行日志",
  idea_refresh_project: "刷新 IDEA 项目",
  idea_run_configuration: "运行 IDEA 配置",
  idea_symbol: "查询符号关系",
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
  idea_diagnostics: "检查了 IDEA 诊断",
  idea_editor_context: "读取了编辑器上下文",
  idea_browser: "操作了内置浏览器",
  idea_gradle: "运行了 Gradle 任务",
  idea_maven: "运行了 Maven 任务",
  idea_navigate: "定位了代码",
  idea_project_context: "读取了项目结构",
  idea_read_run_log: "读取了运行日志",
  idea_refresh_project: "刷新了 IDEA 项目",
  idea_run_configuration: "运行了 IDEA 配置",
  idea_symbol: "查询了符号关系",
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
  if (["idea_editor_context", "idea_diagnostics"].includes(lowerName)) {
    return compactValue(input.path) || "当前编辑器";
  }
  if (["idea_navigate", "idea_symbol"].includes(lowerName)) {
    const path = compactValue(input.path) || "当前编辑器";
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
            {`已处理 ${formatDuration(message.time.created, message.time.completed)}`}
          </span>
        </ChainOfThoughtHeader>
      )}
      <ChainOfThoughtContent className="space-y-2 pl-0.5">{processBlocks}</ChainOfThoughtContent>
    </ChainOfThought>
  );
}
