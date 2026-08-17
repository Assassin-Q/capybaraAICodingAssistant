import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { createAgentContext, createMcpContext } from "@/components/assistant/promptPayload";
import type { ContextChip } from "@/components/assistant/shared";

/**
 * The three things the composer pins as chips rather than typing into the message.
 *
 * All of them depend on `setContexts`, which is rebuilt whenever the active tab changes because
 * each tab keeps its own composer draft. Leaving it out of the dependencies froze these handlers
 * on whichever tab was active when the panel first rendered, and the chip was then written into a
 * draft nobody was looking at — which is why selecting a skill or a subagent appeared to do
 * nothing at all.
 */
export function useComposerAttachments(setContexts: Dispatch<SetStateAction<ContextChip[]>>) {
  const attachSkillContext = useCallback((name: string, location: string) => {
    setContexts((current) => {
      if (current.some((context) => context.kind === "skill" && context.fileName === name)) return current;
      return [...current, {
        action: "add_to_chat" as const,
        addedAt: Date.now(),
        content: location,
        fileName: name,
        id: `skill:${name}`,
        kind: "skill" as const,
        timestamp: Date.now(),
      }];
    });
  }, [setContexts]);

  const attachMcpContext = useCallback((name: string) => {
    setContexts((current) => current.some((context) => context.kind === "mcp" && context.fileName === name)
      ? current
      : [...current, createMcpContext(name)]);
  }, [setContexts]);

  const attachAgentContext = useCallback((agentID: string) => {
    setContexts((current) => current.some((context) => context.kind === "agent" && context.fileName === agentID)
      ? current
      : [...current, createAgentContext(agentID)]);
  }, [setContexts]);

  return { attachAgentContext, attachMcpContext, attachSkillContext };
}
