import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Command, Search, Server, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentInfo, CommandInfo, SkillInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface SlashCommandMenuProps {
  agents: AgentInfo[];
  commands: CommandInfo[];
  disabledSkillNames: string[];
  mcpNames: string[];
  onInsert: (text: string) => void;
  query: string;
  skills: SkillInfo[];
}

type EntryKind = "agent" | "command" | "mcp" | "skill";

interface CommandEntry {
  description: string;
  insert: string;
  kind: EntryKind;
  name: string;
  sourceLabel: string;
}

const builtinDescriptions: Record<string, string> = {
  init: "初始化项目并生成 AGENTS.md",
};

const sourceLabel = (kind: EntryKind): string => {
  if (kind === "agent") return "子智能体";
  if (kind === "mcp") return "MCP";
  if (kind === "skill") return "技能";
  return "内置";
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
  if (kind === "mcp") return Server;
  if (kind === "skill") return Sparkles;
  return Command;
};

export function SlashCommandMenu({
  agents,
  commands,
  disabledSkillNames,
  mcpNames,
  onInsert,
  query,
  skills,
}: SlashCommandMenuProps) {
  const [dismissedPrefix, setDismissedPrefix] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const prefix = query.slice(0, 1);
  const term = query.slice(1).trim();
  const disabled = useMemo(() => new Set(disabledSkillNames), [disabledSkillNames]);

  const entries = useMemo(() => {
    const values: CommandEntry[] = [];
    if (prefix === "/") {
      values.push({
        description: builtinDescriptions.init,
        insert: "/init ",
        kind: "command",
        name: "init",
        sourceLabel: sourceLabel("command"),
      });
      commands.forEach((command) => {
        const kind: EntryKind = command.source === "mcp" || command.name.startsWith("mcp")
          ? "mcp"
          : command.source === "skill"
            ? "skill"
            : "command";
        if (kind === "command" && command.name !== "init") return;
        values.push({
          description: command.description ?? "OpenCode 命令",
          insert: `/${command.name} `,
          kind,
          name: command.name,
          sourceLabel: sourceLabel(kind),
        });
      });
      mcpNames.forEach((name) => values.push({
        description: `优先使用 ${name} 提供的 MCP 工具`,
        insert: `/mcp ${name} `,
        kind: "mcp",
        name: `mcp ${name}`,
        sourceLabel: sourceLabel("mcp"),
      }));
    }
    if (prefix === "$" || prefix === "/") {
      skills.filter((skill) => !disabled.has(skill.name)).forEach((skill) => {
        values.push({
          description: skill.description ?? "工作区技能",
          insert: `$${skill.name} `,
          kind: "skill",
          name: skill.name,
          sourceLabel: sourceLabel("skill"),
        });
      });
    }
    if (prefix === "@" || prefix === "/") {
      agents.filter((agent) => agent.mode === "subagent" && !agent.hidden && !agent.disabled).forEach((agent) => {
        values.push({
          description: agent.description ?? "OpenCode 子智能体",
          insert: `@${agent.id} `,
          kind: "agent",
          name: agent.id,
          sourceLabel: sourceLabel("agent"),
        });
      });
    }
    return values
      .map((entry, index) => ({ entry, index, score: fuzzyScore(`${entry.name} ${entry.description}`, term) }))
      .filter((item): item is { entry: CommandEntry; index: number; score: number } => item.score !== undefined)
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map((item) => item.entry)
      .filter((entry, index, all) => all.findIndex((item) => item.insert === entry.insert) === index);
  }, [agents, commands, disabled, mcpNames, prefix, skills, term]);

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
        const entry = entries[activeIndex] ?? entries[0];
        setDismissedPrefix(entry.insert.trim());
        onInsert(entry.insert);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDismissedPrefix(query);
      }
    };
    // Capture before PromptInput handles Enter so keyboard selection works in
    // JCEF as well as a normal browser.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, entries, onInsert, query]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (dismissedPrefix && query.startsWith(dismissedPrefix)) return null;
  return (
    <section aria-label="命令、技能与子智能体" className="absolute bottom-[calc(100%+0.5rem)] left-3 z-30 w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-lg border-0 bg-popover shadow-md ring-1 ring-border/30">
      <div className="max-h-72 overflow-y-auto p-1.5">
        {entries.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><Search className="size-3.5" />没有匹配项</div>
        ) : entries.map((entry, index) => {
          const Icon = entryIcon(entry.kind);
          const active = index === activeIndex;
          return (
            <Button
              aria-selected={active}
              className={cn("h-auto w-full justify-start gap-2 rounded-md border-0 px-2 py-2 text-left font-normal shadow-none", active && "bg-accent text-accent-foreground")}
              key={entry.insert}
              onClick={() => {
                setDismissedPrefix(entry.insert.trim());
                onInsert(entry.insert);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              ref={(element) => { itemRefs.current[index] = element; }}
              role="option"
              type="button"
              variant="ghost"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{entry.insert.trim()}</span>
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
