import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
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
          {/*
            Quiet, like every other secondary action in the panel. As an outline button it carried
            a border and a shadow of its own, which on the dialog's own white surface read as the
            heavier of the two — the opposite of the weighting a confirm dialog wants.
          */}
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("s_4d0b4688c7")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void request?.onConfirm()}
            size="sm"
            type="button"
            variant={request?.destructive ? "destructive" : "default"}
          >
            {request?.confirmLabel ?? t("s_b56d9ac6c5")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
