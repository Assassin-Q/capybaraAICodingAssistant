import { useCallback, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { localSlashCommands, mentionedSubagents } from "@/components/assistant/appRuntime";
import {
  fileToEmbeddedTextAttachment,
  fileToPromptAttachment,
  isTextFile,
  type PromptRequest,
} from "@/components/assistant/promptPayload";
import { errorMessage, type RunStatus } from "@/components/assistant/shared";
import { modelRefWithAvailableVariant } from "@/components/assistant/modelVariants";
import type { SessionRuntimeController } from "@/hooks/useSessionRuntime";
import {
  createMessageID,
  createOptimisticUserMessage,
  openCodeApi,
  type AgentInfo,
  type CommandInfo,
  type ModelInfo,
  type ModelRef,
  type PromptAttachment,
  type SessionMessage,
  type SkillInfo,
} from "@/lib/opencode";
import type { WorkspacePreferences } from "@/lib/preferences";
import { buildProfessionalRoleInstructions } from "@/lib/professionalRoles";
import { appendTextAttachments } from "@/lib/textAttachments";
import {
  describeImagesForTextModel,
  modelAcceptsImages,
  partitionByModality,
} from "@/lib/visionFallback";
import { wrapPromptAugmentation } from "@/lib/promptAugmentation";
import { t } from "@/lib/i18n";
import { useAutoRetry } from "@/hooks/useAutoRetry";

interface PromptSubmissionRefs {
  cancelledPromptIDs: MutableRefObject<Set<string>>;
  suppressedStreamingSessionIDs: MutableRefObject<Set<string>>;
}

interface PromptSubmissionOptions {
  agents: AgentInfo[];
  commands: CommandInfo[];
  ensureSelectedModelVariant: () => Promise<ModelRef | undefined>;
  mcpNames: string[];
  messages: SessionMessage[];
  pollSessionStatus: (sessionID: string, generation: number) => void;
  preferences: WorkspacePreferences;
  projectPath?: string;
  refs: PromptSubmissionRefs;
  runtime: SessionRuntimeController;
  runStatus: RunStatus;
  selectedAgentID: string;
  selectedModel?: ModelInfo;
  selectedSessionID: string;
  setError: Dispatch<SetStateAction<string>>;
  skills: SkillInfo[];
}

/** Owns the complete prompt transaction, including retries and attachment modality fallback. */
export function usePromptSubmission({
  agents,
  commands,
  ensureSelectedModelVariant,
  mcpNames,
  messages,
  pollSessionStatus,
  preferences,
  projectPath,
  refs,
  runtime,
  runStatus,
  selectedAgentID,
  selectedModel,
  selectedSessionID,
  setError,
  skills,
}: PromptSubmissionOptions) {
  const [droppedAttachments, setDroppedAttachments] = useState<Record<string, PromptAttachment[]>>({});
  const [visionBusy, setVisionBusy] = useState(false);
  const submittingSessions = useRef(new Set<string>());
  const lastSubmittedPrompts = useRef(new Map<string, { fingerprint: string; sentAt: number }>());
  const replayablePrompts = useRef(new Map<string, {
    payload: Parameters<typeof openCodeApi.sendPrompt>[1];
    sessionID: string;
  }>());

  const sendPromptNow = useCallback(async (
    { execution, text, files, mcpNames: requestedMcpNames = [], subagentIDs = [] }: PromptRequest,
    sessionIDOverride?: string,
  ): Promise<boolean> => {
    const targetSessionID = sessionIDOverride ?? selectedSessionID;
    if (!targetSessionID || !projectPath) return false;
    const state = runtime.get(targetSessionID);
    if (submittingSessions.current.has(targetSessionID) || state.activePrompt) return false;
    const typedText = text.trim();
    if (!typedText && files.length === 0) return false;

    // The pinned MCP servers are part of what makes a request distinct: the same sentence sent
    // against a different server is a different request, not a double submit.
    const fingerprint = `${targetSessionID}\n${typedText}\n${[...subagentIDs].sort().join(",")}\n${[...requestedMcpNames].sort().join(",")}\n${files
      .map((file) => `${file.filename ?? file.file.name}:${file.mediaType ?? file.file.type}:${file.url ?? ""}`)
      .join("\n")}`;
    const last = lastSubmittedPrompts.current.get(targetSessionID);
    if (last?.fingerprint === fingerprint && Date.now() - last.sentAt < 1200) return false;

    submittingSessions.current.add(targetSessionID);
    refs.suppressedStreamingSessionIDs.current.delete(targetSessionID);
    const generation = ++state.generation;
    state.assistantMessageIDs.clear();
    state.hasActivity = false;
    runtime.setStreamingAssistantID(targetSessionID, undefined);
    try {
      if (runtime.refs.selectedSessionID.current === targetSessionID) setError("");
      runtime.setRunStatus(targetSessionID, "submitted");
      const preparedFiles = await Promise.all(files.map(async (file) => {
        const name = file.filename ?? file.file.name;
        const textFile = isTextFile(file.file);
        return {
          attachment: await fileToPromptAttachment(file.file, name),
          textAttachment: textFile ? await fileToEmbeddedTextAttachment(file.file, name) : undefined,
        };
      }));
      const attachments = preparedFiles.map((file) => file.attachment);
      const textAttachments = preparedFiles
        .map((file) => file.textAttachment)
        .filter((file) => file !== undefined);
      const transportAttachments = preparedFiles
        .filter((file) => !file.textAttachment)
        .map((file) => file.attachment);
      /**
       * A pinned MCP server is named for the model rather than written into the sentence.
       *
       * It used to be inserted as `$name` and rewritten to a `/name` command, which only worked
       * when OpenCode had registered a command of that name — and it put the server into the text
       * the user was composing. Naming it in a marked block keeps the request honest while leaving
       * the bubble showing what was actually typed.
       */
      const mcpInstruction = requestedMcpNames.length > 0
        ? `

${wrapPromptAugmentation(t("mcp.contextInstruction", { names: requestedMcpNames.join("、") }))}`
        : "";
      const fullPrompt = `${appendTextAttachments(text, textAttachments)}${mcpInstruction}`;
      const enabledSkillNames = skills
        .map((skill) => skill.name)
        .filter((name) => !preferences.disabledSkillNames.includes(name));
      const professionalInstructions = buildProfessionalRoleInstructions(
        preferences.professionalRoles,
        enabledSkillNames,
        mcpNames,
      );
      const roleInstructions = [
        preferences.persona.enabled ? preferences.persona.instructions : "",
        professionalInstructions ?? "",
      ].filter(Boolean).join("\n\n");
      const availableSubagents = new Set(agents
        .filter((agent) => agent.mode === "subagent" && !agent.hidden && !agent.disabled)
        .map((agent) => agent.id));
      const promptSubagents = [...new Set([
        ...subagentIDs,
        ...mentionedSubagents(text, agents),
      ])].filter((agentID) => availableSubagents.has(agentID));
      const requestModel = execution ? execution.model : selectedModel;
      const requestAgentID = execution ? execution.agentID : selectedAgentID;
      const model = execution
        ? requestModel ? modelRefWithAvailableVariant(requestModel, execution.variant) : undefined
        : await ensureSelectedModelVariant();
      // V2 prompt has no model field; the model is state on the session itself.
      if (model) await openCodeApi.switchModel(targetSessionID, model, projectPath);
      const messageID = createMessageID();
      refs.cancelledPromptIDs.current.delete(messageID);
      state.activePrompt = {
        fingerprint,
        generation,
        messageID,
        sessionID: targetSessionID,
        startedAt: Date.now(),
      };
      lastSubmittedPrompts.current.set(targetSessionID, { fingerprint, sentAt: Date.now() });
      const commandText = typedText.startsWith("$") ? `/${typedText.slice(1)}` : typedText;
      if (commandText.startsWith("/")) {
        const commandMatch = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(commandText);
        const commandName = commandMatch?.[1] ?? "";
        const argumentsText = commandMatch?.[2]?.trim() ?? "";
        const serverCommand = commands.find((command) => command.name === commandName);
        const isAllowedServerCommand = serverCommand?.source === "mcp"
          || serverCommand?.source === "skill"
          || commandName.startsWith("mcp");
        const isKnownCommand = localSlashCommands.has(commandName) || isAllowedServerCommand;
        if (!isKnownCommand) throw new Error(t("s_6d47b4acb1", { p0: commandName }));
        if (typedText.startsWith("$") && preferences.disabledSkillNames.includes(commandName)) {
          throw new Error(t("s_969b5ede07", { p0: commandName }));
        }
        runtime.setMessages(targetSessionID, (current) => [
          ...current,
          createOptimisticUserMessage(messageID, commandText, attachments),
        ]);
        if (commandName === "init") {
          if (!model) throw new Error(t("s_1d719e37e8"));
          if (state.activePrompt?.generation === generation) {
            state.activePrompt.allowEmptyOutput = true;
          }
          await openCodeApi.initSession(targetSessionID, model, messageID, projectPath);
          // `/session/{id}/init` acknowledges the generated command before its model loop
          // settles. Let SSE and status polling own completion so permissions, tools and the
          // final response stay inside this run instead of briefly returning the composer to idle.
          runtime.setRunStatus(targetSessionID, "streaming");
          pollSessionStatus(targetSessionID, generation);
          return true;
        } else if (commandName === "mcp") {
          const [mcpName, ...mcpPrompt] = argumentsText.split(/\s+/).filter(Boolean);
          if (!mcpName || !mcpNames.includes(mcpName)) throw new Error(t("s_5a92734105"));
          await openCodeApi.sendPrompt(targetSessionID, {
            agents: promptSubagents.map((name) => ({ name })),
            directory: projectPath,
            files: transportAttachments,
            messageID,
            personaInstructions: roleInstructions || undefined,
            text: t("s_8a9ea72c55", {
              p0: mcpName,
              p1: appendTextAttachments(mcpPrompt.join(" "), textAttachments),
            }),
          });
        } else {
          const result = await openCodeApi.executeCommand(
            targetSessionID,
            commandName,
            appendTextAttachments(argumentsText, textAttachments),
            {
              agent: requestAgentID || undefined,
              directory: projectPath,
              files: transportAttachments,
              messageID,
              model,
            },
          );
          if (result.message) {
            runtime.setMessages(targetSessionID, (current) => {
              const next = current.filter((message) => message.id !== result.message?.id);
              return [...next, result.message as SessionMessage].sort(
                (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0),
              );
            });
          }
        }
        runtime.setRunStatus(targetSessionID, "streaming");
        pollSessionStatus(targetSessionID, generation);
        return true;
      }

      runtime.setMessages(targetSessionID, (current) => [
        ...current.filter((message) => message.id !== messageID),
        createOptimisticUserMessage(messageID, text, attachments),
      ]);
      let outgoingFiles = transportAttachments;
      let outgoingText = fullPrompt;
      const visionModel = preferences.visionModel;
      if (
        visionModel
        && !modelAcceptsImages(requestModel)
        && transportAttachments.some((file) => file.mime.startsWith("image/"))
      ) {
        setVisionBusy(true);
        try {
          const described = await describeImagesForTextModel({
            attachments: transportAttachments,
            projectPath,
            visionModel: { id: visionModel.modelID, providerID: visionModel.providerID },
          });
          outgoingFiles = described.attachments;
          outgoingText = `${fullPrompt}${described.text}`;
          // Images leave the request but stay in the bubble, the same way unsupported
          // attachments do below. Without this the picture vanished from the message the
          // moment the server copy replaced the optimistic one.
          if (described.images.length > 0) {
            setDroppedAttachments((current) => ({
              ...current,
              [messageID]: [...(current[messageID] ?? []), ...described.images],
            }));
          }
        } catch (visionError) {
          if (runtime.refs.selectedSessionID.current === targetSessionID) setError(errorMessage(visionError));
        } finally {
          setVisionBusy(false);
        }
      }

      const partitioned = partitionByModality(outgoingFiles, requestModel);
      outgoingFiles = partitioned.sendable;
      if (partitioned.unsupported.length > 0) {
        const names = partitioned.unsupported
          .map((file, index) => file.name ?? t("s_15ff0a654b", { p0: index + 1 }))
          .join("、");
        outgoingText = `${outgoingText}\n\n${wrapPromptAugmentation(t("attachment.dropped", {
          model: requestModel?.name ?? "",
          names,
        }))}`;
        setDroppedAttachments((current) => ({
          ...current,
          [messageID]: partitioned.unsupported,
        }));
      }

      const payload = {
        agent: requestAgentID || undefined,
        agents: promptSubagents.map((name) => ({ name })),
        directory: projectPath,
        files: outgoingFiles,
        messageID,
        model,
        personaInstructions: roleInstructions || undefined,
        text: outgoingText,
      };
      replayablePrompts.current.set(targetSessionID, { payload, sessionID: targetSessionID });
      await openCodeApi.sendPrompt(targetSessionID, payload);
      runtime.setRunStatus(targetSessionID, "streaming");
      pollSessionStatus(targetSessionID, generation);
      return true;
    } catch (sendError) {
      if (state.activePrompt?.generation === generation) state.activePrompt = undefined;
      runtime.setRunStatus(targetSessionID, "error");
      if (runtime.refs.selectedSessionID.current === targetSessionID) setError(errorMessage(sendError));
      throw sendError;
    } finally {
      submittingSessions.current.delete(targetSessionID);
    }
  }, [
    agents,
    commands,
    ensureSelectedModelVariant,
    mcpNames,
    pollSessionStatus,
    preferences,
    projectPath,
    refs,
    runtime,
    selectedAgentID,
    selectedModel,
    selectedSessionID,
    setError,
    skills,
  ]);

  const replayPrompt = useCallback(async (): Promise<boolean> => {
    const replay = replayablePrompts.current.get(selectedSessionID);
    if (!replay || !projectPath || replay.sessionID !== selectedSessionID) return false;
    const state = runtime.get(selectedSessionID);
    if (submittingSessions.current.has(selectedSessionID) || state.activePrompt) return false;
    submittingSessions.current.add(selectedSessionID);
    const generation = ++state.generation;
    state.assistantMessageIDs.clear();
    state.hasActivity = false;
    refs.suppressedStreamingSessionIDs.current.delete(selectedSessionID);
    const messageID = replay.payload.messageID ?? createMessageID();
    state.activePrompt = {
      fingerprint: `retry:${messageID}`,
      generation,
      messageID,
      sessionID: selectedSessionID,
      startedAt: Date.now(),
    };
    try {
      if (runtime.refs.selectedSessionID.current === selectedSessionID) setError("");
      runtime.setRunStatus(selectedSessionID, "submitted");
      if (replay.payload.model) {
        await openCodeApi.switchModel(selectedSessionID, replay.payload.model, projectPath);
      }
      await openCodeApi.sendPrompt(replay.sessionID, replay.payload);
      runtime.setRunStatus(selectedSessionID, "streaming");
      pollSessionStatus(replay.sessionID, generation);
      return true;
    } catch (retryError) {
      if (state.activePrompt?.generation === generation) state.activePrompt = undefined;
      runtime.setRunStatus(selectedSessionID, "error");
      if (runtime.refs.selectedSessionID.current === selectedSessionID) setError(errorMessage(retryError));
      return false;
    } finally {
      submittingSessions.current.delete(selectedSessionID);
    }
  }, [
    pollSessionStatus,
    projectPath,
    refs,
    runtime,
    selectedSessionID,
    setError,
  ]);

  const autoRetry = useAutoRetry({
    enabled: Boolean(selectedSessionID && replayablePrompts.current.has(selectedSessionID)),
    messages,
    onRetry: replayPrompt,
    runStatus,
    sessionID: selectedSessionID,
  });

  return {
    autoRetry,
    droppedAttachments,
    sendPromptNow,
    visionBusy,
  };
}
