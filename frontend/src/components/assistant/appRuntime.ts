import type { AgentInfo } from "@/lib/opencode";

export const normalizeEventType = (type?: string): string => type?.replace(/\.\d+$/, "") ?? "";

export const isAssistantStreamEvent = (type: string): boolean =>
  type.startsWith("session.next.") ||
  type.startsWith("session.step.") ||
  type.startsWith("session.text.") ||
  type.startsWith("session.reasoning.") ||
  type.startsWith("session.tool.") ||
  type.startsWith("session.retry.");

export const isStreamEvent = (type: string): boolean =>
  type === "message.updated" ||
  type === "message.part.updated" ||
  type === "message.part.delta" ||
  type === "message.part.removed" ||
  isAssistantStreamEvent(type);

export const isFinishedEvent = (type: string): boolean =>
  type === "session.idle" ||
  type === "session.error" ||
  type === "session.execution.succeeded" ||
  type === "session.execution.failed" ||
  type === "session.execution.interrupted";

export const localSlashCommands = new Set(["init", "mcp"]);

export const mentionedSubagents = (text: string, availableAgents: AgentInfo[]): string[] => {
  const tokens = new Set(
    text.match(/(^|\s)@[\p{L}\p{N}_-]+/gu)?.map((match) => match.trim().slice(1)) ?? []
  );
  return availableAgents
    .filter((agent) => agent.mode === "subagent" && !agent.hidden && !agent.disabled && tokens.has(agent.id))
    .map((agent) => agent.id);
};
