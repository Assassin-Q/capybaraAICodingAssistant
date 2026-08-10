import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, CircleAlert, History, MessageSquarePlus, Moon, Pencil, RefreshCw, Settings2, Sun, X } from "lucide-react";
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
import { modelHasDefaultVariant, modelVariantIDs } from "@/components/assistant/modelVariants";
import { PermissionInline } from "@/components/assistant/PermissionInline";
import { PromptQueue, type QueuedPrompt } from "@/components/assistant/PromptQueue";
import { QuestionInline } from "@/components/assistant/QuestionInline";
import { SessionDialog } from "@/components/assistant/SessionDialog";
import { SlashCommandMenu } from "@/components/assistant/SlashCommandMenu";
import { TodoPanel } from "@/components/assistant/TodoPanel";
import { UserMessage } from "@/components/assistant/UserMessage";
import { VirtualConversation } from "@/components/assistant/VirtualConversation";
import { errorMessage, sessionName } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData, RunStatus } from "@/components/assistant/shared";
import { WorkspaceDialog, type SectionID as WorkspaceSectionID } from "@/components/assistant/WorkspaceDialog";
import { ideaFileSearchApi } from "@/lib/ideaIntegrations";
import { getOpenCodeBaseUrl, openCodeApi } from "@/lib/opencode";
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
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { ContextUsageInfo } from "@/lib/tokenUsage";
import type { ApprovalMode } from "@/lib/approvalMode";
import type { IdeaTheme } from "@/hooks/useIdeaTheme";

export interface AssistantShellProps {
  agents: AgentInfo[];
  booting: boolean;
  commands: CommandInfo[];
  connected: boolean | null;
  contextUsage?: ContextUsageInfo;
  contexts: ContextChipData[];
  composerText: string;
  conversationTurns: ConversationTurn[];
  currentPermissions: PermissionRequest[];
  pendingApprovalSessionIDs: string[];
  currentQuestions: QuestionRequest[];
  todos: import("@/lib/opencode").TodoInfo[];
  currentSession?: SessionInfo;
  deletingSessionID: string;
  diffsByMessageID: Record<string, SessionFileDiff[]>;
  editingSessionTitle: boolean;
  error: string;
  isGenerating: boolean;
  hasStreamingAssistantContent: boolean;
  mcpNames: string[];
  approvalMode: ApprovalMode;
  /** True while OpenCode is compacting this session, whether we asked for it or it decided to. */
  compacting: boolean;
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
  onPrompt: (message: PromptInputMessage) => Promise<boolean>;
  onRecoverTurn: (action: "revert" | "fork", messageID: string) => void;
  onQuestionChange: (request: QuestionRequest, index: number, values: string[]) => void;
  onQuestionReject: (request: QuestionRequest) => void;
  onQuestionReply: (request: QuestionRequest) => void;
  onQueueClear: () => void;
  onQueueDelete: (id: string) => void;
  onQueueEdit: (item: QueuedPrompt) => void;
  onRefresh: () => void;
  onSelectSession: (sessionID: string) => void;
  onSessionDialogOpenChange: (open: boolean) => void;
  onSessionTitleChange: (value: string) => void;
  onSessionTitleEdit: () => void;
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
const SESSION_EVENT_LABELS: Record<Exclude<ConversationTurn["type"], "user" | "assistant">, string> = {
  "agent-switched": "已切换子智能体",
  compaction: "上下文已压缩",
  "model-switched": "已切换模型",
  shell: "终端命令",
  synthetic: "系统补充上下文",
  system: "系统消息",
};

/** The event detail worth putting on the divider, when the payload carries one. */
const sessionEventDetail = (turn: ConversationTurn): string | undefined => {
  if (turn.type === "user" || turn.type === "assistant") return undefined;
  if (turn.type === "agent-switched") return turn.agent;
  if (turn.type === "model-switched") return turn.model?.id;
  // The summary itself arrives as the following assistant message, so there is nothing to repeat
  // here — only whether this was OpenCode's own doing, which is the part a user cannot infer.
  if (turn.type === "compaction") return turn.auto ? "上下文写满，自动触发" : undefined;
  return turn.text?.trim().replace(/\s+/g, " ") || undefined;
};

/** Characters that open the composer picker. Kept beside the placeholder hint that advertises them. */
const TRIGGER_CHARACTERS = ["/", "@", "$"];
const COMPOSER_HINT = "输入任务…  / 命令与文件   @ 子智能体   $ 技能与 MCP";

function StatusDot({ connected }: { connected: boolean | null }) {
  const color = connected === true
    ? "bg-emerald-500"
    : connected === false
      ? "bg-red-500"
      : "bg-muted-foreground";
  const label = connected === true ? "OpenCode 已连接" : connected === false ? "OpenCode 未连接" : "正在检查 OpenCode";
  return <span aria-label={label} className={`size-2 shrink-0 rounded-full ${color}`} title={label} />;
}

export function AssistantShell(props: AssistantShellProps) {
  const [composerHovered, setComposerHovered] = useState(false);
  /** One-line feedback for composer actions that do not produce a message of their own. */
  const [composerNotice, setComposerNotice] = useState("");
  const { annotations: browserAnnotations, clear: clearBrowserAnnotations } = useBrowserAnnotations();

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
   * Progress belongs in the transcript, not in a toast beside the composer.
   *
   * Compaction rewrites the conversation, so a divider at the point it happens is the only place
   * that stays meaningful after the fact — the notice bar vanished and left no trace of why the
   * history changed. The flag clears when OpenCode emits its own compaction message, which is the
   * event that turns the live divider into the permanent one.
   */
  const compactSession = () => {
    if (!selectedSessionID) return;
    void openCodeApi.compactSession(selectedSessionID, {
      directory: projectPath,
      modelID: selectedModel?.id,
      providerID: selectedModel?.providerID,
    }).catch((error: unknown) => setComposerNotice(errorMessage(error)));
  };

  /**
   * Browser annotations ride along with the next prompt and are cleared once it is accepted —
   * a chip that only displayed a count would tell the model nothing.
   */
  const submitPrompt = async (message: PromptInputMessage): Promise<boolean> => {
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
    composerText,
    conversationTurns,
    currentPermissions,
    pendingApprovalSessionIDs,
    currentQuestions,
    todos,
    currentSession,
    deletingSessionID,
    diffsByMessageID,
    editingSessionTitle,
    error,
    hasStreamingAssistantContent,
    isGenerating,
    mcpNames,
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
    onRecoverTurn,
    onQuestionChange,
    onQuestionReject,
    onQuestionReply,
    onQueueClear,
    onQueueDelete,
    onQueueEdit,
    onRefresh,
    onSelectSession,
    onSessionDialogOpenChange,
    onSessionTitleChange,
    onSessionTitleEdit,
    onSessionTitleSave,
    onSessionTitleCancel,
    onSetComposerText,
    onStop,
    onThemeToggle,
    onVariantChange,
    onWorkspaceOpenChange,
  } = props;
  const composerBeamStrength = isGenerating ? 1 : composerHovered ? 0.75 : 0.5;

  let latestUserMessageID: string | undefined;
  // Each turn gets its own boundary: one malformed message (a bad attachment, an unexpected
  // part shape) must not take the whole conversation down with it.
  const renderedTurns = conversationTurns.flatMap((message, index) => {
    if (message.type === "user") {
      latestUserMessageID = message.id;
      return [
        <ErrorBoundary key={message.id} label="用户消息">
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
        <ErrorBoundary key={message.id} label="助手消息">
          <AssistantMessage
            diffs={diffsByMessageID[diffMessageID]}
            isStreaming={messageIsStreaming}
            runActive={isGenerating && index === conversationTurns.length - 1}
            message={message as AssistantMessageData}
            onOpenSession={onSelectSession}
            onRecover={onRecoverTurn}
          />
        </ErrorBoundary>,
      ];
    }
    const label = SESSION_EVENT_LABELS[message.type];
    const detail = sessionEventDetail(message);
    return [
      <ConversationDivider
        key={message.id}
        label={detail ? `${label} · ${detail.slice(0, 80)}` : label}
      />,
    ];
  });

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
    compacting ? <ConversationDivider busy key="compacting" label="正在压缩上下文" /> : null,
    // Between two assistant messages OpenCode reports "generating" with nothing streaming yet.
    // Showing the placeholder on that gap left a spinner parked under a finished turn, so it only
    // appears while the newest turn genuinely has no content of its own.
    isGenerating && !tailIsBusy ? <AssistantThinking key="thinking" /> : null,
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
        <header className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          <Button aria-label="打开会话历史" className="size-8 shrink-0" onClick={() => onSessionDialogOpenChange(true)} size="icon" title="会话历史" type="button" variant="ghost">
            <History className="size-3.5" />
          </Button>
          <div className="min-w-0 flex-1">
            {editingSessionTitle ? (
              <input
                aria-label="会话名称"
                autoFocus
                className="h-7 w-full min-w-0 rounded-md bg-muted px-2 text-xs outline-none ring-1 ring-ring/40"
                onBlur={onSessionTitleSave}
                onChange={(event) => onSessionTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSessionTitleSave();
                  if (event.key === "Escape") onSessionTitleCancel();
                }}
                value={sessionTitleDraft}
              />
            ) : (
              <button className="group inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-accent" onClick={onSessionTitleEdit} title="重命名会话" type="button">
                <span className="truncate text-xs font-medium">{currentSession ? sessionName(currentSession) : "OpenCode"}</span>
                <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>
          <StatusDot connected={connected} />
          <GitStatusButton model={selectedModel} projectPath={projectPath} variant={selectedVariant} />
          <Button aria-label="新建会话" className="size-8 shrink-0" onClick={onCreateSession} size="icon" title="新建会话" type="button" variant="ghost"><MessageSquarePlus className="size-3.5" /></Button>
          <Button aria-label={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} aria-pressed={theme === "dark"} className="size-8 shrink-0" onClick={onThemeToggle} size="icon" title={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} type="button" variant="ghost">
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
          <Button aria-label="打开工作区设置" className="size-8 shrink-0" onClick={() => onWorkspaceOpenChange(true)} size="icon" title="工作区设置" type="button" variant="ghost"><Settings2 className="size-3.5" /></Button>
          <Button aria-label="刷新会话和模型" className="size-8 shrink-0" disabled={refreshing} onClick={onRefresh} size="icon" title="刷新会话和模型" type="button" variant="ghost"><RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} /></Button>
        </header>

        {error && <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span><Button aria-label="关闭错误提示" className="size-5 shrink-0" onClick={onClearError} size="icon" type="button" variant="ghost"><X className="size-3" /></Button></div>}

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
              返回上级会话
            </Button>
            <span className="min-w-0 flex-1 truncate">当前正在查看子智能体会话</span>
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
              ? <ConversationEmptyState description="正在连接 OpenCode" icon={<RefreshCw className="size-5 animate-spin" />} title="准备工作区" />
              : <ConversationEmptyState description="在下方输入任务，或从编辑器添加代码片段" icon={<Bot className="size-6" />} title="开始一次编码对话" />}
            followOutput={isGenerating}
            footer={footerNodes.length > 0 ? <>{footerNodes}</> : undefined}
            items={renderedTurns}
            pinToBottom={pinToBottom}
            raiseScrollButton={todos.length > 0}
          />
        </BorderBeam>

        <div className="relative z-10 shrink-0 bg-background/95 px-3 pb-3 pt-0 shadow-[0_-10px_28px_-24px_hsl(var(--foreground)/0.55)] backdrop-blur-sm">
          <TodoPanel active={isGenerating} todos={todos} />
          {TRIGGER_CHARACTERS.includes(composerText.slice(0, 1)) && (
            <SlashCommandMenu
              agents={agents}
              commands={commands}
              disabledSkillNames={preferences.disabledSkillNames}
              mcpNames={mcpNames}
              onAttachFile={attachProjectFile}
              onCompact={compactSession}
              onInsert={onSetComposerText}
              query={composerText}
              skills={skills}
            />
          )}
          {composerNotice && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{composerNotice}</span>
              <Button aria-label="关闭提示" className="size-5 shrink-0" onClick={() => setComposerNotice("")} size="icon" type="button" variant="ghost"><X className="size-3" /></Button>
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
          {contexts.length > 0 && <div className="mb-2 flex min-w-0 flex-wrap gap-1.5">{contexts.map((context) => <ContextChip context={context} key={`${context.id}-${context.addedAt}`} onRemove={() => onContextsChange(contexts.filter((item) => item.id !== context.id))} />)}</div>}
          <BorderBeam
            active={!booting && Boolean(selectedSessionID)}
            className="w-full"
            colorVariant="colorful"
            onMouseEnter={() => setComposerHovered(true)}
            onMouseLeave={() => setComposerHovered(false)}
            size="md"
            strength={composerBeamStrength}
            theme={theme}
          >
            <PromptInput className="rounded-[10px] border border-border/60 bg-card shadow-none" onSubmit={submitPrompt} onTextChange={onSetComposerText} text={composerText}>
              <PromptInputAttachments />
              <PromptInputTextarea className="min-h-10 max-h-28 py-2 text-sm" disabled={booting || !selectedSessionID} placeholder={contexts.length > 0 ? "补充任务说明…" : COMPOSER_HINT} />
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
                  <PromptInputSubmit aria-label={isGenerating ? "停止生成" : "发送消息"} disabled={booting || !selectedSessionID} onStop={onStop} status={runStatus} />
                </div>
              </PromptInputFooter>
            </PromptInput>
          </BorderBeam>
        </div>
      </div>
      <SessionDialog deletingSessionID={deletingSessionID} pendingApprovalSessionIDs={pendingApprovalSessionIDs} onCreate={onCreateSession} onDelete={onDeleteSession} onOpenChange={onSessionDialogOpenChange} onSelect={onSelectSession} open={sessionDialogOpen} selectedSessionID={selectedSessionID} sessions={sessions} />
      <WorkspaceDialog baseUrl={getOpenCodeBaseUrl()} connected={connected === true} initialSection={workspaceSection} mcpNames={mcpNames} models={selectableModels} onConfigurationChanged={onConfigurationChanged} onOpenChange={onWorkspaceOpenChange} onPreferencesChanged={onPreferencesChanged} open={workspaceDialogOpen} projectID={currentSession?.projectID} projectPath={projectPath} skills={skills} />
    </TooltipProvider>
  );
}
