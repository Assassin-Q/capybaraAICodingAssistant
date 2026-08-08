import { CircleAlert, FileCog, FileSearch, Globe2, ShieldAlert, Terminal } from "lucide-react";

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onReply("reject"); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-3 border-0 p-4 shadow-lg ring-1 ring-border/40 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="size-4 text-amber-500" />
            需要你的批准
          </DialogTitle>
          <DialogDescription>当前任务会暂停，选择后继续执行。</DialogDescription>
        </DialogHeader>
        <Confirmation approval={{ id: request.id }} className="border-0 bg-transparent p-0 shadow-none" state="approval-requested">
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
          <ConfirmationActions className="mt-4 flex-wrap justify-end self-stretch">
            <ConfirmationAction onClick={() => onReply("reject")} variant="ghost">拒绝</ConfirmationAction>
            <ConfirmationAction onClick={() => onReply("always")} variant="outline">始终允许</ConfirmationAction>
            <ConfirmationAction onClick={() => onReply("once")}>允许一次</ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      </DialogContent>
    </Dialog>
  );
}

