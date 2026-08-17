import { FileSearch, ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { t } from "@/lib/i18n";

interface QuickStartCardsProps {
  /** Runs project initialisation, the one entry that is a command rather than a prompt. */
  onInit: () => void;
  onSend: (text: string) => void;
}

interface QuickStart {
  description: string;
  icon: LucideIcon;
  id: string;
  label: string;
  /** Absent for the entry that runs /init instead of sending a message. */
  prompt?: string;
}

/**
 * A function, not a constant: a module-level t() freezes the string to the load-time locale.
 *
 * Three of these send an ordinary message rather than a slash command, deliberately — a command
 * only works when OpenCode has registered one by that name, and an empty conversation is exactly
 * where a user is least able to tell why nothing happened.
 */
const quickStarts = (): QuickStart[] => [
  {
    description: t("quickStart.explainHint"),
    icon: FileSearch,
    id: "explain",
    label: t("quickStart.explain"),
    prompt: t("quickStart.explainPrompt"),
  },
  {
    description: t("quickStart.reviewHint"),
    icon: ScrollText,
    id: "review",
    label: t("quickStart.review"),
    prompt: t("quickStart.reviewPrompt"),
  },
  {
    description: t("quickStart.bugHint"),
    icon: ShieldAlert,
    id: "bug",
    label: t("quickStart.bug"),
    prompt: t("quickStart.bugPrompt"),
  },
  {
    description: t("quickStart.initHint"),
    icon: Sparkles,
    id: "init",
    label: t("quickStart.init"),
  },
];

/** Openers for a conversation that has nothing in it yet; one click sends the request. */
export function QuickStartCards({ onInit, onSend }: QuickStartCardsProps) {
  return (
    <div className="mt-5 grid w-full max-w-md grid-cols-1 gap-1.5 sm:grid-cols-2">
      {quickStarts().map((item) => {
        const Icon = item.icon;
        return (
          <button
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent/60"
            key={item.id}
            onClick={() => (item.prompt ? onSend(item.prompt) : onInit())}
            type="button"
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">{item.label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
