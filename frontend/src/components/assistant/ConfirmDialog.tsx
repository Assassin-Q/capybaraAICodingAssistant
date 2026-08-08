import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  request?: ConfirmRequest;
}

/**
 * In-app replacement for `window.confirm`, which JCEF blocks and which would freeze
 * the embedded browser. Callers own the request state and clear it on close.
 */
export function ConfirmDialog({ busy = false, onOpenChange, request }: ConfirmDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(request)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title ?? ""}</DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => void request?.onConfirm()}
            size="sm"
            type="button"
            variant={request?.destructive ? "destructive" : "default"}
          >
            {request?.confirmLabel ?? "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
