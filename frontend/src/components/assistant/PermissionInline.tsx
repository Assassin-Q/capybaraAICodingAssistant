import { CircleAlert } from "lucide-react";

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PermissionReply, PermissionRequest } from "@/lib/opencode";

export function PermissionInline({
  request,
  onReply,
}: {
  onReply: (reply: PermissionReply) => void;
  request: PermissionRequest;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onReply("reject"); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-3 border-0 p-4 shadow-lg ring-1 ring-border/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">OpenCode 请求权限</DialogTitle>
          <DialogDescription>确认后当前任务会继续执行。</DialogDescription>
        </DialogHeader>
        <Confirmation approval={{ id: request.id }} className="border-0 bg-transparent p-0 shadow-none" state="approval-requested">
          <ConfirmationRequest>
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <ConfirmationTitle className="font-medium text-foreground">{request.action || "执行当前操作"}</ConfirmationTitle>
                {request.resources.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{request.resources.join(", ")}</p>}
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
