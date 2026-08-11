import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantShell } from "@/components/assistant/AssistantShell";
import { ErrorBoundary } from "@/components/assistant/ErrorBoundary";
import type { SectionID as WorkspaceSectionID } from "@/components/assistant/WorkspaceDialog";
import {
  groupConversationTurns,
  resolveStreamingAssistantState,
} from "@/components/assistant/conversationTurns";
import { contextToPromptInputFile, fileToEmbeddedTextAttachment, fileToPromptAttachment, isTextFile } from "@/components/assistant/promptPayload";
import type { QueuedPrompt } from "@/components/assistant/PromptQueue";
import { errorMessage, modelKey } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData, RunStatus } from "@/components/assistant/shared";
import { modelRefWithAvailableVariant, modelSupportsVariant } from "@/components/assistant/modelVariants";
import {
  localSlashCommands,
  mentionedSubagents,
} from "@/components/assistant/appRuntime";
import { ideaApi } from "@/lib/idea";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "@/lib/preferences";
import { useRunLifecycle, type ActivePrompt } from "@/hooks/useRunLifecycle";
import { AUTO_RETRY_MAX_ATTEMPTS, useAutoRetry } from "@/hooks/useAutoRetry";
import { useBatchedOpenCodeEvents } from "@/hooks/useBatchedOpenCodeEvents";
import { useInteractiveStatePolling } from "@/hooks/useInteractiveStatePolling";
import { useIdeaTheme } from "@/hooks/useIdeaTheme";
import { useSessionDiffs } from "@/hooks/useSessionDiffs";
import { useModelVariantGuard } from "@/hooks/useModelVariantGuard";
import { useOpenCodeEventStream } from "@/hooks/useOpenCodeEventStream";
import {
  createMessageID,
  createOptimisticUserMessage,
  openCodeApi,
  setOpenCodeBaseUrl,
} from "@/lib/opencode";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type {
  AgentInfo,
  CommandInfo,
  ModelInfo,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  SessionInfo,
  SessionMessage,
  SkillInfo,
  TodoInfo,
} from "@/lib/opencode";
import type { WorkspacePreferences } from "@/lib/preferences";
import { appendTextAttachments } from "@/lib/textAttachments";
import { restoreActiveRun } from "@/components/assistant/runRestoration";
import { getContextUsage } from "@/lib/tokenUsage";
import { checkForUpdate, type UpdateStatus } from "@/lib/updateCheck";
import { approvalModeAllows, type ApprovalMode } from "@/lib/approvalMode";
import { buildProfessionalRoleInstructions } from "@/lib/professionalRoles";
import { t } from "@/lib/i18n";
interface QuestionAnswers { [requestID: string]: string[][]; }

function App() {
  const { applyIdeaTheme, theme, toggleTheme } = useIdeaTheme();
  const [projectPath, setProjectPath] = useState<string>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionID, setSelectedSessionID] = useState("");
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [mcpNames, setMcpNames] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedAgentID, setSelectedAgentID] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<string>();
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("ask");
  const [permissions, setPermissionsState] = useState<PermissionRequest[]>([]);
  /**
   * Keeps the previous array when the pending set is unchanged. Polling replaced it with a fresh
   * array every second, and that new identity rebuilt the conversation footer — which is what made
   * the approval card flicker while it was waiting for an answer.
   */
  /**
   * Set below, once projectPath and the reply helper exist. Every path that surfaces a permission
   * funnels through this setter, so filtering here is what guarantees no auto-allowed request can
   * reach the UI by some route that forgot to check.
   */
  const autoAnswerRef = useRef<((requests: PermissionRequest[]) => PermissionRequest[]) | undefined>(undefined);
  const setPermissions = useCallback((next: PermissionRequest[] | ((current: PermissionRequest[]) => PermissionRequest[])) => {
    setPermissionsState((current) => {
      const raw = typeof next === "function" ? next(current) : next;
      const value = autoAnswerRef.current ? autoAnswerRef.current(raw) : raw;
      const same = value.length === current.length
        && value.every((item, index) => item.id === current[index]?.id);
      return same ? current : value;
    });
  }, []);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  /**
   * Sessions whose run is blocked on an approval. Switching away hides the card, so without this
   * the run just looks stuck; the session list shows a 待批准 badge instead.
   */
  const [pendingApprovalSessionIDs, setPendingApprovalSessionIDs] = useState<string[]>([]);
  const [todos, setTodos] = useState<TodoInfo[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswers>({});
  const [contexts, setContexts] = useState<ContextChipData[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>("ready");
  /** Driven by session.status, so the automatic compaction pass shows up as well as a manual one. */
  const [compacting, setCompacting] = useState(false);
  /** Checked once per panel load; a newer release turns the header dot amber. */
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSectionID>("connection");
  const [composerText, setComposerText] = useState("");
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [editingQueuedPrompt, setEditingQueuedPrompt] = useState<QueuedPrompt>();
  const [streamingAssistantID, setStreamingAssistantID] = useState<string>();
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => loadWorkspacePreferences());
  const [editingSessionTitle, setEditingSessionTitle] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [deletingSessionID, setDeletingSessionID] = useState("");
  const [error, setError] = useState("");
  const refreshTimer = useRef<number>();
  const refreshInFlight = useRef(false);
  const submitting = useRef(false);
  const lastSubmittedPrompt = useRef<{ fingerprint: string; sentAt: number }>();
  const activePrompt = useRef<ActivePrompt>();
  const seenEventIDs = useRef(new Set<string>());
  const suppressedStreamingSessionIDs = useRef(new Set<string>());
  const cancelledPromptIDs = useRef(new Set<string>());
  const activeAssistantMessageIDs = useRef(new Set<string>());
  const activePromptHasActivity = useRef(false);
  const drainingQueue = useRef(false);
  const queueDrainPaused = useRef(false);
  const promptGeneration = useRef(0);
  const selectedSessionIDRef = useRef(selectedSessionID);
  /** The last prompt sent, so a transient failure can be replayed without the user retyping it. */
  const replayablePrompt = useRef<{ payload: Parameters<typeof openCodeApi.sendPrompt>[1]; sessionID: string }>();
  const refreshWorkspaceRef = useRef<(includeMessages?: boolean) => Promise<void>>();

  const eventStreamRefs = useMemo(() => ({
    activeAssistantMessageIDs,
    activePrompt,
    activePromptHasActivity,
    cancelledPromptIDs,
    refreshTimer,
    seenEventIDs,
    selectedSessionIDRef,
    suppressedStreamingSessionIDs,
  }), []);

  const lifecycleRefs = useMemo(() => ({
    activeAssistantMessageIDs,
    activePrompt,
    activePromptHasActivity,
    cancelledPromptIDs,
    promptGeneration,
    queueDrainPaused,
    selectedSessionIDRef,
    suppressedStreamingSessionIDs,
  }), [
    activeAssistantMessageIDs,
    activePrompt,
    activePromptHasActivity,
    cancelledPromptIDs,
    promptGeneration,
    queueDrainPaused,
    selectedSessionIDRef,
    suppressedStreamingSessionIDs,
  ]);

  const { clearStatusPolling, finishRun, handleStop, pollSessionStatus } = useRunLifecycle({
    projectPath,
    refs: lifecycleRefs,
    selectedSessionID,
    setError,
    setMessages,
    setRunStatus,
    setStreamingAssistantID,
  });
  const { clearPendingOpenCodeEvents, enqueueOpenCodeEvent, flushOpenCodeEvents } = useBatchedOpenCodeEvents(setMessages);

  useEffect(() => {
    selectedSessionIDRef.current = selectedSessionID;
  }, [selectedSessionID]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionID),
    [selectedSessionID, sessions]
  );
  const selectableModels = useMemo(
    () => models
      .filter((model) => model.enabled !== false && model.status !== "deprecated")
      .sort((left, right) => left.name.localeCompare(right.name)),
    [models]
  );
  const resolvedModelKey = selectedModelKey || (currentSession?.model ? modelKey(currentSession.model) : "");
  const selectedModel = selectableModels.find((model) => modelKey(model) === resolvedModelKey);
  const contextFallbackModel = models.find((model) => modelKey(model) === resolvedModelKey) ?? selectedModel;
  const contextUsage = useMemo(
    () => getContextUsage(messages, models, contextFallbackModel),
    [contextFallbackModel, messages, models]
  );
  const isGenerating = runStatus === "submitted" || runStatus === "streaming";
  const ensureSelectedModelVariant = useModelVariantGuard({ model: selectedModel, projectPath, selectedSessionID, selectedVariant, setError, setSelectedVariant, setSessions });
  const diffsByMessageID = useSessionDiffs({ messages, projectPath, runStatus, sessionID: selectedSessionID });

  const syncQuestionAnswers = useCallback((requests: QuestionRequest[]) => {
    setQuestionAnswers((current) => {
      const next = { ...current };
      requests.forEach((request) => {
        next[request.id] ??= request.questions.map(() => []);
      });
      return next;
    });
  }, []);

  const loadMessages = useCallback(async (sessionID: string, directory?: string) => {
    const nextMessages = await openCodeApi.getMessages(sessionID, directory);
    setMessages(nextMessages);
    return nextMessages;
  }, []);

  const loadTodos = useCallback(async (sessionID: string, directory?: string) => {
    const nextTodos = await openCodeApi.getTodos(sessionID, directory);
    setTodos(nextTodos);
    return nextTodos;
  }, []);

  const loadPending = useCallback(async (sessionID: string) => {
    // Both registries are read because a request lands in exactly one of them and neither list
    // sees the other's. Reading only the session-scoped one left genuinely blocked runs invisible.
    const [scoped, global, nextQuestions] = await Promise.all([
      openCodeApi.listPermissions(sessionID, projectPath).catch(() => []),
      openCodeApi.listPendingPermissions(projectPath).catch(() => []),
      openCodeApi.listQuestions(sessionID, projectPath),
    ]);
    const nextPermissions = [...scoped, ...global.filter((item) => item.sessionID === sessionID)]
      .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
    setPermissions(nextPermissions);
    setPendingApprovalSessionIDs((current) => {
      const others = current.filter((id) => id !== sessionID);
      return nextPermissions.length > 0 ? [...others, sessionID] : others;
    });
    if (nextPermissions.length === 0) {
      void ideaApi.setPendingApproval(sessionID, false).catch(() => undefined);
    }
    setQuestions(nextQuestions);
    syncQuestionAnswers(nextQuestions);
    return { permissions: nextPermissions, questions: nextQuestions };
  }, [projectPath, syncQuestionAnswers]);

  useInteractiveStatePolling({
    enabled: isGenerating,
    loadPending,
    loadTodos,
    projectPath,
    sessionID: selectedSessionID,
  });

  useEffect(() => {
    void ideaApi
      .getPendingApprovals()
      .then((result) => setPendingApprovalSessionIDs(result.sessions))
      .catch(() => undefined);
  }, []);

  const refreshWorkspace = useCallback(async (includeMessages = true) => {
    if (!projectPath || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const [nextModels, nextAgents, nextSessions, nextCommands, nextSkills, nextConfig] = await Promise.all([
        openCodeApi.listModels(projectPath),
        openCodeApi.listAgents(projectPath),
        openCodeApi.listSessions(projectPath),
        openCodeApi.listCommands(projectPath),
        openCodeApi.listSkills(projectPath),
        openCodeApi.getConfig(projectPath),
      ]);
      const sessionID = selectedSessionID && nextSessions.some((session) => session.id === selectedSessionID)
        ? selectedSessionID
        : nextSessions[0]?.id ?? "";
      setModels(nextModels);
      setAgents(nextAgents);
      setCommands(nextCommands);
      setMcpNames(Object.entries(nextConfig.mcp ?? {})
        .filter(([, config]) => config.enabled !== false)
        .map(([name]) => name));
      setSkills(nextSkills);
      setSessions(nextSessions);
      setSelectedSessionID(sessionID);
      if (sessionID && includeMessages) {
        await loadMessages(sessionID, projectPath);
      } else if (!sessionID) {
        setMessages([]);
      }
      if (sessionID) await loadPending(sessionID);
      else { setPermissions([]); setQuestions([]); }
      setConnected(true);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
      setConnected(false);
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [loadMessages, loadPending, projectPath, selectedSessionID]);

  useEffect(() => {
    refreshWorkspaceRef.current = refreshWorkspace;
  }, [refreshWorkspace]);

  const scheduleRefresh = useCallback((includeMessages = false) => {
    if (refreshTimer.current !== undefined) {
      window.clearTimeout(refreshTimer.current);
    }
    refreshTimer.current = window.setTimeout(() => {
      void refreshWorkspaceRef.current?.(includeMessages);
    }, 220);
  }, []);

  const createSession = useCallback(async () => {
    if (!projectPath) return;
    try {
      setError("");
      const model = selectedModel ? modelRefWithAvailableVariant(selectedModel, selectedVariant) : undefined;
      const session = await openCodeApi.createSession(projectPath, model, selectedAgentID || undefined);
      // Enforcement lives in the plugin, not in OpenCode: PATCH /session accepts `permission`,
      // returns 200 and discards it (verified on 1.18.12). The bridge's `permission.ask` hook
      // reads the mode back from /api/approval-mode instead.
      await ideaApi.setApprovalMode(session.id, approvalMode);
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setSelectedSessionID(session.id);
      setMessages([]);
      setPermissions([]);
      setQuestions([]);
      setTodos([]);
      setQuestionAnswers({});
      setQueuedPrompts([]);
      setEditingQueuedPrompt(undefined);
      queueDrainPaused.current = false;
      setRunStatus("ready");
      setStreamingAssistantID(undefined);
      suppressedStreamingSessionIDs.current.delete(session.id);
      setSessionDialogOpen(false);
    } catch (createError) {
      setError(errorMessage(createError));
    }
  }, [approvalMode, projectPath, selectedAgentID, selectedModel, selectedVariant]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      setBooting(true);
      setError("");
      try {
        let runtime;
        try {
          runtime = await ideaApi.getRuntimeConfig();
        } catch (bridgeError) {
          const devProjectPath = import.meta.env.DEV ? import.meta.env.VITE_PROJECT_PATH as string | undefined : undefined;
          if (!devProjectPath) throw bridgeError;
          runtime = {
            baseUrl: import.meta.env.VITE_OPENCODE_BASE_URL as string | undefined,
            projectPath: devProjectPath,
          };
        }
        if (runtime.ideaTheme) applyIdeaTheme(runtime.ideaTheme);
        if (runtime.baseUrl) {
          setOpenCodeBaseUrl(runtime.baseUrl);
        }
        const directory = runtime.projectPath ?? await ideaApi
          .getProjectPath()
          .catch(() => import.meta.env.VITE_PROJECT_PATH as string | undefined);
        if (!directory) throw new Error(t("s_82c867faaa"));
        if (runtime.error) throw new Error(runtime.error);

        const [health, nextModels, nextAgents, initialSessions, nextCommands, nextSkills, nextConfig] = await Promise.all([
          openCodeApi.health(),
          openCodeApi.listModels(directory),
          openCodeApi.listAgents(directory),
          openCodeApi.listSessions(directory),
          openCodeApi.listCommands(directory),
          openCodeApi.listSkills(directory),
          openCodeApi.getConfig(directory),
        ]);
        if (cancelled) return;

        const firstModel = nextModels
          .filter((model) => model.enabled !== false && model.status !== "deprecated")
          .sort((left, right) => left.name.localeCompare(right.name))[0];
        const defaultAgent = nextAgents.find((agent) => agent.mode === "primary" && !agent.hidden)?.id ?? "";
        let nextSessions = initialSessions;
        if (nextSessions.length === 0) {
          const session = await openCodeApi.createSession(
            directory,
            firstModel ? { id: firstModel.id, providerID: firstModel.providerID } : undefined,
            defaultAgent || undefined
          );
          nextSessions = [session];
        }
        if (cancelled) return;

        const initialSession = nextSessions[0];
        setProjectPath(directory);
        setConnected(health.healthy);
        setModels(nextModels);
        setAgents(nextAgents);
        setCommands(nextCommands);
        setMcpNames(Object.keys(nextConfig.mcp ?? {}));
        setSkills(nextSkills);
        setPreferences(loadWorkspacePreferences(directory));
        setSessions(nextSessions);
        setSelectedSessionID(initialSession?.id ?? "");
        setSelectedModelKey(initialSession?.model ? modelKey(initialSession.model) : firstModel ? modelKey(firstModel) : "");
        setSelectedVariant(initialSession?.model?.variant);
        setSelectedAgentID(initialSession?.agent ?? defaultAgent);
      } catch (initializeError) {
        if (!cancelled) {
          setConnected(false);
          setError(errorMessage(initializeError));
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [applyIdeaTheme, bootstrapAttempt]);

  useEffect(() => {
    if (!selectedSessionID || !projectPath) return;
    clearPendingOpenCodeEvents();
    let cancelled = false;
    const loadSelectedSession = async () => {
      try {
        const [nextMessages, pending, nextTodos, status, nextApprovalMode] = await Promise.all([
          openCodeApi.getMessages(selectedSessionID, projectPath),
          loadPending(selectedSessionID),
          openCodeApi.getTodos(selectedSessionID, projectPath),
          openCodeApi.getSessionStatus(selectedSessionID, projectPath),
          // The mode lives in the plugin, not in OpenCode: PATCH /session discards the permission
          // payload, so reading it back from OpenCode always answered "ask" and silently reset
          // the picker every time you switched sessions.
          ideaApi.getApprovalMode(selectedSessionID)
            .then((result) => result.mode as ApprovalMode)
            .catch(() => "ask" as ApprovalMode),
        ]);
        if (cancelled) return;
        if (activePrompt.current?.sessionID !== selectedSessionID) {
          activePrompt.current = undefined;
          activeAssistantMessageIDs.current.clear();
          activePromptHasActivity.current = false;
          clearStatusPolling();
        }
        setMessages(nextMessages);
        setPermissions(pending.permissions);
        setQuestions(pending.questions);
        setTodos(nextTodos);
        setApprovalMode(nextApprovalMode);
        const busy = status.type === "busy";
        setRunStatus(busy ? "streaming" : "ready");
        if (busy) {
          const currentPrompt = activePrompt.current;
          if (currentPrompt?.sessionID === selectedSessionID) {
            pollSessionStatus(selectedSessionID, currentPrompt.generation);
          } else {
            const generation = ++promptGeneration.current;
            const restored = restoreActiveRun(nextMessages, selectedSessionID, generation);
            activePrompt.current = restored.prompt;
            activeAssistantMessageIDs.current.clear();
            restored.assistantIDs.forEach((messageID) => activeAssistantMessageIDs.current.add(messageID));
            activePromptHasActivity.current = restored.hasActivity;
            setStreamingAssistantID(restored.streamingAssistantID);
            pollSessionStatus(selectedSessionID, generation);
          }
        } else {
          if (activePrompt.current?.sessionID === selectedSessionID) activePrompt.current = undefined;
          activeAssistantMessageIDs.current.clear();
          activePromptHasActivity.current = false;
          setStreamingAssistantID(undefined);
          clearStatusPolling();
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      }
    };
    void loadSelectedSession();
    return () => {
      cancelled = true;
    };
  }, [clearPendingOpenCodeEvents, clearStatusPolling, loadPending, pollSessionStatus, projectPath, selectedSessionID]);

  useEffect(() => {
    if (!currentSession) return;
    if (currentSession.model) {
      setSelectedModelKey(modelKey(currentSession.model));
      setSelectedVariant(currentSession.model.variant);
    }
    if (currentSession.agent) setSelectedAgentID(currentSession.agent);
  }, [currentSession]);

  useOpenCodeEventStream({
    applyIdeaTheme,
    onPendingApprovals: setPendingApprovalSessionIDs,
    enqueueOpenCodeEvent,
    finishRun,
    flushOpenCodeEvents,
    loadPending,
    loadTodos,
    projectPath,
    refs: eventStreamRefs,
    scheduleRefresh,
    setCompacting,
    setConnected,
    setContexts,
    setError,
    setQuestions,
    setRunStatus,
    setStreamingAssistantID,
    setTodos,
    syncQuestionAnswers,
  });

  const sendPromptNow = useCallback(async ({ text, files }: PromptInputMessage): Promise<boolean> => {
    if (!selectedSessionID || !projectPath) return false;
    if (submitting.current || activePrompt.current?.sessionID === selectedSessionID) return false;
    const typedText = text.trim();
    if (!typedText && files.length === 0) return false;

    const fingerprint = `${selectedSessionID}\n${typedText}\n${files.map((file) => `${file.filename ?? file.file.name}:${file.mediaType ?? file.file.type}:${file.url ?? ""}`).join("\n")}`;
    const existingPrompt = activePrompt.current;
    if (existingPrompt?.sessionID === selectedSessionID && existingPrompt.fingerprint === fingerprint) {
      return false;
    }
    const last = lastSubmittedPrompt.current;
    if (last?.fingerprint === fingerprint && Date.now() - last.sentAt < 1200) {
      return false;
    }

    submitting.current = true;
    suppressedStreamingSessionIDs.current.delete(selectedSessionID);
    const generation = ++promptGeneration.current;
    activeAssistantMessageIDs.current.clear();
    activePromptHasActivity.current = false;
    setStreamingAssistantID(undefined);
    try {
      setError("");
      setRunStatus("submitted");
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
      const fullPrompt = appendTextAttachments(text, textAttachments);
      const enabledSkillNames = skills
        .map((skill) => skill.name)
        .filter((name) => !preferences.disabledSkillNames.includes(name));
      const professionalInstructions = buildProfessionalRoleInstructions(
        preferences.professionalRoles,
        enabledSkillNames,
        mcpNames
      );
      const roleInstructions = [
        preferences.persona.enabled ? preferences.persona.instructions : "",
        professionalInstructions ?? "",
      ].filter(Boolean).join("\n\n");
      const model = await ensureSelectedModelVariant();
      const messageID = createMessageID();
      cancelledPromptIDs.current.delete(messageID);
      activePrompt.current = { fingerprint, generation, messageID, sessionID: selectedSessionID, startedAt: Date.now() };
      lastSubmittedPrompt.current = { fingerprint, sentAt: Date.now() };
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
        setMessages((current) => [...current, createOptimisticUserMessage(messageID, commandText, attachments)]);
        setContexts([]);
        if (commandName === "init") {
          if (!model) throw new Error(t("s_1d719e37e8"));
          await openCodeApi.initSession(selectedSessionID, model, messageID, projectPath);
        } else if (commandName === "mcp") {
          const [mcpName, ...mcpPrompt] = argumentsText.split(/\s+/).filter(Boolean);
          if (!mcpName || !mcpNames.includes(mcpName)) throw new Error(t("s_5a92734105"));
          await openCodeApi.sendPrompt(selectedSessionID, {
            agents: mentionedSubagents(text, agents).map((name) => ({ name })),
            directory: projectPath,
            files: transportAttachments,
            messageID,
            personaInstructions: roleInstructions || undefined,
            text: t("s_8a9ea72c55", { p0: mcpName, p1: appendTextAttachments(mcpPrompt.join(" "), textAttachments) }),
          });
        } else {
          const result = await openCodeApi.executeCommand(
            selectedSessionID,
            commandName,
            appendTextAttachments(argumentsText, textAttachments),
            {
              agent: selectedAgentID || undefined,
              directory: projectPath,
              files: transportAttachments,
              messageID,
              model,
            }
          );
          if (result.message) {
            setMessages((current) => {
              const next = current.filter((message) => message.id !== result.message?.id);
              return [...next, result.message as SessionMessage].sort(
                (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0)
              );
            });
          }
        }
        setComposerText("");
        setRunStatus("streaming");
        pollSessionStatus(selectedSessionID, generation);
        return true;
      }

      setMessages((current) => [
        ...current.filter((message) => message.id !== messageID),
        createOptimisticUserMessage(messageID, text, attachments),
      ]);
      const payload = {
        agent: selectedAgentID || undefined,
        agents: mentionedSubagents(text, agents).map((name) => ({ name })),
        directory: projectPath,
        files: transportAttachments,
        messageID,
        model,
        personaInstructions: roleInstructions || undefined,
        text: fullPrompt,
      };
      // Kept verbatim so an automatic retry replays exactly what was sent, attachments included.
      // Rebuilding it from the rendered history would lose them: the transport attachments are
      // browser File objects that only exist on the way in.
      replayablePrompt.current = { payload, sessionID: selectedSessionID };
      await openCodeApi.sendPrompt(selectedSessionID, payload);
      setRunStatus("streaming");
      pollSessionStatus(selectedSessionID, generation);
      return true;
    } catch (sendError) {
      if (activePrompt.current?.generation === generation) activePrompt.current = undefined;
      setRunStatus("error");
      setError(errorMessage(sendError));
      throw sendError;
    } finally {
      submitting.current = false;
    }
  }, [agents, commands, ensureSelectedModelVariant, mcpNames, pollSessionStatus, preferences, projectPath, selectedAgentID, selectedSessionID, skills]);

  /**
   * Replays the failed prompt under its original message id.
   *
   * Reusing the id is what keeps the history honest: OpenCode treats a repeated id as the same
   * user message rather than appending a duplicate, so five attempts leave one prompt in the
   * transcript instead of five.
   */
  const replayPrompt = useCallback(async (): Promise<boolean> => {
    const replay = replayablePrompt.current;
    if (!replay || !projectPath || replay.sessionID !== selectedSessionID) return false;
    if (submitting.current || activePrompt.current?.sessionID === selectedSessionID) return false;
    submitting.current = true;
    const generation = ++promptGeneration.current;
    activeAssistantMessageIDs.current.clear();
    activePromptHasActivity.current = false;
    try {
      setError("");
      setRunStatus("submitted");
      await openCodeApi.sendPrompt(replay.sessionID, replay.payload);
      setRunStatus("streaming");
      pollSessionStatus(replay.sessionID, generation);
      return true;
    } catch (retryError) {
      setRunStatus("error");
      setError(errorMessage(retryError));
      return false;
    } finally {
      submitting.current = false;
    }
  }, [pollSessionStatus, projectPath, selectedSessionID]);

  const autoRetry = useAutoRetry({
    messages,
    onRetry: replayPrompt,
    runStatus,
    sessionID: selectedSessionID,
  });

  const handlePrompt = useCallback(async ({ text, files }: PromptInputMessage) => {
    if (!selectedSessionID || !projectPath || submitting.current) return false;
    const typedText = text.trim();
    if (!typedText && contexts.length === 0 && files.length === 0) return false;
    const commandText = typedText.startsWith("$") ? `/${typedText.slice(1)}` : typedText;
    const contextFiles = contexts.map(contextToPromptInputFile);
    const request: PromptInputMessage = {
      files: [...(files.length > 0 ? files : editingQueuedPrompt?.files ?? []), ...contextFiles],
      text: commandText,
    };
    setEditingQueuedPrompt(undefined);
    queueDrainPaused.current = false;
    setContexts([]);
    if (isGenerating || activePrompt.current?.sessionID === selectedSessionID) {
      setQueuedPrompts((current) => [...current, { ...request, id: `queue_${createMessageID()}` }]);
      return true;
    }
    return sendPromptNow(request);
  }, [contexts, editingQueuedPrompt, isGenerating, projectPath, selectedSessionID, sendPromptNow]);

  useEffect(() => {
    if (!projectPath || !selectedSessionID || isGenerating || activePrompt.current || queueDrainPaused.current) return;
    const next = queuedPrompts[0];
    if (!next || drainingQueue.current) return;
    drainingQueue.current = true;
    setQueuedPrompts((current) => current.filter((item) => item.id !== next.id));
    void sendPromptNow(next).catch(() => undefined).finally(() => {
      drainingQueue.current = false;
    });
  }, [isGenerating, projectPath, queuedPrompts, selectedSessionID, sendPromptNow]);

  const handleQueueEdit = useCallback((item: QueuedPrompt) => {
    setQueuedPrompts((current) => current.filter((queued) => queued.id !== item.id));
    setEditingQueuedPrompt(item);
    setComposerText(item.text);
  }, []);

  const handleQueueDelete = useCallback((id: string) => {
    setQueuedPrompts((current) => current.filter((item) => item.id !== id));
  }, []);

  const handleQueueClear = useCallback(() => {
    setQueuedPrompts([]);
  }, []);

  /**
   * Answers the requests the current mode already covers, so no card is shown for them.
   *
   * The panel is the only component that reliably knows the mode: it is the thing the user set it
   * on. Routing the decision through the OpenCode plugin instead meant the answer depended on the
   * bridge being loaded, on the hook being dispatched, and on the reply reaching the right route —
   * three things that can each fail silently, and did. Deciding here removes all three from the
   * common path; the bridge stays as the fallback for requests raised while no panel is open.
   *
   * Ref, not state: this runs inside a setState updater, where a stale closure over `approvalMode`
   * would answer with whatever the mode was when the effect was created.
   */
  const approvalModeRef = useRef(approvalMode);
  approvalModeRef.current = approvalMode;
  const autoAnsweredRef = useRef(new Set<string>());
  /**
   * Permission kinds the user waved through for the run in progress.
   *
   * "Always" used to be sent to OpenCode, which stored a rule in its own database keyed by
   * project — permanent, ranked above the approval mode, and invisible until we built a page to
   * list it. Worse, websearch and edit declare a `*` pattern, so one click silently granted the
   * whole category forever. Holding the decision here instead keeps it to the run the user was
   * actually looking at and leaves OpenCode configuration untouched.
   */
  const runAllowancesRef = useRef(new Set<string>());
  /**
   * Keyed on the action alone, deliberately.
   *
   * A task that hands work to a subagent runs it in a separate session, so including the session
   * id meant the grant stopped applying the moment the work moved one level down — which is the
   * opposite of what "allow for this task" promises. Cross-session leakage is prevented by
   * clearing on session switch instead.
   */
  const allowanceKey = (action: string) => action.trim().toLowerCase();

  const autoAnswerPermissions = useCallback((requests: PermissionRequest[]): PermissionRequest[] => {
    if (!projectPath) return requests;
    return requests.filter((request) => {
      const allowedForRun = runAllowancesRef.current.has(allowanceKey(request.action));
      if (!allowedForRun && !approvalModeAllows(approvalModeRef.current, request.action)) return true;
      // Replies are fire-and-forget, so the id is remembered: polling re-delivers a request until
      // OpenCode drops it, and a second reply to the same id is an error rather than a no-op.
      if (autoAnsweredRef.current.has(request.id)) return false;
      autoAnsweredRef.current.add(request.id);
      void openCodeApi
        .replyPermission(request.sessionID, request.id, "once", projectPath)
        .catch((error: unknown) => {
          // The bridge plugin answers the same request when it gets there first, so losing that
          // race is the expected outcome, not a failure — the run is unblocked either way. Only a
          // genuine failure goes to the user, and it hands the request back for a manual answer.
          if (/not found/i.test(errorMessage(error))) return;
          autoAnsweredRef.current.delete(request.id);
          setError(errorMessage(error));
        });
      return false;
    });
  }, [projectPath]);

  /**
   * The allowance covers one whole task: from the request the user made to the answer they get
   * back, including every tool call and subagent step in between.
   *
   * It used to be cleared whenever the run reported "ready", which sounds equivalent but is not.
   * "Ready" is inferred from the session going idle, and a pending permission prompt makes the
   * session idle — it is waiting on the user, not working. So granting "allow for this task" put
   * the run into exactly the state that revoked it, and the next tool call asked again.
   *
   * Submitting the next prompt is the one unambiguous signal that the previous task is over, so
   * that is what ends the grant.
   */
  useEffect(() => {
    if (runStatus === "submitted") runAllowancesRef.current.clear();
  }, [runStatus]);
  useEffect(() => {
    runAllowancesRef.current.clear();
  }, [selectedSessionID]);

  /**
   * Re-reads the task list once a round is over.
   *
   * The panel otherwise only learns about todos from `session.todo` events, and the last
   * `todowrite` of a turn frequently lands while the run is already winding down — the event is
   * missed and the pill keeps showing a step the model finished. Asking once at the end costs a
   * single request and makes the final state match what OpenCode actually stored.
   */
  useEffect(() => {
    if (runStatus !== "ready" && runStatus !== "error") return;
    if (!selectedSessionID || !projectPath) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void openCodeApi
        .getTodos(selectedSessionID, projectPath)
        .then((next) => {
          if (!cancelled) setTodos(next);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectPath, runStatus, selectedSessionID]);

  useEffect(() => {
    void checkForUpdate().then(setUpdateStatus).catch(() => undefined);
  }, []);

  autoAnswerRef.current = autoAnswerPermissions;

  const handlePermissionReply = useCallback(async (request: PermissionRequest, reply: PermissionReply) => {
    if (!projectPath) return;
    // "Always" never leaves the panel. It is remembered here for the rest of this run and sent to
    // OpenCode as a plain "once", so nothing is written to its database and the approval mode
    // stays the authority once the run is over.
    const effective: PermissionReply = reply === "always" ? "once" : reply;
    if (reply === "always") runAllowancesRef.current.add(allowanceKey(request.action));
    try {
      await openCodeApi.replyPermission(request.sessionID, request.id, effective, projectPath);
    } catch (replyError) {
      // "Not found" means the request is already resolved — the run was stopped, the mode was
      // raised to one that auto-allows, or the bridge answered first. The card is stale rather
      // than broken, so it is dismissed silently; an error banner here blamed the user's click
      // for something that had already gone the way they wanted.
      if (!/not found/i.test(errorMessage(replyError))) {
        setError(errorMessage(replyError));
        return;
      }
    }
    setPermissions((current) => {
      const next = current.filter((item) => item.id !== request.id);
      // Clear the session badge as soon as its last request is answered.
      if (next.length === 0) {
        setPendingApprovalSessionIDs((ids) => ids.filter((id) => id !== request.sessionID));
        void ideaApi.setPendingApproval(request.sessionID, false).catch(() => undefined);
      }
      return next;
    });
  }, [projectPath]);

  const handleQuestionReply = useCallback(async (request: QuestionRequest) => {
    if (!projectPath) return;
    try {
      await openCodeApi.replyQuestion(
        request.sessionID,
        request.id,
        questionAnswers[request.id] ?? request.questions.map(() => []),
        projectPath
      );
      setQuestions((current) => current.filter((item) => item.id !== request.id));
    } catch (replyError) {
      setError(errorMessage(replyError));
    }
  }, [projectPath, questionAnswers]);

  const handleQuestionReject = useCallback(async (request: QuestionRequest) => {
    if (!projectPath) return;
    try {
      await openCodeApi.rejectQuestion(request.sessionID, request.id, projectPath);
      setQuestions((current) => current.filter((item) => item.id !== request.id));
    } catch (rejectError) {
      setError(errorMessage(rejectError));
    }
  }, [projectPath]);

  const handleQuestionChange = useCallback((request: QuestionRequest, questionIndex: number, values: string[]) => {
    setQuestionAnswers((current) => {
      const answers = current[request.id] ?? request.questions.map(() => []);
      const nextAnswers = answers.map((answer) => [...answer]);
      nextAnswers[questionIndex] = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
      return { ...current, [request.id]: nextAnswers };
    });
  }, []);

  const handleRefresh = useCallback(() => {
    if (projectPath) {
      void refreshWorkspace();
      return;
    }
    setError("");
    setConnected(null);
    setBooting(true);
    setBootstrapAttempt((current) => current + 1);
  }, [projectPath, refreshWorkspace]);

  const handleApprovalModeChange = useCallback(async (mode: ApprovalMode) => {
    const previous = approvalMode;
    setApprovalMode(mode);
    if (!projectPath || !selectedSessionID) return;
    try {
      await ideaApi.setApprovalMode(selectedSessionID, mode);
    } catch (modeError) {
      setApprovalMode(previous);
      setError(errorMessage(modeError));
    }
  }, [approvalMode, projectPath, selectedSessionID]);

  const handleModelChange = useCallback(async (value: string) => {
    if (!selectedSessionID || value === resolvedModelKey) return;
    const nextModel = selectableModels.find((model) => modelKey(model) === value);
    if (!nextModel) return;
    const previousKey = selectedModelKey;
    const previousVariant = selectedVariant;
    const nextRef = { id: nextModel.id, providerID: nextModel.providerID };
    setSelectedModelKey(value);
    setSelectedVariant(undefined);
    try {
      await openCodeApi.switchModel(selectedSessionID, nextRef, projectPath);
      setSessions((current) => current.map((session) => session.id === selectedSessionID
        ? { ...session, model: nextRef }
        : session));
    } catch (switchError) {
      setSelectedModelKey(previousKey);
      setSelectedVariant(previousVariant);
      setError(errorMessage(switchError));
    }
  }, [projectPath, resolvedModelKey, selectableModels, selectedModelKey, selectedSessionID, selectedVariant]);

  const handleVariantChange = useCallback(async (variant: string | undefined) => {
    if (!selectedSessionID || !selectedModel || variant === selectedVariant) return;
    if (!modelSupportsVariant(selectedModel, variant)) return setError(t("s_fbae765f6e", { p0: variant }));
    const previous = selectedVariant;
    const nextRef = modelRefWithAvailableVariant(selectedModel, variant);
    setSelectedVariant(variant);
    try {
      await openCodeApi.switchModel(selectedSessionID, nextRef, projectPath);
      setSessions((current) => current.map((session) => session.id === selectedSessionID
        ? { ...session, model: nextRef }
        : session));
    } catch (switchError) {
      setSelectedVariant(previous);
      setError(errorMessage(switchError));
    }
  }, [projectPath, selectedModel, selectedSessionID, selectedVariant]);

  const openModelSettings = useCallback(() => {
    setWorkspaceSection("models");
    setWorkspaceDialogOpen(true);
  }, []);

  const saveSessionTitle = useCallback(async () => {
    if (!selectedSessionID || !projectPath || !sessionTitleDraft.trim()) {
      setEditingSessionTitle(false);
      return;
    }
    try {
      const updated = await openCodeApi.renameSession(selectedSessionID, sessionTitleDraft.trim(), projectPath);
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session));
      setEditingSessionTitle(false);
    } catch (renameError) {
      setError(errorMessage(renameError));
    }
  }, [projectPath, selectedSessionID, sessionTitleDraft]);

  const deleteSession = useCallback(async (session: SessionInfo) => {
    if (!projectPath || deletingSessionID) {
      return;
    }
    setDeletingSessionID(session.id);
    setError("");
    try {
      await openCodeApi.deleteSession(session.id, projectPath);
      let nextSessions = sessions.filter((item) => item.id !== session.id);
      let nextSession = nextSessions[0];
      if (!nextSession) {
        const model = selectedModel
          ? modelRefWithAvailableVariant(selectedModel, selectedVariant)
          : undefined;
        nextSession = await openCodeApi.createSession(projectPath, model, selectedAgentID || undefined);
        nextSessions = [nextSession];
      }
      setSessions(nextSessions);
      if (session.id === selectedSessionID) {
        setSelectedSessionID(nextSession.id);
        setMessages([]);
        setPermissions([]);
        setQuestions([]);
        setTodos([]);
        setQuestionAnswers({});
        setQueuedPrompts([]);
        setEditingQueuedPrompt(undefined);
        queueDrainPaused.current = false;
        setRunStatus("ready");
        setStreamingAssistantID(undefined);
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingSessionID("");
    }
  }, [deletingSessionID, projectPath, selectedAgentID, selectedModel, selectedSessionID, selectedVariant, sessions]);

  const handleProfessionalRoleChange = useCallback((roleId: string) => {
    const next = saveWorkspacePreferences(projectPath, {
      ...preferences,
      professionalRoles: { ...preferences.professionalRoles, selectedRoleId: roleId },
    });
    setPreferences(next);
  }, [preferences, projectPath]);

  const currentPermissions = permissions.filter((request) => request.sessionID === selectedSessionID);
  const currentQuestions = questions.filter((request) => request.sessionID === selectedSessionID);
  const conversationTurns = useMemo(() => groupConversationTurns(messages), [messages]);
  const streamingAssistantState = useMemo(
    () => resolveStreamingAssistantState(messages, conversationTurns, streamingAssistantID),
    [conversationTurns, messages, streamingAssistantID]
  );
  return <ErrorBoundary label={t("s_f887d06f37")}><AssistantShell
    agents={agents}
    booting={booting}
    commands={commands}
    mcpNames={mcpNames}
    connected={connected}
    contextUsage={contextUsage}
    contexts={contexts}
    compacting={compacting}
    updateStatus={updateStatus}
    composerText={composerText}
    conversationTurns={conversationTurns}
    currentPermissions={currentPermissions}
    currentQuestions={currentQuestions}
    todos={todos}
    currentSession={currentSession}
    deletingSessionID={deletingSessionID}
    diffsByMessageID={diffsByMessageID}
    editingSessionTitle={editingSessionTitle}
    error={error}
    hasStreamingAssistantContent={streamingAssistantState.hasVisibleContent}
    isGenerating={isGenerating}
    approvalMode={approvalMode}
    onClearError={() => setError("")}
    onConfigurationChanged={() => void refreshWorkspace(false)}
    onContextsChange={setContexts}
    onCreateSession={() => void createSession()}
    onDeleteSession={(session) => void deleteSession(session)}
    onModelChange={(value) => void handleModelChange(value)}
    onApprovalModeChange={(mode) => void handleApprovalModeChange(mode)}
    onOpenModelSettings={openModelSettings}
    onPermissionReply={(request, reply) => void handlePermissionReply(request, reply)}
    onPreferencesChanged={setPreferences}
    onProfessionalRoleChange={handleProfessionalRoleChange}
    pendingApprovalSessionIDs={pendingApprovalSessionIDs}
    onPrompt={handlePrompt}
    onQuestionChange={handleQuestionChange}
    onQuestionReject={(request) => void handleQuestionReject(request)}
    onQuestionReply={(request) => void handleQuestionReply(request)}
    onQueueClear={handleQueueClear}
    onQueueDelete={handleQueueDelete}
    onQueueEdit={handleQueueEdit}
    onRefresh={handleRefresh}
    onSelectSession={(sessionID) => {
      clearPendingOpenCodeEvents();
      setSelectedSessionID(sessionID);
      setQueuedPrompts([]);
      setEditingQueuedPrompt(undefined);
      queueDrainPaused.current = false;
      setStreamingAssistantID(undefined);
      setRunStatus("ready");
      setSessionDialogOpen(false);
      setError("");
    }}
    onSessionDialogOpenChange={setSessionDialogOpen}
    onSessionTitleCancel={() => setEditingSessionTitle(false)}
    onSessionTitleChange={setSessionTitleDraft}
    onSessionTitleEdit={() => {
      setSessionTitleDraft(currentSession?.title ?? t("s_db44360cd0"));
      setEditingSessionTitle(true);
    }}
    onSessionTitleSave={() => void saveSessionTitle()}
    onSetComposerText={setComposerText}
    autoRetryNotice={autoRetry.secondsLeft > 0
      ? t("run.autoRetry", { attempt: autoRetry.attempt, max: AUTO_RETRY_MAX_ATTEMPTS, seconds: autoRetry.secondsLeft })
      : undefined}
    onStop={() => {
      // Stopping is the user's override on the automatic retry as well: cancel first so a pending
      // attempt cannot fire thirty seconds after they asked the run to stop.
      autoRetry.cancel();
      void handleStop();
    }}
    onThemeToggle={toggleTheme}
    onVariantChange={(value) => void handleVariantChange(value)}
    onWorkspaceOpenChange={setWorkspaceDialogOpen}
    preferences={preferences}
    projectPath={projectPath}
    questionAnswers={questionAnswers}
    queuedPrompts={queuedPrompts}
    refreshing={refreshing}
    resolvedModelKey={resolvedModelKey}
    runStatus={runStatus}
    selectableModels={selectableModels}
    selectedModel={selectedModel}
    selectedSessionID={selectedSessionID}
    selectedVariant={selectedVariant}
    sessionDialogOpen={sessionDialogOpen}
    sessionTitleDraft={sessionTitleDraft}
    sessions={sessions}
    skills={skills}
    streamingAssistantID={streamingAssistantState.assistantID}
    streamingAssistantParentID={streamingAssistantState.parentID}
    theme={theme}
    workspaceDialogOpen={workspaceDialogOpen}
    workspaceSection={workspaceSection}
  /></ErrorBoundary>;
}

export default App;
