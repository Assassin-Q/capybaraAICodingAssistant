import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionTab } from "@/hooks/useSessionTabs";
import { sessionName } from "@/components/assistant/shared";
import type { SessionInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface SessionTabsProps {
  activeTabID: string;
  onClose: (tabID: string) => void;
  onRename: (tab: SessionTab, title: string) => Promise<void>;
  onSelect: (tabID: string) => void;
  sessions: SessionInfo[];
  tabs: SessionTab[];
}

export const sessionTabTitle = (tab: SessionTab, sessions: Map<string, SessionInfo>): string => {
  if (tab.kind === "draft") return tab.title?.trim() || t("tabs.newConversation");
  const session = tab.sessionID ? sessions.get(tab.sessionID) : undefined;
  return session ? sessionName(session) : tab.title?.trim() || t("tabs.unknownConversation");
};

export function SessionTabs({ activeTabID, onClose, onRename, onSelect, sessions, tabs }: SessionTabsProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [editingTabID, setEditingTabID] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const renameCancelled = useRef(false);
  const sessionMap = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);

  const updateOverflow = () => {
    const node = viewport.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 2);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
  };

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    updateOverflow();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateOverflow);
    observer?.observe(node);
    const content = node.firstElementChild;
    if (content) observer?.observe(content);
    node.addEventListener("scroll", updateOverflow, { passive: true });
    return () => {
      observer?.disconnect();
      node.removeEventListener("scroll", updateOverflow);
    };
  }, [tabs]);

  useEffect(() => {
    const active = [...(viewport.current?.querySelectorAll<HTMLElement>("[data-session-tab-id]") ?? [])]
      .find((node) => node.dataset.sessionTabId === activeTabID);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabID]);

  const beginRename = (tab: SessionTab) => {
    setEditingTabID(tab.id);
    renameCancelled.current = false;
    setTitleDraft(sessionTabTitle(tab, sessionMap));
  };

  const finishRename = async (tab: SessionTab) => {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      return;
    }
    const title = titleDraft.trim();
    if (!title || saving) {
      setEditingTabID("");
      return;
    }
    setSaving(true);
    try {
      await onRename(tab, title);
      setEditingTabID("");
    } catch {
      // The owning view surfaces the API error. Keep the editor open so the title is not lost.
    } finally {
      setSaving(false);
    }
  };

  const scroll = (direction: -1 | 1) => {
    viewport.current?.scrollBy({ behavior: "smooth", left: direction * Math.max(160, viewport.current.clientWidth * 0.65) });
  };

  return (
    <div className="flex h-9 min-w-0 shrink-0 items-stretch border-b border-border/60 bg-background px-1">
      <Button
        aria-label={t("tabs.scrollLeft")}
        className={cn("my-1 size-7 shrink-0", !canScrollLeft && "invisible")}
        disabled={!canScrollLeft}
        onClick={() => scroll(-1)}
        size="icon"
        title={t("tabs.scrollLeft")}
        type="button"
        variant="ghost"
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={viewport}>
        <div className="flex h-full min-w-max items-stretch gap-0.5">
          {tabs.map((tab) => {
            const active = tab.id === activeTabID;
            const title = sessionTabTitle(tab, sessionMap);
            const editing = editingTabID === tab.id;
            return (
              <div
                className={cn(
                  "group relative my-0.5 flex min-w-[9rem] max-w-[15rem] items-center rounded-t-md px-1 text-xs transition-colors",
                  active ? "bg-muted/75 text-foreground" : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                )}
                data-session-tab-id={tab.id}
                key={tab.id}
                title={title}
              >
                {editing ? (
                  <input
                    aria-label={t("tabs.rename")}
                    autoFocus
                    className="h-6 min-w-0 flex-1 rounded bg-background px-1.5 text-xs text-foreground outline-none ring-1 ring-ring/50"
                    disabled={saving}
                    onBlur={() => void finishRename(tab)}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        renameCancelled.current = true;
                        setEditingTabID("");
                      }
                    }}
                    value={titleDraft}
                  />
                ) : (
                  <button
                    aria-current={active ? "page" : undefined}
                    className="min-w-0 flex-1 truncate px-1.5 text-left leading-7"
                    onClick={() => onSelect(tab.id)}
                    type="button"
                  >
                    {title}
                  </button>
                )}
                {!editing && (
                  <div className="flex w-11 shrink-0 items-center justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                      aria-label={t("tabs.renameNamed", { title })}
                      className="size-5"
                      onClick={() => beginRename(tab)}
                      size="icon"
                      title={t("tabs.rename")}
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      aria-label={t("tabs.closeNamed", { title })}
                      className="size-5"
                      onClick={() => onClose(tab.id)}
                      size="icon"
                      title={t("tabs.closeHint")}
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                )}
                {active && <span className="absolute inset-x-1 bottom-[-2px] h-0.5 rounded-full bg-primary" />}
              </div>
            );
          })}
        </div>
      </div>
      <Button
        aria-label={t("tabs.scrollRight")}
        className={cn("my-1 size-7 shrink-0", !canScrollRight && "invisible")}
        disabled={!canScrollRight}
        onClick={() => scroll(1)}
        size="icon"
        title={t("tabs.scrollRight")}
        type="button"
        variant="ghost"
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
