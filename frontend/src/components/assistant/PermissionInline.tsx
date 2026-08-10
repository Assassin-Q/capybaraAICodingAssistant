import { CircleAlert, FileCog, FileSearch, Globe2, ShieldAlert, Terminal } from "lucide-react";

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import type { PermissionReply, PermissionRequest } from "@/lib/opencode";

const actionDetails = (action: string): { icon: typeof FileSearch; label: string } => {
  const normalized = action.toLowerCase();
  if (["read", "glob", "grep", "list"].includes(normalized)) return { icon: FileSearch, label: "读取项目内容" };
  if (["edit", "write", "apply_patch", "external_directory"].includes(normalized)) return { icon: FileCog, label: "修改文件" };
  if (["bash", "shell", "task"].includes(normalized)) return { icon: Terminal, label: "执行命令" };
  if (["webfetch", "websearch"].includes(normalized)) return { icon: Globe2, label: "访问网络" };
  return { icon: ShieldAlert, label: action || "执行敏感操作" };
};

export function PermissionInline({
  request,
  onReply,
}: {
  onReply: (reply: PermissionReply) => void;
  request: PermissionRequest;
}) {
  const details = actionDetails(request.action);
  const Icon = details.icon;
  /**
   * What "本轮都允许" covers, in the request's own words.
   *
   * The panel answers matching requests itself for the rest of this run and never asks OpenCode to
   * remember anything, so this is a scope note rather than the warning it used to be: the old
   * button wrote a permanent project-wide rule, and websearch and edit both declare a `*` pattern.
   */
  const alwaysScope = request.action ? `本轮其余「${details.label}」` : "";
  // Deliberately not a modal. A dialog stole focus, could not be left open while switching
  // sessions, and dismissing it by clicking outside answered "reject" — which is the opposite of
  // what a stray click means. As a card it sits under the conversation and simply waits; the
  // request lives in OpenCode, so it survives a session switch and an IDE restart.
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
        <CircleAlert className="size-3.5 shrink-0" />
        需要你的批准
        <span className="font-normal opacity-80">· 当前任务已暂停，回答后继续</span>
      </div>
      <Confirmation approval={{ id: request.id }} className="mt-2 border-0 bg-transparent p-0 shadow-none" state="approval-requested">
        <ConfirmationRequest>
          <div className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ConfirmationTitle className="font-medium text-foreground">{details.label}</ConfirmationTitle>
              {request.resources.length > 0 && (
                <div className="mt-2 max-h-28 overflow-y-auto rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                  {request.resources.map((resource) => (
                    <div className="break-all font-mono leading-5" key={resource}>{resource}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ConfirmationRequest>
        <ConfirmationActions className="mt-3 flex-wrap items-center justify-end self-stretch">
          {alwaysScope && (
            <span className="mr-auto text-[11px] text-muted-foreground">
              「本轮都允许」自动放行{alwaysScope}，本次任务结束后失效
            </span>
          )}
          <ConfirmationAction onClick={() => onReply("reject")} variant="ghost">拒绝</ConfirmationAction>
          <ConfirmationAction onClick={() => onReply("always")} variant="outline">本轮都允许</ConfirmationAction>
          <ConfirmationAction onClick={() => onReply("once")}>允许一次</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}
