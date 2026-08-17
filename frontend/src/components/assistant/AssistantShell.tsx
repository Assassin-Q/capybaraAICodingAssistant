import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronLeft, CircleAlert, History, MessageSquarePlus, Moon, RefreshCw, Settings2, Sun, TerminalSquare, X } from "lucide-react";
import { BorderBeam } from "border-beam";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputAttachmentButton,
  PromptInputAttachments,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AssistantMessage, AssistantThinking } from "@/components/assistant/AssistantMessage";
import { ContextChip } from "@/components/assistant/ContextChip";
import { ConversationDivider } from "@/components/assistant/ConversationDivider";
import { ErrorBoundary } from "@/components/assistant/ErrorBoundary";
import { GitStatusButton } from "@/components/assistant/GitStatusButton";
import { ContextUsageIndicator } from "@/components/assistant/TokenUsage";
import type { ConversationTurn } from "@/components/assistant/conversationTurns";
import {
  ModelPicker,
  VariantPicker,
} from "@/components/assistant/ModelPicker";
import { ApprovalModePicker } from "@/components/assistant/ApprovalModePicker";
import {
  annotationsAsPrompt,
  BrowserAnnotationChip,
  captureBrowserScreenshot,
  useBrowserAnnotations,
} from "@/components/assistant/BrowserAnnotations";
import { ProfessionalRolePicker } from "@/components/assistant/ProfessionalRolePicker";
import { QuickStartCards } from "@/components/assistant/QuickStartCards";
import { modelHasDefaultVariant, modelVariantIDs } from "@/components/assistant/modelVariants";
import { PermissionInline } from "@/components/assistant/PermissionInline";
import { PromptQueue, type QueuedPrompt } from "@/components/assistant/PromptQueue";
import { QuestionInline } from "@/components/assistant/QuestionInline";
import { SessionDialog } from "@/components/assistant/SessionDialog";
import { sessionTabTitle } from "@/components/assistant/SessionTabs";
import { SlashCommandMenu } from "@/components/assistant/SlashCommandMenu";
import { TodoPanel } from "@/components/assistant/TodoPanel";
import { UserMessage } from "@/components/assistant/UserMessage";
import { VirtualConversation } from "@/components/assistant/VirtualConversation";
import { errorMessage } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData, RunStatus } from "@/components/assistant/shared";
import { WorkspaceDialog, type SectionID as WorkspaceSectionID } from "@/components/assistant/WorkspaceDialog";
import { ideaFileSearchApi } from "@/lib/ideaIntegrations";
import { getOpenCodeBaseUrl } from "@/lib/opencode";
import type {
  AgentInfo,
  AssistantMessage as AssistantMessageData,
  CommandInfo,
  ModelInfo,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  SessionInfo,
  SessionFileDiff,
  SkillInfo,
} from "@/lib/opencode";
import type { PromptRequest } from "@/components/assistant/promptPayload";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { ContextUsageInfo } from "@/lib/tokenUsage";
import type { ApprovalMode } from "@/lib/approvalMode";
import type { UpdateStatus } from "@/lib/idea";
import type { IdeaTheme } from "@/hooks/useIdeaTheme";
import type { PendingSessionTabOpen, SessionTab } from "@/hooks/useSessionTabs";
import { t } from "@/lib/i18n";
import { closeAssistantOverlays, useAssistantOverlayDismiss } from "@/lib/assistantOverlays";

export interface AssistantShellProps {
  agents: AgentInfo[];
  booting: boolean;
  commands: CommandInfo[];
  connected: boolean | null;
  contextUsage?: ContextUsageInfo;
  contexts: ContextChipData[];
  /** Rendered above the composer while an automatic retry is pending. */
  autoRetryNotice?: string;
  /** Cancels the pending retry. Present only while one is scheduled. */
  onCancelAutoRetry?: () => void;
  /** Adds an OpenCode subagent as structured prompt context. */
  onAttachAgent: (agentID: string) => void;
  /** Pins an MCP server above the composer. */
  onAttachMcp: (name: string) => void;
  /** Adds a skill reference chip; skills sit outside the project so they cannot be attached as files. */
  onAttachSkill: (name: string, location: string) => void;
  /** The command pinned above the composer, applied when the message is sent. */
  pendingCommand?: string;
  onSelectCommand: (name: string) => void;
  onClearCommand: () => void;
  composerText: string;
  conversationTurns: ConversationTurn[];
  currentPermissions: PermissionRequest[];
  pendingApprovalSessionIDs: string[];
  currentQuestions: QuestionRequest[];
  todos: import("@/lib/opencode").TodoInfo[];
  currentSession?: SessionInfo;
  deletingSessionID: string;
  activeDiffs: SessionFileDiff[];
  diffsByMessageID: Record<string, SessionFileDiff[]>;
  editingSessionTitle: boolean;
  error: string;
  gitOpenRequest: number;
  isGenerating: boolean;
  hasStreamingAssistantContent: boolean;
  mcpNames: string[];
  nativeTitleActions: boolean;
  approvalMode: ApprovalMode;
  /** True while OpenCode is compacting this session, whether we asked for it or it decided to. */
  compacting: boolean;
  /** Undefined until the release check answers; drives the amber state on the header dot. */
  updateStatus?: UpdateStatus;
  preferences: WorkspacePreferences;
  projectPath?: string;
  questionAnswers: Record<string, string[][]>;
  queuedPrompts: QueuedPrompt[];
  refreshing: boolean;
  resolvedModelKey: string;
  runStatus: RunStatus;
  selectableModels: ModelInfo[];
  selectedModel?: ModelInfo;
  selectedSessionID: string;
  activeSessionTabID: string;
  sessionTabs: SessionTab[];
  pendingSessionTabOpen?: PendingSessionTabOpen;
  selectedVariant?: string;
  sessionDialogOpen: boolean;
  sessionTitleDraft: string;
  sessions: SessionInfo[];
  skills: SkillInfo[];
  streamingAssistantID?: string;
  streamingAssistantParentID?: string;
  theme: IdeaTheme;
  workspaceDialogOpen: boolean;
  workspaceSection: WorkspaceSectionID;
  onClearError: () => void;
  onCompact: () => void;
  onConfigurationChanged: () => void;
  onContextsChange: (contexts: ContextChipData[]) => void;
  onCreateSession: () => void;
  onDeleteSession: (session: SessionInfo) => void;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  onModelChange: (value: string) => void;
  onOpenModelSettings: () => void;
  onPermissionReply: (request: PermissionRequest, reply: PermissionReply) => void;
  onPreferencesChanged: (preferences: WorkspacePreferences) => void;
  onProfessionalRoleChange: (roleId: string) => void;
  onPrompt: (message: PromptRequest) => Promise<boolean>;
  onQuestionChange: (request: QuestionRequest, index: number, values: string[]) => void;
  onQuestionReject: (request: QuestionRequest) => void;
  onQuestionReply: (request: QuestionRequest) => void;
  onQueueClear: () => void;
  onQueueDelete: (id: string) => void;
  onQueueEdit: (item: QueuedPrompt) => void;
  onRefresh: () => void;
  onSelectSession: (sessionID: string) => void;
  onCloseSessionTabAndOpenPending: (tabID: string) => void;
  onCancelPendingSessionTab: () => void;
  onSessionDialogOpenChange: (open: boolean) => void;
  onSessionTitleChange: (value: string) => void;
  onSessionTitleSave: () => void;
  onSessionTitleCancel: () => void;
  onSetComposerText: (value: string) => void;
  onStop: () => void;
  onThemeToggle: () => void;
  onVariantChange: (value: string | undefined) => void;
  onWorkspaceOpenChange: (open: boolean) => void;
}

/**
 * Every session-level event gets a label, because dropping one means the transcript silently
 * disagrees with what happened — compaction in particular rewrites the history, and OpenCode runs
 * it on its own when the context fills up. A session that shrinks with no explanation looks broken.
 */
/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const sessionEventLabels = (): Record<Exclude<ConversationTurn["type"], "user" | "assistant">, string> => ({
  "agent-switched": t("s_252776162d"),
  compaction: t("s_062189d7b1"),
  "model-switched": t("s_ead4831a76"),
  shell: t("s_cf0b5df0dd"),
  synthetic: t("s_78bf71686a"),
  system: t("s_f581d83fe2"),
});

/** The event detail worth putting on the divider, when the payload carries one. */
const sessionEventDetail = (turn: ConversationTurn): string | undefined => {
  if (turn.type === "user" || turn.type === "assistant") return undefined;
  if (turn.type === "agent-switched") return turn.agent;
  if (turn.type === "model-switched") return turn.model?.id;
  // The summary itself arrives as the following assistant message, so there is nothing to repeat
  // here — only whether this was OpenCode's own doing, which is the part a user cannot infer.
  if (turn.type === "compaction") return turn.auto ? t("s_ab8b04b5db") : undefined;
  return turn.text?.trim().replace(/\s+/g, " ") || undefined;
};

/** Characters that open the composer picker. Kept beside the placeholder hint that advertises them. */
const TRIGGER_CHARACTERS = ["/", "@", "$"];
/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const composerHint = () => t("s_1484fbdcaf");

function StatusDot({ connected, update }: { connected: boolean | null; update?: UpdateStatus }) {
  // An available release outranks the plain connected state: the dot is the only always-visible
  // surface, so it is where a pending update has to show up.
  if (connected === true && update?.hasUpdate) {
    return <span aria-label={t("update.tooltip")} className="size-2 shrink-0 rounded-full bg-amber-500" title={t("update.available", { p0: update.latestVersion })} />;
  }
  const color = connected === true
    ? "bg-emerald-500"
    : connected === false
      ? "bg-red-500"
      : "bg-muted-foreground";
  const label = connected === true ? t("s_aeeba1b5f4") : connected === false ? t("s_4ca5bf9106") : t("s_5c79c82dde");
  return <span aria-label={label} className={`size-2 shrink-0 rounded-full ${color}`} title={label} />;
}

export function AssistantShell(props: AssistantShellProps) {
  const [composerHovered, setComposerHovered] = useState(false);
  /** One-line feedback for composer actions that do not produce a message of their own. */
  const [composerNotice, setComposerNotice] = useState("");
  /** Undefined while the file picker is closed; a string is the term being searched. */
  const [fileSearch, setFileSearch] = useState<string>();
  const [dismissedTriggerQuery, setDismissedTriggerQuery] = useState<string>();
  const { annotations: browserAnnotations, clear: clearBrowserAnnotations } = useBrowserAnnotations();

  useAssistantOverlayDismiss(() => {
    setFileSearch(undefined);
    setDismissedTriggerQuery(props.composerText);
  });

  useEffect(() => {
    if (dismissedTriggerQuery !== undefined && dismissedTriggerQuery !== props.composerText) {
      setDismissedTriggerQuery(undefined);
    }
  }, [dismissedTriggerQuery, props.composerText]);

  /**
   * Picking a file goes through the plugin, not the browser, so it lands as the same context
   * chip the editor's right-click action produces — one channel, one set of truncation rules.
   */
  const attachProjectFile = (path: string) => {
    void ideaFileSearchApi.attach(path).then((result) => {
      if (!result.success && result.message) setComposerNotice(result.message);
    }).catch((error: unknown) => setComposerNotice(errorMessage(error)));
  };

  /**
   * Browser annotations ride along with the next prompt and are cleared once it is accepted —
   * a chip that only displayed a count would tell the model nothing.
   */
  const submitPrompt = async (message: PromptRequest): Promise<boolean> => {
    const annotationText = annotationsAsPrompt(browserAnnotations);
    if (!annotationText) return onPrompt(message);
    // DeepSeek V4 Flash and other text-only models answer an image attachment with
    // "Model only supports text input; received unsupported content type 'image_url'" and the
    // whole turn 400s — so the crops only ship when the selected model declares image input.
    const acceptsImages = Boolean(selectedModel?.capabilities?.input?.image);
    const shots = acceptsImages
      ? (await Promise.all(browserAnnotations.map((annotation, index) => captureBrowserScreenshot(
        annotation.rect
          ? {
            height: annotation.rect.height,
            width: annotation.rect.width,
            x: annotation.rect.left,
            y: annotation.rect.top,
          }
          : undefined,
        `annotation-${index + 1}`
      )))).filter((file): file is File => Boolean(file))
      : [];
    const accepted = await onPrompt({
      files: [
        ...message.files,
        ...shots.map((file, index) => ({
          file,
          filename: file.name,
          id: `browser-shot-${index}-${file.lastModified}`,
          mediaType: file.type,
          type: "file" as const,
          url: URL.createObjectURL(file),
        })),
      ],
      subagentIDs: message.subagentIDs,
      text: [message.text, annotationText].filter(Boolean).join("\n\n"),
    });
    if (accepted) clearBrowserAnnotations();
    return accepted;
  };

  // Bumped when a run starts so the conversation pins to the bottom and the
  // thinking placeholder is fully visible.
  const [pinToBottom, setPinToBottom] = useState(0);
  const previousRunStatus = useRef(props.runStatus);
  useEffect(() => {
    if (previousRunStatus.current !== "submitted" && props.runStatus === "submitted") {
      setPinToBottom((current) => current + 1);
    }
    previousRunStatus.current = props.runStatus;
  }, [props.runStatus]);
  const {
    agents,
    booting,
    commands,
    connected,
    contextUsage,
    contexts,
    compacting,
    updateStatus,
    autoRetryNotice,
    onCancelAutoRetry,
    onAttachAgent,
    onAttachMcp,
    onAttachSkill,
    pendingCommand,
    onSelectCommand,
    onClearCommand,
    composerText,
    conversationTurns,
    currentPermissions,
    pendingApprovalSessionIDs,
    currentQuestions,
    todos,
    currentSession,
    deletingSessionID,
    activeDiffs,
    diffsByMessageID,
    editingSessionTitle,
    error,
    gitOpenRequest,
    hasStreamingAssistantContent,
    isGenerating,
    mcpNames,
    nativeTitleActions,
    approvalMode,
    preferences,
    projectPath,
    questionAnswers,
    queuedPrompts,
    refreshing,
    resolvedModelKey,
    runStatus,
    selectableModels,
    selectedModel,
    selectedSessionID,
    activeSessionTabID,
    sessionTabs,
    pendingSessionTabOpen,
    selectedVariant,
    sessionDialogOpen,
    sessionTitleDraft,
    sessions,
    skills,
    streamingAssistantID,
    streamingAssistantParentID,
    theme,
    workspaceDialogOpen,
    workspaceSection,
    onClearError,
    onCompact,
    onConfigurationChanged,
    onContextsChange,
    onCreateSession,
    onDeleteSession,
    onApprovalModeChange,
    onModelChange,
    onOpenModelSettings,
    onPermissionReply,
    onPreferencesChanged,
    onProfessionalRoleChange,
    onPrompt,
    onQuestionChange,
    onQuestionReject,
    onQuestionReply,
    onQueueClear,
    onQueueDelete,
    onQueueEdit,
    onRefresh,
    onSelectSession,
    onCloseSessionTabAndOpenPending,
    onCancelPendingSessionTab,
    onSessionDialogOpenChange,
    onSessionTitleChange,
    onSessionTitleSave,
    onSessionTitleCancel,
    onSetComposerText,
    onStop,
    onThemeToggle,
    onVariantChange,
    onWorkspaceOpenChange,
  } = props;
  const composerBeamStrength = isGenerating ? 1 : composerHovered ? 0.75 : 0.5;

  /**
   * Where the current round begins.
   *
   * A round is one user request through to its answer, and compaction splits that into several
   * assistant turns. Marking only the last turn as active therefore let every earlier turn of a
   * still-running round render its "edited N files" and token summaries — closing statements for
   * work that had not finished. Everything after the last user message belongs to the round in
   * progress.
   */
  const lastUserTurnIndex = conversationTurns.reduce(
    (found, message, index) => (message.type === "user" ? index : found),
    -1
  );

  const renderedTurns = useMemo(() => {
    let latestUserMessageID: string | undefined;
    // Each turn gets its own boundary: one malformed message (a bad attachment, an unexpected
    // part shape) must not take the whole conversation down with it.
    return conversationTurns.flatMap((message, index) => {
      if (message.type === "user") {
        latestUserMessageID = message.id;
        return [
          <ErrorBoundary key={message.id} label={t("s_146671b0a1")}>
            <UserMessage message={message} />
          </ErrorBoundary>,
        ];
      }
      if (message.type === "assistant") {
        const diffMessageID = message.parentID ?? latestUserMessageID ?? message.id;
        const messageIsStreaming = isGenerating && (
          message.sourceIDs.includes(streamingAssistantID ?? "")
          || Boolean(streamingAssistantParentID && message.parentID === streamingAssistantParentID)
        );
        return [
          <ErrorBoundary key={message.id} label={t("s_e37a7fa521")}>
            <AssistantMessage
              diffs={diffsByMessageID[diffMessageID]}
              isStreaming={messageIsStreaming}
              runActive={isGenerating && index > lastUserTurnIndex}
              message={message as AssistantMessageData}
              onOpenSession={onSelectSession}
            />
          </ErrorBoundary>,
        ];
      }
      const label = sessionEventLabels()[message.type];
      const detail = sessionEventDetail(message);
      return [
        <ConversationDivider
          key={message.id}
          label={detail ? `${label} · ${detail.slice(0, 80)}` : label}
        />,
      ];
    });
  }, [conversationTurns, diffsByMessageID, isGenerating, lastUserTurnIndex, onSelectSession, streamingAssistantID, streamingAssistantParentID]);

  const lastTurn = conversationTurns[conversationTurns.length - 1];
  /**
   * Whether anything is *visibly* in progress at the tail of the newest turn.
   *
   * A run alternates between visible work (a tool card marked 执行中, streaming text or reasoning)
   * and gaps where the model has finished one step and not started the next. During a gap nothing
   * on screen moves, so without a placeholder the conversation looks finished when it is not.
   */
  const tailPart = lastTurn?.type === "assistant"
    ? lastTurn.content[lastTurn.content.length - 1]
    : undefined;
  const tailIsBusy = tailPart?.type === "tool"
    ? tailPart.state.status === "pending" || tailPart.state.status === "running"
    // Only reasoning carries completion timing; a text part is still arriving whenever the
    // assistant message itself is the one being streamed.
    : tailPart?.type === "reasoning"
      ? tailPart.time?.completed === undefined
      : tailPart?.type === "text"
        ? hasStreamingAssistantContent
        : false;

  // Passed as `undefined` when there is nothing pending so the conversation can
  // fall back to its empty state instead of rendering an empty footer block.
  const footerNodes = [
    compacting ? <ConversationDivider busy key="compacting" label={t("s_9b8d3e7c4d")} /> : null,
    // Between two assistant messages OpenCode reports "generating" with nothing streaming yet.
    // Showing the placeholder on that gap left a spinner parked under a finished turn, so it only
    // appears while the newest turn genuinely has no content of its own.
    isGenerating && !compacting && !tailIsBusy ? <AssistantThinking key="thinking" /> : null,
    currentPermissions[0]
      ? <PermissionInline key={currentPermissions[0].id} onReply={(reply) => onPermissionReply(currentPermissions[0], reply)} request={currentPermissions[0]} />
      : null,
    ...currentQuestions.map((request) => (
      <QuestionInline
        answers={questionAnswers[request.id] ?? request.questions.map(() => [])}
        key={request.id}
        onChange={(index, values) => onQuestionChange(request, index, values)}
        onReject={() => onQuestionReject(request)}
        onReply={() => onQuestionReply(request)}
        request={request}
      />
    )),
  ].filter((node) => node !== null);

  return (
    <TooltipProvider>
      <div className="assistant-shell flex h-full min-h-[480px] min-w-[640px] w-full flex-col bg-background text-foreground">
        {!nativeTitleActions && <header className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          <Button aria-label={t("s_378d943e1d")} className="size-8 shrink-0" onClick={() => onSessionDialogOpenChange(true)} size="icon" title={t("s_b7e8848103")} type="button" variant="ghost">
            <History className="size-3.5" />
          </Button>
          <div className="min-w-0 flex-1" />
          <StatusDot connected={connected} update={updateStatus} />
          <GitStatusButton model={selectedModel} projectPath={projectPath} variant={selectedVariant} />
          <Button aria-label={t("s_3da224c43d")} className="size-8 shrink-0" onClick={onCreateSession} size="icon" title={t("s_3da224c43d")} type="button" variant="ghost"><MessageSquarePlus className="size-3.5" /></Button>
          <Button aria-label={theme === "dark" ? t("s_2b4ef16e71") : t("s_b54f498c7c")} aria-pressed={theme === "dark"} className="size-8 shrink-0" onClick={onThemeToggle} size="icon" title={theme === "dark" ? t("s_2b4ef16e71") : t("s_b54f498c7c")} type="button" variant="ghost">
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
          <Button aria-label={t("s_abc65f3093")} className="size-8 shrink-0" onClick={() => { closeAssistantOverlays(); onWorkspaceOpenChange(true); }} size="icon" title={t("s_52e823f821")} type="button" variant="ghost"><Settings2 className="size-3.5" /></Button>
          <Button aria-label={t("s_269a8a2642")} className="size-8 shrink-0" disabled={refreshing} onClick={onRefresh} size="icon" title={t("s_269a8a2642")} type="button" variant="ghost"><RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} /></Button>
        </header>}
        {nativeTitleActions && (
          <GitStatusButton
            model={selectedModel}
            nativeTrigger
            openRequest={gitOpenRequest}
            projectPath={projectPath}
            variant={selectedVariant}
          />
        )}

        {error && <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span><Button aria-label={t("s_7cc3cc83d6")} className="size-5 shrink-0" onClick={onClearError} size="icon" type="button" variant="ghost"><X className="size-3" /></Button></div>}

        {/* A subagent session is not in the session list, so this bar is the only way back out. */}
        {currentSession?.parentID && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <Button
              className="h-6 gap-1 px-1.5 text-xs font-normal"
              onClick={() => onSelectSession(currentSession.parentID as string)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeft className="size-3.5" />
              {t("s_83f1d1adf1")}
            </Button>
            <span className="min-w-0 flex-1 truncate">{t("s_cea18f5d12")}</span>
          </div>
        )}

        <BorderBeam
          active={!booting && isGenerating}
          className="flex min-h-0 flex-1 overflow-hidden"
          colorVariant="sunset"
          duration={2.4}
          size="line"
          strength={0.78}
          theme={theme}
        >
          <VirtualConversation
              conversationKey={selectedSessionID}
            className="h-full w-full"
            empty={booting
              ? <ConversationEmptyState description={t("s_918003d07c")} icon={<RefreshCw className="size-5 animate-spin" />} title={t("s_02625a8ef2")} />
              : (
                // Children replace the built-in title block rather than adding to it, so the
                // heading is rebuilt here alongside the openers.
                <ConversationEmptyState>
                  <div className="text-muted-foreground"><Bot className="size-6" /></div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">{t("s_99503f97be")}</h3>
                    <p className="text-sm text-muted-foreground">{t("s_2849a22e35")}</p>
                  </div>
                  <QuickStartCards
                    onInit={() => { onClearCommand(); void onPrompt({ files: [], text: "/init" }).catch(() => undefined); }}
                    onSend={(text) => { void onPrompt({ files: [], text }).catch(() => undefined); }}
                  />
                </ConversationEmptyState>
              )}
            footer={footerNodes.length > 0 ? <>{footerNodes}</> : undefined}
            items={renderedTurns}
            pinToBottom={pinToBottom}
            raiseScrollButton={activeDiffs.length > 0 || todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled")}
            runActive={isGenerating}
          />
        </BorderBeam>

        <div className="relative z-10 shrink-0 bg-background/95 px-3 pb-3 pt-0 shadow-[0_-10px_28px_-24px_hsl(var(--foreground)/0.55)] backdrop-blur-sm">
          <TodoPanel active={isGenerating} diffs={activeDiffs} todos={todos} />
          {(TRIGGER_CHARACTERS.includes(composerText.slice(0, 1)) || fileSearch !== undefined)
            && dismissedTriggerQuery !== composerText && (
            <SlashCommandMenu
              fileSearch={fileSearch}
              onFileSearchChange={setFileSearch}
              agents={agents}
              commands={commands}
              disabledSkillNames={preferences.disabledSkillNames}
              mcpNames={mcpNames}
              onAttachAgent={onAttachAgent}
              onAttachMcp={onAttachMcp}
              onAttachFile={attachProjectFile}
              onAttachSkill={onAttachSkill}
              onSelectCommand={onSelectCommand}
              onCompact={() => { onClearCommand(); onCompact(); }}
              onInit={() => { onClearCommand(); void onPrompt({ files: [], text: "/init" }).catch(() => undefined); }}
              onInsert={onSetComposerText}
              query={composerText}
              skills={skills}
            />
          )}
          {composerNotice && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{composerNotice}</span>
              <Button aria-label={t("s_c620893e29")} className="size-5 shrink-0" onClick={() => setComposerNotice("")} size="icon" type="button" variant="ghost"><X className="size-3" /></Button>
            </div>
          )}
          {autoRetryNotice && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <p className="min-w-0 flex-1 text-[11px] leading-4 text-amber-600 dark:text-amber-500">{autoRetryNotice}</p>
              {/* The cancel lives here rather than on the composer button. Once the run has ended
                  that button is "send" again, so pointing the user at "stop" sent them looking for
                  a control that was no longer on screen. */}
              {onCancelAutoRetry && (
                <Button className="h-6 shrink-0 px-2 text-[11px]" onClick={onCancelAutoRetry} size="sm" type="button" variant="ghost">
                  {t("run.cancelRetry")}
                </Button>
              )}
            </div>
          )}
          <PromptQueue items={queuedPrompts} onClear={onQueueClear} onDelete={onQueueDelete} onEdit={onQueueEdit} />
          {browserAnnotations.length > 0 && (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
              <BrowserAnnotationChip
                annotations={browserAnnotations}
                imagesSupported={Boolean(selectedModel?.capabilities?.input?.image)}
                onClear={clearBrowserAnnotations}
              />
            </div>
          )}
          {/* The command sits with the other chips rather than in the text. Typing it into the
              composer made it part of what the user was writing, so editing the message meant
              editing around it — and deleting a character silently turned it into prose. */}
          {(contexts.length > 0 || pendingCommand) && (
            <div className="mb-2 flex min-w-0 flex-wrap gap-1.5">
              {pendingCommand && (
                <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-foreground">
                  <TerminalSquare className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate font-medium">/{pendingCommand}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{t("command.chipLabel")}</span>
                  <Button aria-label={t("command.clear")} className="-mr-1 size-5 shrink-0" onClick={onClearCommand} size="icon" title={t("command.clear")} type="button" variant="ghost">
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              {contexts.map((context) => <ContextChip context={context} key={`${context.id}-${context.addedAt}`} onRemove={() => onContextsChange(contexts.filter((item) => item.id !== context.id))} />)}
            </div>
          )}
          <BorderBeam
            active={!booting}
            className="w-full"
            colorVariant="colorful"
            onMouseEnter={() => setComposerHovered(true)}
            onMouseLeave={() => setComposerHovered(false)}
            size="md"
            strength={composerBeamStrength}
            theme={theme}
          >
            <PromptInput className="rounded-[10px] border border-border/60 bg-card shadow-none" draftKey={activeSessionTabID} onSubmit={submitPrompt} onTextChange={onSetComposerText} openDraftKeys={sessionTabs.map((tab) => tab.id)} text={composerText}>
              <PromptInputAttachments />
              <PromptInputTextarea className="min-h-10 max-h-28 py-2 text-sm" disabled={booting} placeholder={contexts.length > 0 ? t("s_0e75c177e7") : composerHint()} />
              <PromptInputFooter className="px-1.5 pb-1 pt-0.5">
                <PromptInputTools className="flex min-w-0 flex-wrap gap-0.5">
                  <PromptInputAttachmentButton />
                  <div className="flex min-w-0 max-w-full flex-wrap items-center">
                    {/* The primary agent is left to OpenCode; approval mode takes this slot. */}
                    <ProfessionalRolePicker onChange={onProfessionalRoleChange} preferences={preferences.professionalRoles} />
                    <ApprovalModePicker onChange={onApprovalModeChange} value={approvalMode} />
                    <ModelPicker models={selectableModels} onChange={onModelChange} onManage={onOpenModelSettings} value={resolvedModelKey} />
                    <VariantPicker
                      hasDefault={modelHasDefaultVariant(selectedModel)}
                      labels={preferences.modelVariantLabels[resolvedModelKey]}
                      onChange={onVariantChange}
                      value={selectedVariant}
                      variants={modelVariantIDs(selectedModel)}
                    />
                  </div>
                </PromptInputTools>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ContextUsageIndicator context={contextUsage} />
                  <PromptInputSubmit aria-label={isGenerating ? t("s_76349aa64a") : t("s_94306b2fc3")} disabled={booting} onStop={onStop} status={runStatus} />
                </div>
              </PromptInputFooter>
            </PromptInput>
          </BorderBeam>
        </div>
      </div>
      <SessionDialog deletingSessionID={deletingSessionID} pendingApprovalSessionIDs={pendingApprovalSessionIDs} onCreate={onCreateSession} onDelete={onDeleteSession} onOpenChange={onSessionDialogOpenChange} onSelect={onSelectSession} open={sessionDialogOpen} selectedSessionID={selectedSessionID} sessions={sessions} />
      <Dialog onOpenChange={(open) => { if (!open) onCancelPendingSessionTab(); }} open={Boolean(pendingSessionTabOpen)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{t("tabs.limitTitle")}</DialogTitle>
            <DialogDescription>{t("tabs.limitDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(45vh,18rem)] space-y-1 overflow-y-auto py-1">
            {sessionTabs.map((tab) => {
              const title = sessionTabTitle(tab, new Map(sessions.map((session) => [session.id, session])));
              return (
                <button
                  className="group flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted"
                  key={tab.id}
                  onClick={() => onCloseSessionTabAndOpenPending(tab.id)}
                  title={title}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground group-hover:text-foreground">{t("tabs.closeThisAndOpen")}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={onCancelPendingSessionTab} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={(open) => { if (!open) onSessionTitleCancel(); }} open={nativeTitleActions && editingSessionTitle}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
          <form onSubmit={(event) => { event.preventDefault(); onSessionTitleSave(); }}>
            <DialogHeader>
              <DialogTitle className="text-base">{t("s_757cc06ee1")}</DialogTitle>
              <DialogDescription className="sr-only">{t("s_864aff361d")}</DialogDescription>
            </DialogHeader>
            <Input aria-label={t("s_864aff361d")} autoFocus className="mt-3" onChange={(event) => onSessionTitleChange(event.target.value)} value={sessionTitleDraft} />
            <DialogFooter className="mt-4">
              <Button onClick={onSessionTitleCancel} type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
              <Button disabled={!sessionTitleDraft.trim()} type="submit">{t("s_fadf24dbc5")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <WorkspaceDialog nativeTitleActions={nativeTitleActions} updateStatus={updateStatus} baseUrl={getOpenCodeBaseUrl()} connected={connected === true} initialSection={workspaceSection} mcpNames={mcpNames} models={selectableModels} onConfigurationChanged={onConfigurationChanged} onOpenChange={onWorkspaceOpenChange} onPreferencesChanged={onPreferencesChanged} open={workspaceDialogOpen} projectID={currentSession?.projectID} projectPath={projectPath} skills={skills} />
    </TooltipProvider>
  );
}
