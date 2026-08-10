import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ConfirmRequest } from "@/components/assistant/ConfirmDialog";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface SettingsHeaderProps {
  actions?: ReactNode;
  description: string;
  loading?: boolean;
  onRefresh?: () => void;
  title: string;
}

export function SettingsHeader({
  actions,
  description,
  loading = false,
  onRefresh,
  title,
}: SettingsHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {onRefresh && (
          <Button
            aria-label={t("s_f45360177a", { p0: title })}
            disabled={loading}
            onClick={onRefresh}
            size="icon-sm"
            title={t("s_38108eaa1d")}
            type="button"
            variant="ghost"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        )}
      </div>
    </header>
  );
}

export function SettingsMessage({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{notice}</span>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

export interface SettingsFeedback {
  error: string;
  notice: string;
  reset: () => void;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  /** Applies a `{ success, message }` backend response to the banner state. */
  report: (result: { success: boolean; message?: string }, fallback: string) => boolean;
}

export function useSettingsFeedback(): SettingsFeedback {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reset = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const report = useCallback((result: { success: boolean; message?: string }, fallback: string) => {
    if (result.success) {
      setError("");
      setNotice(result.message ?? fallback);
      return true;
    }
    setNotice("");
    setError(result.message ?? fallback);
    return false;
  }, []);

  // Memoized so callers can depend on the whole object inside useCallback/useEffect
  // without re-running on every render.
  return useMemo(
    () => ({ error, notice, report, reset, setError, setNotice }),
    [error, notice, report, reset]
  );
}

export interface ConfirmController {
  ask: (request: ConfirmRequest) => void;
  close: () => void;
  request?: ConfirmRequest;
}

export function useConfirm(): ConfirmController {
  const [request, setRequest] = useState<ConfirmRequest>();
  const close = useCallback(() => setRequest(undefined), []);
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  return { ask, close, request };
}
