import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Command, FileCode2, Search, Server, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ideaFileSearchApi, type FileSearchHit } from "@/lib/ideaIntegrations";
import type { AgentInfo, CommandInfo, SkillInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface SlashCommandMenuProps {
  agents: AgentInfo[];
  commands: CommandInfo[];
  disabledSkillNames: string[];
  mcpNames: string[];
  /** Attaches a project file as context, mirroring the editor's right-click action. */
  onAttachFile: (path: string) => void;
  /** Attaches a subagent through OpenCode V2's structured prompt.agents field. */
  onAttachAgent: (agentID: string) => void;
  /** Pins an MCP server above the composer; the prompt names it for the model at send time. */
  onAttachMcp: (name: string) => void;
  /** Skills are referenced by name and absolute path, not attached as project files. */
  onAttachSkill: (name: string, location: string) => void;
  /** Runs project initialisation immediately. */
  onInit: () => void;
  /** Selecting a command pins it as a card above the composer instead of typing it in. */
  onSelectCommand: (name: string) => void;
  /** Runs a manual session compaction. */
  onCompact: () => void;
  onInsert: (text: string) => void;
  /**
   * The file-reference term, or undefined when the picker is closed.
   *
   * File search used to be driven by the composer text starting with "/引用文件", which put the
   * command into the message the user was writing and left it to be deleted by hand. The mode is
   * explicit state now, and the term lives in the picker's own box.
   */
  fileSearch?: string;
  onFileSearchChange: (value: string | undefined) => void;
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
/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const gateways = (): Array<{ description: string; kind: EntryKind; label: string; prefix: string }> => [
  { description: t("s_d52e883472"), kind: "skill", label: t("s_57d1b9097c"), prefix: "$" },
  { description: t("s_69bc073da7"), kind: "agent", label: t("s_16bb55f008"), prefix: "@" },
];

/**
 * Opening text for commands whose card alone says nothing about what to act on.
 *
 * A function, not a constant: a module-level t() freezes the string to the load-time locale.
 */
const commandDefaultArgs = (): Record<string, string> => ({
  review: t("command.defaultArgs.review"),
});

const sourceLabel = (kind: EntryKind): string => {
  if (kind === "agent") return t("s_16bb55f008");
  if (kind === "file") return t("s_49deaf7da2");
  if (kind === "mcp") return "MCP";
  if (kind === "skill") return t("s_53da139b6a");
  return t("s_b114b91547");
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
  onAttachAgent,
  onAttachFile,
  onAttachMcp,
  onAttachSkill,
  onCompact,
  onInit,
  onFileSearchChange,
  onInsert,
  onSelectCommand,
  fileSearch,
  query,
  skills,
}: SlashCommandMenuProps) {
  const [dismissedPrefix, setDismissedPrefix] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileHits, setFileHits] = useState<FileSearchHit[]>([]);
  const [fileSearching, setFileSearching] = useState(false);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileMode = fileSearch !== undefined;
  const prefix = fileMode ? "" : query.slice(0, 1);
  const term = fileMode ? fileSearch.trim() : query.slice(1).trim();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        action: onInit,
        description: t("s_8337e72fc3"),
        id: "cmd:init",
        kind: "command",
        label: "/init",
        sourceLabel: sourceLabel("command"),
      });
      values.push({
        action: onCompact,
        description: t("s_83b7a1eb22"),
        id: "cmd:compact",
        kind: "command",
        label: "/compact",
        sourceLabel: sourceLabel("command"),
      });
      values.push({
        action: () => onFileSearchChange(""),
        description: t("s_47cf3e7d9e"),
        id: "cmd:file",
        kind: "file",
        label: t("s_2d730c6b6e"),
        sourceLabel: t("s_5da56aba3c"),
      });
      gateways().forEach((gateway) => values.push({
        description: t("s_12f3b7ca48", { p0: gateway.description, p1: gateway.prefix }),
        id: `gateway:${gateway.prefix}`,
        insert: gateway.prefix,
        kind: gateway.kind,
        label: `${gateway.prefix} ${gateway.label}`,
        sourceLabel: t("s_5da56aba3c"),
      }));
      commands.forEach((command) => {
        if (command.name === "init" || command.name === "compact") return;
        const kind: EntryKind = command.source === "mcp" || command.name.startsWith("mcp")
          ? "mcp"
          : command.source === "skill"
            ? "skill"
            : "command";
        values.push({
          // Pinned as a card rather than typed in: the command name is not part of what the user
          // is writing, and leaving it in the text meant editing around it. Commands that take a
          // subject start the composer off with the common one, so the card is not left sitting
          // above an empty box with nothing to send.
          action: () => {
            onSelectCommand(command.name);
            const preset = commandDefaultArgs()[command.name];
            if (preset) onInsert(preset);
          },
          description: command.description ?? t("s_420903c36c"),
          id: `cmd:${command.name}`,
          kind,
          label: `/${command.name}`,
          sourceLabel: sourceLabel(kind),
        });
      });
    }

    if (prefix === "$") {
      /**
       * Attaches SKILL.md instead of writing `$name`.
       *
       * `$name` was rewritten to `/name` and run as an OpenCode command, which only resolves for
       * skills OpenCode itself had registered — so whether a skill could be used at all depended
       * on its scan rules and on restarting the service. Handing over the file makes the skill's
       * own instructions part of the prompt, and every skill on disk works the same way.
       */
      skills.filter((skill) => !disabled.has(skill.name)).forEach((skill) => values.push({
        action: skill.location ? () => onAttachSkill(skill.name, skill.location) : undefined,
        description: skill.description ?? t("s_c9422bb291"),
        id: `skill:${skill.name}`,
        insert: skill.location ? undefined : `$${skill.name} `,
        kind: "skill",
        label: skill.name,
        sourceLabel: sourceLabel("skill"),
      }));
      // A chip, like skills and subagents: writing `$name` into the text made the server part of
      // the sentence the user was composing, and it had to be edited around.
      mcpNames.forEach((name) => values.push({
        action: () => onAttachMcp(name),
        description: t("s_1846b2af9e", { p0: name }),
        id: `mcp:${name}`,
        kind: "mcp",
        label: name,
        sourceLabel: sourceLabel("mcp"),
      }));
    }

    if (prefix === "@") {
      agents
        .filter((agent) => agent.mode === "subagent" && !agent.hidden && !agent.disabled)
        .forEach((agent) => values.push({
          action: () => onAttachAgent(agent.id),
          description: agent.description ?? t("s_4640b8205d"),
          id: `agent:${agent.id}`,
          kind: "agent",
          label: agent.id,
          sourceLabel: sourceLabel("agent"),
        }));
    }

    if (fileMode) {
      // Already ranked by IDEA, and re-scoring here against the file name would throw away the
      // content matches, whose relevance lives in the body rather than the path.
      return fileHits.map((hit) => ({
        action: () => { onAttachFile(hit.path); onFileSearchChange(undefined); },
        description: hit.line ? t("s_35163dd609", { p0: hit.line, p1: hit.preview ?? "" }) : hit.relativePath,
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
  }, [agents, commands, disabled, fileHits, fileMode, mcpNames, onAttachAgent, onAttachFile, onAttachMcp, onAttachSkill, onCompact, onFileSearchChange, onInit, onInsert, onSelectCommand, prefix, skills, term]);

  const choose = useMemo(() => (entry: CommandEntry) => {
    if (entry.action) {
      // Actions consume the trigger text — leaving "/compact" behind would look like a draft
      // message the user still has to send.
      setDismissedPrefix("");
      onInsert("");
      entry.action();
      return;
    }
    // A gateway rewrites the composer to a bare trigger, which may not be marked dismissed or
    // the menu it exists to open closes at once.
    if (entry.insert && entry.insert.length > 1) {
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

  // Mirrors the render guard below. The listener is registered unconditionally, so while the menu
  // was hidden it still swallowed Enter — picking /init inserted the text and then ate the very
  // keystroke meant to send it, which is why only the send button worked.
  const hidden = !fileMode && Boolean(dismissedPrefix) && query.startsWith(dismissedPrefix);

  useEffect(() => {
    if (fileMode) fileInputRef.current?.focus();
  }, [fileMode]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || hidden || entries.length === 0) return;
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
  }, [activeIndex, choose, entries, hidden, query]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (hidden) return null;
  const emptyLabel = fileMode
    ? (fileSearching ? t("s_346965a7d1") : term ? t("s_a4d86f59a3") : t("s_39ebea348c"))
    : t("s_88aee91c88");
  return (
    <section aria-label={t("s_41ea8bcfbb")} className="absolute bottom-[calc(100%+0.5rem)] left-3 z-30 w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-lg border-0 bg-popover shadow-md ring-1 ring-border/30">
      {fileMode && (
        <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            aria-label={t("s_2d730c6b6e")}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            onChange={(event) => onFileSearchChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onFileSearchChange(undefined); }}
            placeholder={t("s_39ebea348c")}
            ref={fileInputRef}
            value={fileSearch ?? ""}
          />
          <Button aria-label={t("s_c620893e29")} className="size-5 shrink-0" onClick={() => onFileSearchChange(undefined)} size="icon" type="button" variant="ghost">
            <X className="size-3" />
          </Button>
        </div>
      )}
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
