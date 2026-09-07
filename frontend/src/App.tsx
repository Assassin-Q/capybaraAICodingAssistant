import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantShell } from "@/components/assistant/AssistantShell";
import { ErrorBoundary } from "@/components/assistant/ErrorBoundary";
import type { SectionID as WorkspaceSectionID } from "@/components/assistant/WorkspaceDialog";
import {
  groupConversationTurns,
  resolveStreamingAssistantState,
} from "@/components/assistant/conversationTurns";
import {
  contextToPromptInputFile,
  createAgentContext,
  splitPromptContexts,
  type PromptRequest,
} from "@/components/assistant/promptPayload";
import type { QueuedPrompt } from "@/components/assistant/PromptQueue";
import { errorMessage, modelKey } from "@/components/assistant/shared";
import { reconcileSessionMessages } from "@/components/assistant/liveEvents";
import type { ContextChip as ContextChipData } from "@/components/assistant/shared";
import { modelRefWithAvailableVariant, modelSupportsVariant } from "@/components/assistant/modelVariants";
import { enabledMcpNames, selectableConfiguredModels } from "@/lib/configApply";
import { sendDraftFirstPrompt } from "@/lib/draftFirstPrompt";
import { ideaApi, type IdeContextEvent, type PanelAction } from "@/lib/idea";
import {
  loadPersistedWorkspacePreferences,
  loadWorkspacePreferences,
  saveWorkspacePreferences,
} from "@/lib/preferences";
import { loadDiskSkills } from "@/lib/ideaIntegrations";
import { useRunLifecycle } from "@/hooks/useRunLifecycle";
import { AUTO_RETRY_MAX_ATTEMPTS } from "@/hooks/useAutoRetry";
import { useBatchedOpenCodeEvents } from "@/hooks/useBatchedOpenCodeEvents";
import { useInteractiveStatePolling } from "@/hooks/useInteractiveStatePolling";
import { useIdeaTheme } from "@/hooks/useIdeaTheme";
import { usePluginUpdateCheck } from "@/hooks/usePluginUpdateCheck";
import { useSessionDiffs } from "@/hooks/useSessionDiffs";
import { useModelVariantGuard } from "@/hooks/useModelVariantGuard";
import { useOpenCodeEventStream } from "@/hooks/useOpenCodeEventStream";
import { useApprovalInteractions } from "@/hooks/useApprovalInteractions";
import { usePromptSubmission } from "@/hooks/usePromptSubmission";
import { useSessionCompaction } from "@/hooks/useSessionCompaction";
import { useSessionTabs } from "@/hooks/useSessionTabs";
import { useSessionTabInteractions } from "@/hooks/useSessionTabInteractions";
import { useSessionComposerDrafts } from "@/hooks/useSessionComposerDrafts";
import { useSessionDraftMaterialization } from "@/hooks/useSessionDraftMaterialization";
import { useSessionPromptQueues } from "@/hooks/useSessionPromptQueues";
import { useSessionRuntime } from "@/hooks/useSessionRuntime";
import { useSessionRevert } from "@/hooks/useSessionRevert";
import { useComposerAttachments } from "@/hooks/useComposerAttachments";
import { useSessionAutoTitle } from "@/hooks/useSessionAutoTitle";
import { useSessionSelectionSync } from "@/hooks/useSessionSelectionSync";
import { useNativeSessionTabsBridge } from "@/hooks/useNativeSessionTabsBridge";
import {
  createMessageID,
  messagesBeforeRevert,
  openCodeApi,
  setOpenCodeBaseUrl,
} from "@/lib/opencode";
import type {
  AgentInfo,
  CommandInfo,
  ModelInfo,
  SessionInfo,
  SkillInfo,
} from "@/lib/opencode";
import type { WorkspacePreferences } from "@/lib/preferences";
import { restoreActiveRun } from "@/components/assistant/runRestoration";
import { getContextUsage } from "@/lib/tokenUsage";
import type { ApprovalMode } from "@/lib/approvalMode";
import { resolveLocale, setLocale, t } from "@/lib/i18n";
import { closeAssistantOverlays } from "@/lib/assistantOverlays";

/** IDEA appends this flag to its JCEF URL; standalone web previews keep the React toolbar. */
const NATIVE_TITLE_ACTIONS = new URLSearchParams(window.location.search).get("nativeTitleActions") === "1";

function App() {
  const { applyIdeaTheme, theme, toggleTheme } = useIdeaTheme();
  const updateStatus = usePluginUpdateCheck();
  const [projectPath, setProjectPath] = useState<string>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [mcpNames, setMcpNames] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedAgentID, setSelectedAgentID] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<string>();
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("ask");
  /**
   * Sessions whose run is blocked on an approval. Switching away hides the card, so without this
   * the run just looks stuck; the session list shows a 待批准 badge instead.
   */
  const [pendingApprovalSessionIDs, setPendingApprovalSessionIDs] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [gitOpenRequest, setGitOpenRequest] = useState(0);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSectionID>("connection");
  const handleWorkspaceOpenChange = useCallback((open: boolean) => {
    if (open) closeAssistantOverlays();
    if (open) setSessionDialogOpen(false);
    setWorkspaceDialogOpen(open);
  }, []);
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => loadWorkspacePreferences());
  const sessionTabSettings = NATIVE_TITLE_ACTIONS
    ? preferences.sessionTabs
    : { ...preferences.sessionTabs, enabled: false };
  const sessionTabs = useSessionTabs({ projectPath, sessions, settings: sessionTabSettings });
  const composerDrafts = useSessionComposerDrafts(
    sessionTabs.activeTabID,
    sessionTabs.tabs.map((tab) => tab.id),
  );
  const composerText = composerDrafts.text;
  const contexts = composerDrafts.contexts;
  const pendingCommand = composerDrafts.command;
  const setComposerText = composerDrafts.setText;
  const setContexts = composerDrafts.setContexts;
  const setPendingCommand = composerDrafts.setCommand;
  const selectedSessionID = sessionTabs.activeTab?.sessionID ?? "";
  const selectedSessionIDRef = useRef(selectedSessionID);
  const sessionRuntime = useSessionRuntime(selectedSessionID, selectedSessionIDRef);
  const { compacting, messages, runStatus, streamingAssistantID, todos } = sessionRuntime.current;
  const promptQueues = useSessionPromptQueues(
    selectedSessionID || sessionTabs.activeTabID,
    sessionTabs.tabs.map((tab) => tab.sessionID ?? tab.id),
  );
  const queuedPrompts = promptQueues.items;
  const editingQueuedPrompt = promptQueues.editing;
  const [editingSessionTitle, setEditingSessionTitle] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [deletingSessionID, setDeletingSessionID] = useState("");
  const [error, setError] = useState("");
  const refreshTimer = useRef<number>();
  const refreshInFlight = useRef(false);
  const seenEventIDs = useRef(new Set<string>());
  const suppressedStreamingSessionIDs = useRef(new Set<string>());
  const cancelledPromptIDs = useRef(new Set<string>());
  const panelActionHandler = useRef<(action: PanelAction) => void>(() => undefined);
  const dispatchPanelAction = useCallback((action: PanelAction) => panelActionHandler.current(action), []);
  const refreshWorkspaceRef = useRef<(includeMessages?: boolean) => Promise<void>>();
  const handledIdeaContextIDs = useRef(new Set<string>());
  const setContextsRef = useRef(setContexts);
  setContextsRef.current = setContexts;
  const directContextHandler = useRef<(context: ContextChipData) => Promise<boolean>>(() => Promise.resolve(false));
  /** Prevents the new empty session fetch from replacing its first optimistic user message. */
  const skipNextSessionLoad = useRef("");
  const drainQueueRef = useRef<(sessionID: string) => void>(() => undefined);
  const handleRunSettled = useCallback((sessionID: string) => {
    void drainQueueRef.current(sessionID);
    // OpenCode names a new conversation after its first answer, so the title only exists once the
    // run is over. Nothing else re-read the list, leaving the tab on its placeholder name.
    void refreshWorkspaceRef.current?.(false);
  }, []);

  const {
    handlePermissionReply,
    handleQuestionChange,
    handleQuestionReject,
    handleQuestionReply,
    permissions,
    questionAnswers,
    questions,
    setPermissions,
    setQuestions,
    syncQuestionAnswers,
  } = useApprovalInteractions({
    approvalMode,
    projectPath,
    runStatus,
    selectedSessionID,
    setError,
    setPendingApprovalSessionIDs,
  });

  const eventStreamRefs = useMemo(() => ({
    cancelledPromptIDs,
    refreshTimer,
    seenEventIDs,
    selectedSessionIDRef,
    suppressedStreamingSessionIDs,
  }), []);

  const lifecycleRefs = useMemo(() => ({
    cancelledPromptIDs,
    suppressedStreamingSessionIDs,
  }), []);

  const { clearStatusPolling, finishRun, handleStop, pollSessionStatus } = useRunLifecycle({
    onRunSettled: handleRunSettled,
    projectPath,
    refs: lifecycleRefs,
    runtime: sessionRuntime.controller,
    selectedSessionID,
    setError,
  });
  const { clearPendingOpenCodeEvents, enqueueOpenCodeEvent, flushOpenCodeEvents } = useBatchedOpenCodeEvents(
    sessionRuntime.controller.setMessages,
  );

  useEffect(() => {
    selectedSessionIDRef.current = selectedSessionID;
  }, [selectedSessionID]);

  const handleIdeaContext = useCallback((event: IdeContextEvent) => {
    if (handledIdeaContextIDs.current.has(event.id)) return;
    handledIdeaContextIDs.current.add(event.id);
    if (handledIdeaContextIDs.current.size > 1000) handledIdeaContextIDs.current.clear();
    const context = { ...event, addedAt: Date.now() };
    const attach = () => setContextsRef.current((current) => [
      ...current.filter((item) => item.id !== context.id),
      context,
    ]);
    if (event.action !== "explain_code" && event.action !== "analyze_log" && event.action !== "analyze_issue") {
      attach();
      return;
    }
    void directContextHandler.current(context)
      .then((accepted) => { if (!accepted) attach(); })
      .catch(attach);
  }, []);

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
  const { activeDiffs, diffsByMessageID } = useSessionDiffs({
    messages,
    projectPath,
    runStatus,
    sessionID: selectedSessionID,
  });
  const compactSession = useSessionCompaction({
    projectPath,
    runtime: sessionRuntime.controller,
    selectedModel: selectedModel
      ? modelRefWithAvailableVariant(selectedModel, selectedVariant)
      : currentSession?.model,
    selectedSessionID,
    setError,
  });
  const loadMessages = useCallback(async (sessionID: string, directory?: string, session?: SessionInfo) => {
    const nextMessages = await openCodeApi.getMessages(sessionID, directory);
    const visibleMessages = messagesBeforeRevert(nextMessages, session);
    sessionRuntime.controller.setMessages(sessionID, (current) => reconcileSessionMessages(current, visibleMessages));
    sessionRuntime.controller.setMessagesLoaded(sessionID, true);
    return visibleMessages;
  }, [sessionRuntime.controller]);
  const loadTodos = useCallback(async (sessionID: string, directory?: string) => {
    const nextTodos = await openCodeApi.getTodos(sessionID, directory);
    sessionRuntime.controller.setTodos(sessionID, nextTodos);
    return nextTodos;
  }, [sessionRuntime.controller]);
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
    setPermissions((current) => [
      ...current.filter((request) => request.sessionID !== sessionID),
      ...nextPermissions,
    ]);
    setPendingApprovalSessionIDs((current) => {
      const others = current.filter((id) => id !== sessionID);
      return nextPermissions.length > 0 ? [...others, sessionID] : others;
    });
    if (nextPermissions.length === 0) {
      void ideaApi.setPendingApproval(sessionID, false).catch(() => undefined);
    }
    setQuestions((current) => [
      ...current.filter((request) => request.sessionID !== sessionID),
      ...nextQuestions,
    ]);
    syncQuestionAnswers(nextQuestions);
    return { permissions: nextPermissions, questions: nextQuestions };
  }, [projectPath, setPermissions, setQuestions, syncQuestionAnswers]);
  useInteractiveStatePolling({
    enabled: Boolean(projectPath),
    loadPending,
    loadTodos,
    projectPath,
    runtime: sessionRuntime.controller,
    sessionIDs: useMemo(
      () => sessionTabs.tabs
        .map((tab) => tab.sessionID)
        .filter((id): id is string => Boolean(id)),
      [sessionTabs.tabs],
    ),
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
      const [nextModels, nextAgents, nextSessions, nextCommands, nextSkills, nextMcpNames] = await Promise.all([
        selectableConfiguredModels(projectPath),
        openCodeApi.listAgents(projectPath),
        openCodeApi.listSessions(projectPath),
        openCodeApi.listCommands(projectPath),
        loadDiskSkills(),
        enabledMcpNames(projectPath),
      ]);
      const sessionID = selectedSessionID && nextSessions.some((session) => session.id === selectedSessionID)
        ? selectedSessionID
        : "";
      setModels(nextModels);
      setAgents(nextAgents);
      setCommands(nextCommands);
      setMcpNames(nextMcpNames);
      setSkills(nextSkills);
      setSessions(nextSessions);
      if (sessionID && includeMessages) {
        await loadMessages(sessionID, projectPath, nextSessions.find((session) => session.id === sessionID));
      }
      if (sessionID) await loadPending(sessionID);
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

  const createSession = useCallback(() => {
    if (!projectPath) return;
    const result = sessionTabs.openDraft();
    if (result.status !== "opened") {
      setSessionDialogOpen(false);
      return;
    }
    setSessionDialogOpen(false);
    setEditingSessionTitle(false);
    setError("");
  }, [projectPath, sessionTabs]);

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

        const [health, nextModels, nextAgents, initialSessions, nextCommands, nextSkills, nextMcpNames, nextPreferences] = await Promise.all([
          openCodeApi.health(),
          selectableConfiguredModels(directory),
          openCodeApi.listAgents(directory),
          openCodeApi.listSessions(directory),
          openCodeApi.listCommands(directory),
          loadDiskSkills(),
          enabledMcpNames(directory),
          loadPersistedWorkspacePreferences(directory),
        ]);
        if (cancelled) return;

        const firstModel = nextModels
          .filter((model) => model.enabled !== false && model.status !== "deprecated")
          .sort((left, right) => left.name.localeCompare(right.name))[0];
        const defaultAgent = nextAgents.find((agent) => agent.mode === "primary" && !agent.hidden)?.id ?? "";
        const nextSessions = initialSessions;
        if (cancelled) return;

        const initialSession = nextSessions[0];
        setProjectPath(directory);
        setConnected(health.healthy);
        setModels(nextModels);
        setAgents(nextAgents);
        setCommands(nextCommands);
        setMcpNames(nextMcpNames);
        setSkills(nextSkills);
        setPreferences(nextPreferences);
        setLocale(resolveLocale(nextPreferences.language));
        setSessions(nextSessions);
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
    if (skipNextSessionLoad.current === selectedSessionID) {
      skipNextSessionLoad.current = "";
      return;
    }
    clearPendingOpenCodeEvents(selectedSessionID);
    let cancelled = false;
    const loadSelectedSession = async () => {
      try {
        const cachedRuntime = sessionRuntime.controller.get(selectedSessionID);
        const cachedMessages = cachedRuntime.messagesLoaded ? cachedRuntime.messages : undefined;
        const [nextMessages, nextSession, , nextTodos, status, nextApprovalMode] = await Promise.all([
          cachedMessages
            ? Promise.resolve(undefined)
            : openCodeApi.getMessages(selectedSessionID, projectPath),
          openCodeApi.getSession(selectedSessionID, projectPath),
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
        const runtime = sessionRuntime.controller.get(selectedSessionID);
        const visibleMessages = nextMessages
          ? messagesBeforeRevert(nextMessages, nextSession)
          : messagesBeforeRevert(cachedMessages ?? [], nextSession);
        if (nextMessages || nextSession?.revert) {
          sessionRuntime.controller.setMessages(
            selectedSessionID,
            (current) => reconcileSessionMessages(current, visibleMessages),
          );
          sessionRuntime.controller.setMessagesLoaded(selectedSessionID, true);
        }
        if (nextSession) {
          setSessions((current) => current.map((session) => session.id === nextSession.id ? nextSession : session));
        }
        sessionRuntime.controller.setTodos(selectedSessionID, nextTodos);
        setApprovalMode(nextApprovalMode);
        const busy = status.type === "busy";
        sessionRuntime.controller.setRunStatus(selectedSessionID, busy ? "streaming" : "ready");
        if (busy) {
          const currentPrompt = runtime.activePrompt;
          if (currentPrompt) {
            pollSessionStatus(selectedSessionID, currentPrompt.generation);
          } else {
            const generation = ++runtime.generation;
            const restored = restoreActiveRun(visibleMessages, selectedSessionID, generation);
            runtime.activePrompt = restored.prompt;
            runtime.assistantMessageIDs.clear();
            restored.assistantIDs.forEach((messageID) => runtime.assistantMessageIDs.add(messageID));
            runtime.hasActivity = restored.hasActivity;
            sessionRuntime.controller.setStreamingAssistantID(selectedSessionID, restored.streamingAssistantID);
            pollSessionStatus(selectedSessionID, generation);
          }
        } else {
          runtime.activePrompt = undefined;
          runtime.assistantMessageIDs.clear();
          runtime.hasActivity = false;
          sessionRuntime.controller.setStreamingAssistantID(selectedSessionID, undefined);
          clearStatusPolling(selectedSessionID);
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      }
    };
    void loadSelectedSession();
    return () => {
      cancelled = true;
    };
  }, [clearPendingOpenCodeEvents, clearStatusPolling, loadPending, pollSessionStatus, projectPath, selectedSessionID, sessionRuntime.controller]);

  useSessionAutoTitle({ messages, projectPath, session: currentSession, setSessions });

  useSessionSelectionSync({
    isDraft: sessionTabs.activeTab?.kind === "draft",
    messages,
    session: currentSession,
    setSelectedAgentID,
    setSelectedModelKey,
    setSelectedVariant,
  });

  useNativeSessionTabsBridge({
    activeTabID: sessionTabs.activeTabID,
    enabled: NATIVE_TITLE_ACTIONS,
    multiTab: sessionTabSettings.enabled,
    sessions,
    tabs: sessionTabs.tabs,
  });

  useOpenCodeEventStream({
    applyIdeaTheme,
    onIdeaContext: handleIdeaContext,
    onPanelAction: dispatchPanelAction,
    onPendingApprovals: setPendingApprovalSessionIDs,
    enqueueOpenCodeEvent,
    finishRun,
    flushOpenCodeEvents,
    loadPending,
    loadTodos,
    projectPath,
    refs: eventStreamRefs,
    runtime: sessionRuntime.controller,
    scheduleRefresh,
    setConnected,
    setContexts,
    setError,
    setQuestions,
    syncQuestionAnswers,
  });

  const {
    autoRetry,
    droppedAttachments,
    sendPromptNow,
    visionBusy,
  } = usePromptSubmission({
    agents,
    commands,
    ensureSelectedModelVariant,
    mcpNames,
    messages,
    pollSessionStatus,
    preferences,
    projectPath,
    refs: lifecycleRefs,
    runtime: sessionRuntime.controller,
    runStatus,
    selectedAgentID,
    selectedModel,
    selectedSessionID,
    setError,
    skills,
  });

  const materializeDraft = useSessionDraftMaterialization({
    approvalMode,
    projectPath,
    selectedAgentID,
    selectedModel,
    selectedSessionID,
    selectedVariant,
    sessionTabs,
    setError,
    setSessions,
    selectedSessionIDRef,
    skipNextSessionLoad,
    suppressedStreamingSessionIDs,
  });

  const { attachAgentContext, attachMcpContext, attachSkillContext } = useComposerAttachments(setContexts);

  const handlePrompt = useCallback(async ({ text, files }: PromptRequest) => {
    if (!projectPath) return false;
    const typedText = text.trim();
    if (!typedText && !pendingCommand && contexts.length === 0 && files.length === 0) return false;
    const withCommand = pendingCommand ? `/${pendingCommand} ${typedText}`.trim() : typedText;
    const commandText = withCommand.startsWith("$") ? `/${withCommand.slice(1)}` : withCommand;
    setPendingCommand(undefined);
    const { files: contextFiles, mcpNames: requestedMcpNames, subagentIDs } = splitPromptContexts(contexts);
    const request: PromptRequest = {
      files: [...(files.length > 0 ? files : editingQueuedPrompt?.files ?? []), ...contextFiles],
      mcpNames: [...new Set([...(editingQueuedPrompt?.mcpNames ?? []), ...requestedMcpNames])],
      subagentIDs: [...new Set([...(editingQueuedPrompt?.subagentIDs ?? []), ...subagentIDs])],
      text: commandText,
    };
    promptQueues.setEditing(undefined);
    if (selectedSessionID) sessionRuntime.controller.setQueuePaused(selectedSessionID, false);
    setContexts([]);
    if (selectedSessionID && (isGenerating || sessionRuntime.controller.get(selectedSessionID).activePrompt)) {
      const queueID = selectedSessionID;
      promptQueues.setItemsFor(queueID, (current) => [...current, {
        ...request,
        execution: { agentID: selectedAgentID, model: selectedModel, variant: selectedVariant },
        id: `queue_${createMessageID()}`,
      }]);
      return true;
    }
    if (selectedSessionID) return sendPromptNow(request, selectedSessionID);
    return sendDraftFirstPrompt({
      materialize: materializeDraft,
      send: (sessionID) => sendPromptNow(request, sessionID),
      setMessages: sessionRuntime.controller.setMessages,
      text: request.text,
    });
  }, [contexts, editingQueuedPrompt, isGenerating, materializeDraft, pendingCommand, projectPath, promptQueues, selectedSessionID, sendPromptNow, sessionRuntime.controller, setContexts, setPendingCommand]);

  directContextHandler.current = (context) => handlePrompt({
    files: [contextToPromptInputFile(context, 0)],
    text: context.action === "explain_code" ? t("s_625cb72e0e")
      : context.action === "analyze_issue" ? t("console.analyzeIssuePrompt") : t("console.analyzeLogPrompt"),
  });

  const drainSessionQueue = useCallback(async (sessionID: string) => {
    if (!projectPath || !sessionID || promptQueues.isDraining(sessionID)) return;
    const runtime = sessionRuntime.controller.get(sessionID);
    if (runtime.activePrompt || runtime.queuePaused || runtime.runStatus === "submitted" || runtime.runStatus === "streaming") return;
    const next = promptQueues.getItems(sessionID)[0];
    if (!next) return;
    promptQueues.setDraining(sessionID, true);
    promptQueues.setItemsFor(sessionID, (current) => current.filter((item) => item.id !== next.id));
    try {
      await sendPromptNow(next, sessionID);
    } catch {
      // The failed item is removed from the queue and the visible session owns the error state.
    } finally {
      promptQueues.setDraining(sessionID, false);
    }
  }, [projectPath, promptQueues, sendPromptNow, sessionRuntime.controller]);

  drainQueueRef.current = drainSessionQueue;

  useEffect(() => {
    if (!selectedSessionID) return;
    void drainSessionQueue(selectedSessionID);
  }, [drainSessionQueue, selectedSessionID]);

  const handleQueueEdit = useCallback((item: QueuedPrompt) => {
    promptQueues.setItems((current) => current.filter((queued) => queued.id !== item.id));
    promptQueues.setEditing(item);
    setContexts((current) => [
      ...current.filter((context) => context.kind !== "agent"),
      ...(item.subagentIDs ?? []).map(createAgentContext),
    ]);
    setComposerText(item.text);
  }, [promptQueues, setComposerText, setContexts]);

  const handleQueueDelete = useCallback((id: string) => {
    promptQueues.setItems((current) => current.filter((item) => item.id !== id));
  }, [promptQueues]);

  const handleQueueClear = useCallback(() => {
    promptQueues.setItems([]);
  }, [promptQueues]);

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
          if (!cancelled) sessionRuntime.controller.setTodos(selectedSessionID, next);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectPath, runStatus, selectedSessionID, sessionRuntime.controller]);

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

  panelActionHandler.current = (action) => {
    if (action === "new-session") createSession();
    else if (action === "history") setSessionDialogOpen(true);
    else if (action.startsWith("select-session-tab:")) {
      sessionTabInteractions.selectTab(action.slice("select-session-tab:".length));
    }
    else if (action.startsWith("close-session-tab:")) {
      sessionTabInteractions.closeTab(action.slice("close-session-tab:".length));
    }
    else if (action === "close-all-session-tabs") {
      sessionTabs.closeTabs(sessionTabs.tabs.map((tab) => tab.id));
    }
    else if (action.startsWith("close-other-session-tabs:")) {
      const keep = action.slice("close-other-session-tabs:".length);
      sessionTabs.closeTabs(sessionTabs.tabs.filter((tab) => tab.id !== keep).map((tab) => tab.id));
    }
    else if (action.startsWith("close-left-session-tabs:")) {
      const pivot = sessionTabs.tabs.findIndex((tab) => tab.id === action.slice("close-left-session-tabs:".length));
      if (pivot > 0) sessionTabs.closeTabs(sessionTabs.tabs.slice(0, pivot).map((tab) => tab.id));
    }
    else if (action.startsWith("close-right-session-tabs:")) {
      const pivot = sessionTabs.tabs.findIndex((tab) => tab.id === action.slice("close-right-session-tabs:".length));
      if (pivot >= 0) sessionTabs.closeTabs(sessionTabs.tabs.slice(pivot + 1).map((tab) => tab.id));
    }
    else if (action.startsWith("rename-session-tab:")) {
      const tabID = action.slice("rename-session-tab:".length);
      sessionTabInteractions.selectTab(tabID);
      const tab = sessionTabs.tabs.find((item) => item.id === tabID);
      if (tab) {
        setSessionTitleDraft(
          tab.sessionID
            ? sessions.find((session) => session.id === tab.sessionID)?.title ?? tab.title ?? t("tabs.newConversation")
            : tab.title ?? t("tabs.newConversation"),
        );
        setEditingSessionTitle(true);
      }
    }
    else if (action === "settings") handleWorkspaceOpenChange(true);
    else if (action === "git") setGitOpenRequest((request) => request + 1);
    else if (action === "theme") toggleTheme();
    else if (action === "refresh") handleRefresh();
  };

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
    if (value === resolvedModelKey) return;
    const nextModel = selectableModels.find((model) => modelKey(model) === value);
    if (!nextModel) return;
    const previousKey = selectedModelKey;
    const previousVariant = selectedVariant;
    const nextRef = { id: nextModel.id, providerID: nextModel.providerID };
    setSelectedModelKey(value);
    setSelectedVariant(undefined);
    if (!selectedSessionID) return;
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
    if (!selectedModel || variant === selectedVariant) return;
    if (!modelSupportsVariant(selectedModel, variant)) return setError(t("s_fbae765f6e", { p0: variant }));
    const previous = selectedVariant;
    const nextRef = modelRefWithAvailableVariant(selectedModel, variant);
    setSelectedVariant(variant);
    if (!selectedSessionID) return;
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
    handleWorkspaceOpenChange(true);
  }, [handleWorkspaceOpenChange]);

  const sessionTabInteractions = useSessionTabInteractions({
    projectPath,
    selectedSessionIDRef,
    sessionTabs,
    setEditingSessionTitle,
    setError,
    setSessionDialogOpen,
    setSessions,
  });

  const deleteSession = useCallback(async (session: SessionInfo) => {
    if (!projectPath || deletingSessionID) {
      return;
    }
    setDeletingSessionID(session.id);
    setError("");
    try {
      await openCodeApi.deleteSession(session.id, projectPath);
      void ideaApi.forgetApprovalMode(session.id).catch(() => undefined);
       const nextSessions = sessions.filter((item) => item.id !== session.id);
       setSessions(nextSessions);
       const wasSelected = session.id === selectedSessionID;
       const nextTab = sessionTabs.removeSession(session.id);
       if (wasSelected) {
         selectedSessionIDRef.current = nextTab.sessionID ?? "";
         setPermissions((current) => current.filter((request) => request.sessionID !== session.id));
         setQuestions((current) => current.filter((request) => request.sessionID !== session.id));
       }
       sessionRuntime.controller.clear(session.id);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingSessionID("");
    }
  }, [deletingSessionID, projectPath, selectedSessionID, sessionRuntime.controller, sessionTabs, sessions, setPermissions, setQuestions]);

  const revertSession = useSessionRevert({
    projectPath,
    runtime: sessionRuntime.controller,
    selectedSessionID,
    setError,
    setSessions,
  });
  const handleProfessionalRoleChange = useCallback((roleId: string) => {
    const next = saveWorkspacePreferences(projectPath, {
      ...preferences,
      professionalRoles: { ...preferences.professionalRoles, selectedRoleId: roleId },
    });
    setPreferences(next);
  }, [preferences, projectPath]);
  const currentPermissions = permissions.filter((request) => request.sessionID === selectedSessionID);
  const currentQuestions = questions.filter((request) => request.sessionID === selectedSessionID);
  const conversationTurns = useMemo(() => {
    const turns = groupConversationTurns(messages);
    if (Object.keys(droppedAttachments).length === 0) return turns;
    // Display only: the dropped files are added back to the bubble, never to what gets sent.
    return turns.map((turn) => {
      if (turn.type !== "user") return turn;
      const extra = droppedAttachments[turn.id];
      return extra ? { ...turn, files: [...(turn.files ?? []), ...extra] } : turn;
    });
  }, [droppedAttachments, messages]);
  const streamingAssistantState = useMemo(
    () => resolveStreamingAssistantState(messages, conversationTurns, streamingAssistantID),
    [conversationTurns, messages, streamingAssistantID]
  );
  return <ErrorBoundary label={t("s_f887d06f37")}><AssistantShell
    activeDiffs={activeDiffs}
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
    gitOpenRequest={gitOpenRequest}
    hasStreamingAssistantContent={streamingAssistantState.hasVisibleContent}
    isGenerating={isGenerating}
    nativeTitleActions={NATIVE_TITLE_ACTIONS}
    approvalMode={approvalMode}
    onClearError={() => setError("")}
    onCompact={() => { void compactSession(); }}
    onConfigurationChanged={() => void refreshWorkspace(false)}
    onContextsChange={setContexts}
    onCreateSession={createSession}
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
    onRevertSession={revertSession}
    onQueueClear={handleQueueClear}
    onQueueDelete={handleQueueDelete}
    onQueueEdit={handleQueueEdit}
    onRefresh={handleRefresh}
    onSelectSession={sessionTabInteractions.openSession}
    onCloseSessionTabAndOpenPending={sessionTabInteractions.closeTabAndOpenPending}
    onCancelPendingSessionTab={sessionTabs.cancelPendingOpen}
    onSessionDialogOpenChange={setSessionDialogOpen}
    onSessionTitleCancel={() => setEditingSessionTitle(false)}
    onSessionTitleChange={setSessionTitleDraft}
    onSessionTitleSave={() => void sessionTabInteractions.saveTitle(sessionTitleDraft)}
    onSetComposerText={setComposerText}
    onAttachSkill={attachSkillContext}
    onAttachAgent={attachAgentContext}
    onAttachMcp={attachMcpContext}
    onCancelAutoRetry={autoRetry.secondsLeft > 0 ? autoRetry.cancel : undefined}
    onClearCommand={() => setPendingCommand(undefined)}
    onSelectCommand={setPendingCommand}
    pendingCommand={pendingCommand}
    autoRetryNotice={visionBusy
      ? t("vision.busy")
      : autoRetry.secondsLeft > 0
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
    onWorkspaceOpenChange={handleWorkspaceOpenChange}
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
    activeSessionTabID={sessionTabs.activeTabID}
    sessionTabs={sessionTabs.tabs}
    pendingSessionTabOpen={sessionTabs.pendingOpen}
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
