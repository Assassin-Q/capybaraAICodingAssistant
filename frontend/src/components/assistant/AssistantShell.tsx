import { Bot, CircleAlert, History, MessageSquarePlus, Moon, Pencil, RefreshCw, Settings2, Sun, X } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
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
import type { ConversationTurn } from "@/components/assistant/conversationTurns";
import {
  AgentPicker,
  ModelPicker,
  NetworkToggle,
  VariantPicker,
} from "@/components/assistant/ModelPicker";
import { modelVariantIDs } from "@/components/assistant/modelVariants";
import { PermissionInline } from "@/components/assistant/PermissionInline";
import { PromptQueue, type QueuedPrompt } from "@/components/assistant/PromptQueue";
import { QuestionInline } from "@/components/assistant/QuestionInline";
import { SessionDialog } from "@/components/assistant/SessionDialog";
import { SlashCommandMenu } from "@/components/assistant/SlashCommandMenu";
import { TodoPanel } from "@/components/assistant/TodoPanel";
import { UserMessage } from "@/components/assistant/UserMessage";
import { sessionName } from "@/components/assistant/shared";
import type { ContextChip as ContextChipData, RunStatus } from "@/components/assistant/shared";
import { WorkspaceDialog } from "@/components/assistant/WorkspaceDialog";
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
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { IdeaTheme } from "@/hooks/useIdeaTheme";

export interface AssistantShellProps {
  agents: AgentInfo[];
  booting: boolean;
  commands: CommandInfo[];
  connected: boolean | null;
  contexts: ContextChipData[];
  composerText: string;
  conversationTurns: ConversationTurn[];
  currentPermissions: PermissionRequest[];
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
  networkEnabled: boolean;
  preferences: WorkspacePreferences;
  projectPath?: string;
  questionAnswers: Record<string, string[][]>;
  queuedPrompts: QueuedPrompt[];
  refreshing: boolean;
  resolvedModelKey: string;
  runStatus: RunStatus;
  selectableModels: ModelInfo[];
  selectedAgentID: string;
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
  workspaceSection: "connection" | "models" | "persona" | "memory" | "skills" | "mcp" | "permissions";
  onAgentChange: (value: string) => void;
  onClearError: () => void;
  onConfigurationChanged: () => void;
  onContextsChange: (contexts: ContextChipData[]) => void;
  onCreateSession: () => void;
  onDeleteSession: (session: SessionInfo) => void;
  onNetworkChange: (enabled: boolean) => void;
  onModelChange: (value: string) => void;
  onOpenModelSettings: () => void;
  onPermissionReply: (request: PermissionRequest, reply: PermissionReply) => void;
  onPreferencesChanged: (preferences: WorkspacePreferences) => void;
  onPrompt: (message: PromptInputMessage) => Promise<boolean>;
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
  const {
    agents,
    booting,
    commands,
    connected,
    contexts,
    composerText,
    conversationTurns,
    currentPermissions,
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
    networkEnabled,
    preferences,
    projectPath,
    questionAnswers,
    queuedPrompts,
    refreshing,
    resolvedModelKey,
    runStatus,
    selectableModels,
    selectedAgentID,
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
    onAgentChange,
    onClearError,
    onConfigurationChanged,
    onContextsChange,
    onCreateSession,
    onDeleteSession,
    onNetworkChange,
    onModelChange,
    onOpenModelSettings,
    onPermissionReply,
    onPreferencesChanged,
    onPrompt,
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

  let latestUserMessageID: string | undefined;
  const renderedTurns = conversationTurns.map((message) => {
    if (message.type === "user") {
      latestUserMessageID = message.id;
      return <UserMessage key={message.id} message={message} />;
    }
    if (message.type === "assistant") {
      const diffMessageID = message.parentID ?? latestUserMessageID ?? message.id;
      const messageIsStreaming = isGenerating && (
        message.sourceIDs.includes(streamingAssistantID ?? "")
        || Boolean(streamingAssistantParentID && message.parentID === streamingAssistantParentID)
      );
      return (
        <AssistantMessage
          diffs={diffsByMessageID[diffMessageID]}
          isStreaming={messageIsStreaming}
          key={message.id}
          message={message as AssistantMessageData}
        />
      );
    }
    return null;
  });

  return (
    <TooltipProvider>
      <div className="assistant-shell flex h-full min-h-[480px] min-w-[560px] w-full flex-col bg-background text-foreground">
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
          <Button aria-label="新建会话" className="size-8 shrink-0" onClick={onCreateSession} size="icon" title="新建会话" type="button" variant="ghost"><MessageSquarePlus className="size-3.5" /></Button>
          <Button aria-label={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} aria-pressed={theme === "dark"} className="size-8 shrink-0" onClick={onThemeToggle} size="icon" title={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} type="button" variant="ghost">
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
          <Button aria-label="打开工作区设置" className="size-8 shrink-0" onClick={() => onWorkspaceOpenChange(true)} size="icon" title="工作区设置" type="button" variant="ghost"><Settings2 className="size-3.5" /></Button>
          <Button aria-label="刷新会话和模型" className="size-8 shrink-0" disabled={refreshing} onClick={onRefresh} size="icon" title="刷新会话和模型" type="button" variant="ghost"><RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} /></Button>
        </header>

        {error && <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span><Button aria-label="关闭错误提示" className="size-5 shrink-0" onClick={onClearError} size="icon" type="button" variant="ghost"><X className="size-3" /></Button></div>}

        <Conversation className="min-h-0">
          <ConversationContent className="gap-5 px-3 py-4">
            {booting ? <ConversationEmptyState description="正在连接 OpenCode" icon={<RefreshCw className="size-5 animate-spin" />} title="准备工作区" /> : conversationTurns.length === 0 ? <ConversationEmptyState description="在下方输入任务，或从编辑器添加代码片段" icon={<Bot className="size-6" />} title="开始一次编码对话" /> : renderedTurns}
            {isGenerating && !hasStreamingAssistantContent && <AssistantThinking />}
            {currentPermissions[0] && <PermissionInline onReply={(reply) => onPermissionReply(currentPermissions[0], reply)} request={currentPermissions[0]} />}
            {currentQuestions.map((request) => <QuestionInline answers={questionAnswers[request.id] ?? request.questions.map(() => [])} key={request.id} onChange={(index, values) => onQuestionChange(request, index, values)} onReject={() => onQuestionReject(request)} onReply={() => onQuestionReply(request)} request={request} />)}
          </ConversationContent>
          <ConversationScrollButton className="bottom-3" />
        </Conversation>

        <div className="relative shrink-0 border-t border-border/60 bg-background px-3 pb-3 pt-2">
          <TodoPanel todos={todos} />
          {(composerText.startsWith("/") || composerText.startsWith("$") || composerText.startsWith("@")) && <SlashCommandMenu agents={agents} commands={commands} disabledSkillNames={preferences.disabledSkillNames} mcpNames={mcpNames} onInsert={onSetComposerText} query={composerText} skills={skills} />}
          <PromptQueue items={queuedPrompts} onClear={onQueueClear} onDelete={onQueueDelete} onEdit={onQueueEdit} />
          {contexts.length > 0 && <div className="mb-2 flex min-w-0 flex-wrap gap-1.5">{contexts.map((context) => <ContextChip context={context} key={`${context.id}-${context.addedAt}`} onRemove={() => onContextsChange(contexts.filter((item) => item.id !== context.id))} />)}</div>}
          <PromptInput className="rounded-[10px] border border-border/60 bg-card shadow-none" onSubmit={onPrompt} onTextChange={onSetComposerText} text={composerText}>
            <PromptInputAttachments />
            <PromptInputTextarea className="min-h-10 max-h-28 py-2 text-sm" disabled={booting || !selectedSessionID} placeholder={contexts.length > 0 ? "补充任务说明..." : "输入任务..."} />
            <PromptInputFooter className="px-1.5 pb-1 pt-0.5">
              <PromptInputTools className="flex min-w-0 flex-wrap gap-0.5">
                <PromptInputAttachmentButton />
                <div className="flex min-w-0 max-w-full flex-wrap items-center">
                  {agents.length > 0 && <AgentPicker agents={agents} className="max-w-[8rem]" onChange={onAgentChange} value={selectedAgentID} />}
                  <ModelPicker models={selectableModels} onChange={onModelChange} onManage={onOpenModelSettings} value={resolvedModelKey} />
                  <VariantPicker variants={modelVariantIDs(selectedModel)} value={selectedVariant} onChange={onVariantChange} />
                  <NetworkToggle enabled={networkEnabled} onChange={onNetworkChange} />
                </div>
              </PromptInputTools>
              <PromptInputSubmit aria-label={isGenerating ? "停止生成" : "发送消息"} disabled={booting || !selectedSessionID} onStop={onStop} status={runStatus} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
      <SessionDialog deletingSessionID={deletingSessionID} onCreate={onCreateSession} onDelete={onDeleteSession} onOpenChange={onSessionDialogOpenChange} onSelect={onSelectSession} open={sessionDialogOpen} selectedSessionID={selectedSessionID} sessions={sessions} />
      <WorkspaceDialog baseUrl={getOpenCodeBaseUrl()} connected={connected === true} initialSection={workspaceSection} models={selectableModels} onConfigurationChanged={onConfigurationChanged} onOpenChange={onWorkspaceOpenChange} onPreferencesChanged={onPreferencesChanged} open={workspaceDialogOpen} projectID={currentSession?.projectID} projectPath={projectPath} />
    </TooltipProvider>
  );
}
