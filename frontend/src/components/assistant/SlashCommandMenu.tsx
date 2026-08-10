import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Command, FileCode2, Search, Server, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ideaFileSearchApi, type FileSearchHit } from "@/lib/ideaIntegrations";
import type { AgentInfo, CommandInfo, SkillInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface SlashCommandMenuProps {
  agents: AgentInfo[];
  commands: CommandInfo[];
  disabledSkillNames: string[];
  mcpNames: string[];
  /** Attaches a project file as context, mirroring the editor's right-click action. */
  onAttachFile: (path: string) => void;
  /** Runs a manual session compaction. */
  onCompact: () => void;
  onInsert: (text: string) => void;
  query: string;
  skills: SkillInfo[];
}

type EntryKind = "agent" | "command" | "file" | "mcp" | "skill";

interface CommandEntry {
  description: string;
  id: string;
  kind: EntryKind;
  /** Shown as the entry title. */
  label: string;
  sourceLabel: string;
  /** Text written into the composer. Entries with an `action` leave this out. */
  insert?: string;
  /** Runs instead of inserting — for commands that act rather than compose. */
  action?: () => void;
}

/**
 * Trigger characters, all reachable from `/` so nothing is hidden behind knowing the syntax.
 *
 * Picking one of these from the `/` list just rewrites the composer to that character, which is
 * what makes the two-step flow fall out for free: the second menu is the same component reacting
 * to the new prefix, rather than a separate mode this one has to track.
 */
const GATEWAYS: Array<{ description: string; kind: EntryKind; label: string; prefix: string }> = [
  { description: "调用工作区技能或 MCP 服务", kind: "skill", label: "技能与 MCP", prefix: "$" },
  { description: "交给某个子智能体处理", kind: "agent", label: "子智能体", prefix: "@" },
];

/**
 * Files are reached through this command rather than a trigger character of their own.
 *
 * Keeping the query in the composer text is what makes the second step work without a mode flag:
 * everything after the command is the search term, so the same text-driven path drives both menus.
 */
const FILE_COMMAND = "/引用文件 ";

const sourceLabel = (kind: EntryKind): string => {
  if (kind === "agent") return "子智能体";
  if (kind === "file") return "文件";
  if (kind === "mcp") return "MCP";
  if (kind === "skill") return "技能";
  return "命令";
};

const fuzzyScore = (value: string, term: string): number | undefined => {
  if (!term) return 0;
  const normalized = value.toLocaleLowerCase();
  const query = term.toLocaleLowerCase();
  if (normalized.startsWith(query)) return 0;
  const wordStart = normalized.indexOf(` ${query}`);
  if (wordStart >= 0) return 10 + wordStart;
  let cursor = 0;
  let gaps = 0;
  for (const character of query) {
    const index = normalized.indexOf(character, cursor);
    if (index < 0) return undefined;
    gaps += index - cursor;
    cursor = index + 1;
  }
  return 100 + gaps;
};

const entryIcon = (kind: EntryKind) => {
  if (kind === "agent") return Bot;
  if (kind === "file") return FileCode2;
  if (kind === "mcp") return Server;
  if (kind === "skill") return Sparkles;
  return Command;
};

export function SlashCommandMenu({
  agents,
  commands,
  disabledSkillNames,
  mcpNames,
  onAttachFile,
  onCompact,
  onInsert,
  query,
  skills,
}: SlashCommandMenuProps) {
  const [dismissedPrefix, setDismissedPrefix] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileHits, setFileHits] = useState<FileSearchHit[]>([]);
  const [fileSearching, setFileSearching] = useState(false);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileMode = query.startsWith(FILE_COMMAND);
  const prefix = fileMode ? "" : query.slice(0, 1);
  const term = fileMode ? query.slice(FILE_COMMAND.length).trim() : query.slice(1).trim();
  const disabled = useMemo(() => new Set(disabledSkillNames), [disabledSkillNames]);

  /**
   * File lookup runs against IDEA rather than in the browser, so it sees the same project model
   * Ctrl+N does. Names are tried first and content only as a fallback: a content scan walks file
   * bodies and is far more expensive, so it should not run while the name index already answers.
   */
  useEffect(() => {
    if (!fileMode || !term) {
      setFileHits([]);
      setFileSearching(false);
      return;
    }
    let cancelled = false;
    setFileSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const byName = await ideaFileSearchApi.search(term, "name", 20);
          if (cancelled) return;
          if (byName.hits?.length) {
            setFileHits(byName.hits);
            return;
          }
          const byContent = await ideaFileSearchApi.search(term, "content", 20);
          if (!cancelled) setFileHits(byContent.hits ?? []);
        } catch {
          if (!cancelled) setFileHits([]);
        } finally {
          if (!cancelled) setFileSearching(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileMode, term]);

  const entries = useMemo(() => {
    const values: CommandEntry[] = [];

    if (prefix === "/") {
      values.push({
        description: "初始化项目并生成 AGENTS.md",
        id: "cmd:init",
        insert: "/init ",
        kind: "command",
        label: "/init",
        sourceLabel: sourceLabel("command"),
      });
      values.push({
        action: onCompact,
        description: "立即压缩当前会话，把已有对话浓缩成摘要以释放上下文",
        id: "cmd:compact",
        kind: "command",
        label: "/compact",
        sourceLabel: sourceLabel("command"),
      });
      values.push({
        description: "按文件名或内容检索项目文件，选中后作为上下文附加",
        id: "cmd:file",
        insert: FILE_COMMAND,
        kind: "file",
        label: "/引用文件",
        sourceLabel: "选择器",
      });
      GATEWAYS.forEach((gateway) => values.push({
        description: `${gateway.description}（按 ${gateway.prefix} 也可直接打开）`,
        id: `gateway:${gateway.prefix}`,
        insert: gateway.prefix,
        kind: gateway.kind,
        label: `${gateway.prefix} ${gateway.label}`,
        sourceLabel: "选择器",
      }));
      commands.forEach((command) => {
        if (command.name === "init" || command.name === "compact") return;
        const kind: EntryKind = command.source === "mcp" || command.name.startsWith("mcp")
          ? "mcp"
          : command.source === "skill"
            ? "skill"
            : "command";
        values.push({
          description: command.description ?? "OpenCode 命令",
          id: `cmd:${command.name}`,
          insert: `/${command.name} `,
          kind,
          label: `/${command.name}`,
          sourceLabel: sourceLabel(kind),
        });
      });
    }

    if (prefix === "$") {
      skills.filter((skill) => !disabled.has(skill.name)).forEach((skill) => values.push({
        description: skill.description ?? "工作区技能",
        id: `skill:${skill.name}`,
        insert: `$${skill.name} `,
        kind: "skill",
        label: skill.name,
        sourceLabel: sourceLabel("skill"),
      }));
      mcpNames.forEach((name) => values.push({
        description: `优先使用 ${name} 提供的 MCP 工具`,
        id: `mcp:${name}`,
        insert: `$${name} `,
        kind: "mcp",
        label: name,
        sourceLabel: sourceLabel("mcp"),
      }));
    }

    if (prefix === "@") {
      agents
        .filter((agent) => agent.mode === "subagent" && !agent.hidden && !agent.disabled)
        .forEach((agent) => values.push({
          description: agent.description ?? "OpenCode 子智能体",
          id: `agent:${agent.id}`,
          insert: `@${agent.id} `,
          kind: "agent",
          label: agent.id,
          sourceLabel: sourceLabel("agent"),
        }));
    }

    if (fileMode) {
      // Already ranked by IDEA, and re-scoring here against the file name would throw away the
      // content matches, whose relevance lives in the body rather than the path.
      return fileHits.map((hit) => ({
        action: () => onAttachFile(hit.path),
        description: hit.line ? `第 ${hit.line} 行：${hit.preview ?? ""}` : hit.relativePath,
        id: `file:${hit.path}`,
        kind: "file" as const,
        label: hit.name,
        sourceLabel: sourceLabel("file"),
      }));
    }

    return values
      .map((entry, index) => ({ entry, index, score: fuzzyScore(`${entry.label} ${entry.description}`, term) }))
      .filter((item): item is { entry: CommandEntry; index: number; score: number } => item.score !== undefined)
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map((item) => item.entry)
      .filter((entry, index, all) => all.findIndex((item) => item.id === entry.id) === index);
  }, [agents, commands, disabled, fileHits, fileMode, mcpNames, onAttachFile, onCompact, prefix, skills, term]);

  const choose = useMemo(() => (entry: CommandEntry) => {
    if (entry.action) {
      // Actions consume the trigger text — leaving "/compact" behind would look like a draft
      // message the user still has to send.
      setDismissedPrefix("");
      onInsert("");
      entry.action();
      return;
    }
    // A gateway rewrites the composer to a bare trigger, and the file command hands over to the
    // file picker — neither may be marked dismissed or the menu they exist to open closes at once.
    if (entry.insert && entry.insert.length > 1 && entry.insert !== FILE_COMMAND) {
      setDismissedPrefix(entry.insert.trim());
    }
    onInsert(entry.insert ?? "");
  }, [onInsert]);

  useEffect(() => {
    if (dismissedPrefix && !query.startsWith(dismissedPrefix)) setDismissedPrefix("");
  }, [dismissedPrefix, query]);

  useEffect(() => {
    setActiveIndex(0);
    itemRefs.current = [];
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || entries.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % entries.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + entries.length) % entries.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(entries[activeIndex] ?? entries[0]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDismissedPrefix(query);
      }
    };
    // Capture before PromptInput handles Enter so keyboard selection works in
    // JCEF as well as a normal browser.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, choose, entries, query]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (dismissedPrefix && query.startsWith(dismissedPrefix)) return null;
  const emptyLabel = fileMode
    ? (fileSearching ? "正在检索..." : term ? "没有匹配的文件" : "输入文件名或内容关键字")
    : "没有匹配项";
  return (
    <section aria-label="命令、技能、子智能体与文件" className="absolute bottom-[calc(100%+0.5rem)] left-3 z-30 w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-lg border-0 bg-popover shadow-md ring-1 ring-border/30">
      <div className="max-h-72 overflow-y-auto p-1.5">
        {entries.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><Search className="size-3.5" />{emptyLabel}</div>
        ) : entries.map((entry, index) => {
          const Icon = entryIcon(entry.kind);
          const active = index === activeIndex;
          return (
            <Button
              aria-selected={active}
              className={cn("h-auto w-full justify-start gap-2 rounded-md border-0 px-2 py-2 text-left font-normal shadow-none", active && "bg-accent text-accent-foreground")}
              key={entry.id}
              onClick={() => choose(entry)}
              onMouseEnter={() => setActiveIndex(index)}
              ref={(element) => { itemRefs.current[index] = element; }}
              role="option"
              type="button"
              variant="ghost"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{entry.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{entry.description}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{entry.sourceLabel}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
