import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, Cpu, Download, HardDrive, LoaderCircle, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ideaApi } from "@/lib/idea";
import { cn } from "@/lib/utils";
import type { EmbeddingModelOption, MemoryEmbeddingStatus } from "@/lib/idea";
import { t } from "@/lib/i18n";

interface MemoryEmbeddingSettingsProps {
  onChanged?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function MemoryEmbeddingSettings({ onChanged }: MemoryEmbeddingSettingsProps) {
  const [status, setStatus] = useState<MemoryEmbeddingStatus | null>(null);
  const [mode, setMode] = useState<"local" | "remote">("local");
  const [localModel, setLocalModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [remoteModel, setRemoteModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "download" | "delete">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // A download runs on a background thread in the IDE, so the panel polls instead of waiting on
  // the request that started it. The ref keeps the interval from restarting on every render.
  const pollingRef = useRef<number | null>(null);

  const apply = useCallback((next: MemoryEmbeddingStatus) => {
    setStatus(next);
    setMode(next.mode);
    setLocalModel(next.localModel);
    setBaseUrl(next.remoteBaseUrl);
    setRemoteModel(next.remoteModel);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await ideaApi.getMemoryEmbedding());
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const downloading = status?.downloading ?? false;
    if (downloading && pollingRef.current === null) {
      pollingRef.current = window.setInterval(() => {
        void ideaApi.getMemoryEmbedding().then(setStatus).catch(() => undefined);
      }, 700);
    }
    if (!downloading && pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current !== null && !downloading) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status?.downloading]);

  useEffect(() => () => {
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
  }, []);

  const save = async () => {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.updateMemoryEmbedding({
        localModel,
        mode,
        remoteApiKey: apiKey.trim() || undefined,
        remoteBaseUrl: baseUrl,
        remoteModel,
      });
      if (!result.success) throw new Error(t(result.message as never));
      if (result.status) apply(result.status);
      setApiKey("");
      setNotice(t(result.message as never));
      onChanged?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const download = async (model: string) => {
    setBusy("download");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.downloadEmbeddingModel(model);
      if (!result.success) throw new Error(t(result.message as never));
      if (result.status) setStatus(result.status);
      setNotice(t(result.message as never));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const remove = async (model: string) => {
    setBusy("delete");
    setError("");
    setNotice("");
    try {
      const result = await ideaApi.deleteEmbeddingModel(model);
      if (!result.success) throw new Error(t(result.message as never));
      if (result.status) setStatus(result.status);
      setNotice(t(result.message as never));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const installedOf = (id: string) => status?.installed.find((item) => item.id === id);
  const selected = status?.options.find((option) => option.id === localModel);
  const disabled = Boolean(busy) || (status?.downloading ?? false);

  return (
    <section className="border-b border-border/50 py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("memEmb.title")}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("memEmb.subtitle")}</p>
        </div>
        <Button onClick={() => void refresh()} size="icon-sm" type="button" variant="ghost" title={t("memEmb.reload")}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
        <p className="text-xs font-medium">{t("memEmb.roles.title")}</p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary">{t("memEmb.roles.vector")}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {t("memEmb.roles.current", { model: localModel || t("memEmb.roles.none") })}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("memEmb.roles.vectorDesc")}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline">{t("memEmb.roles.text")}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {t("memEmb.roles.current", {
                  model: status?.textModel
                    ? `${status.textProvider}/${status.textModel}`
                    : t("memEmb.roles.none"),
                })}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {t("memEmb.roles.textDesc")} {t("memEmb.roles.textHint")}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs font-medium">{t("memEmb.mode.title")}</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {([
          { desc: t("memEmb.mode.localDesc"), icon: Cpu, label: t("memEmb.mode.local"), value: "local" as const },
          { desc: t("memEmb.mode.remoteDesc"), icon: Cloud, label: t("memEmb.mode.remote"), value: "remote" as const },
        ]).map((option) => (
          <button
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition",
              mode === option.value ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => setMode(option.value)}
            type="button"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <option.icon className="size-3.5" />
              {option.label}
              {mode === option.value && <Check className="size-3.5 text-primary" />}
            </span>
            <span className="text-[11px] leading-4 text-muted-foreground">{option.desc}</span>
          </button>
        ))}
      </div>

      {mode === "local" ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium">{t("memEmb.local.pick")}</p>
          {status?.options.map((option) => (
            <LocalModelRow
              busy={disabled}
              downloadingThis={status.downloading && status.downloadModel === option.id}
              installed={installedOf(option.id)}
              key={option.id}
              onDelete={() => void remove(option.id)}
              onDownload={() => void download(option.id)}
              onSelect={() => setLocalModel(option.id)}
              option={option}
              received={status.downloadReceived}
              selected={localModel === option.id}
              total={status.downloadTotal}
            />
          ))}

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <HardDrive className="size-3.5 text-muted-foreground" />
              {t("memEmb.footprint.title")}
            </p>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-4 text-muted-foreground">
              <li>
                {t("memEmb.footprint.disk", {
                  path: status?.cacheDirectory ?? "",
                  size: formatBytes(selected?.downloadBytes ?? 0),
                })}
              </li>
              <li>
                {t("memEmb.footprint.memory", {
                  peak: formatBytes(selected?.peakBytes ?? 0),
                  resident: formatBytes(selected?.residentBytes ?? 0),
                })}
              </li>
              <li>{t("memEmb.footprint.context")}</li>
              <li>{t("memEmb.footprint.quantized")}</li>
              <li>{t("memEmb.footprint.mirror")}</li>
              {Boolean(status?.cacheBytes) && (
                <li>{t("memEmb.footprint.cacheUsed", { size: formatBytes(status?.cacheBytes ?? 0) })}</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("memEmb.remote.baseUrl")}</span>
            <Input
              disabled={disabled}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={t("memEmb.remote.baseUrlPlaceholder")}
              value={baseUrl}
            />
            <span className="block text-[11px] text-muted-foreground">
              {t("memEmb.remote.baseUrlHint", { path: `${baseUrl.trim().replace(/\/$/, "") || "…"}/embeddings` })}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("memEmb.remote.model")}</span>
            <Input
              disabled={disabled}
              onChange={(event) => setRemoteModel(event.target.value)}
              placeholder={t("memEmb.remote.modelPlaceholder")}
              value={remoteModel}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("memEmb.remote.key")}</span>
            <Input
              disabled={disabled}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t("memEmb.remote.keyPlaceholder")}
              type="password"
              value={apiKey}
            />
            <span className="block text-[11px] text-muted-foreground">
              {status?.remoteKeySet ? t("memEmb.remote.keyStored") : ""} {t("memEmb.remote.keyPrivacy")}
            </span>
          </label>
          <p className="text-[11px] leading-4 text-muted-foreground">{t("memEmb.remote.hint")}</p>
        </div>
      )}

      {status?.downloadError && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t("memEmb.local.downloadFailed", { error: status.downloadError })}
        </p>
      )}
      {status?.restartRequired && !notice && (
        <p className="mt-3 text-[11px] leading-4 text-amber-600 dark:text-amber-500">{t("embedding.saved")}</p>
      )}
      {notice && <p className="mt-3 text-[11px] leading-4 text-emerald-600 dark:text-emerald-500">{notice}</p>}
      {error && <p className="mt-3 text-[11px] leading-4 text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end">
        <Button disabled={disabled} onClick={() => void save()} size="sm" type="button" variant="secondary">
          {busy === "save" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {busy === "save" ? t("memEmb.saving") : t("memEmb.save")}
        </Button>
      </div>
    </section>
  );
}

interface LocalModelRowProps {
  busy: boolean;
  downloadingThis: boolean;
  installed?: { bytes: number; complete: boolean };
  onDelete: () => void;
  onDownload: () => void;
  onSelect: () => void;
  option: EmbeddingModelOption;
  received: number;
  selected: boolean;
  total: number;
}

function LocalModelRow({
  busy,
  downloadingThis,
  installed,
  onDelete,
  onDownload,
  onSelect,
  option,
  received,
  selected,
  total,
}: LocalModelRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition",
        selected ? "border-primary bg-primary/5" : "border-border/60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="min-w-0 text-left" disabled={busy} onClick={onSelect} type="button">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium">{option.name}</span>
            {selected && <Badge variant="secondary">{t("memEmb.local.selected")}</Badge>}
            <Badge variant="outline">{t(`memEmb.local.notes.${option.note}` as never)}</Badge>
            {installed?.complete && <Badge variant="secondary">{t("memEmb.local.installed")}</Badge>}
            {installed && !installed.complete && <Badge variant="outline">{t("memEmb.local.incomplete")}</Badge>}
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {t("memEmb.local.dims", { count: option.dimensions })} ·{" "}
            {t("memEmb.local.context", { count: option.contextTokens })} ·{" "}
            {option.multilingual ? t("memEmb.local.multilingual") : t("memEmb.local.englishOnly")}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {t("memEmb.local.cost", {
              disk: formatBytes(option.downloadBytes),
              peak: formatBytes(option.peakBytes),
            })}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {installed && (
            <Button disabled={busy} onClick={onDelete} size="icon-sm" type="button" variant="ghost" title={t("memEmb.local.delete")}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button disabled={busy} onClick={onDownload} size="sm" type="button" variant="ghost">
            {downloadingThis ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {installed ? t("memEmb.local.redownload") : t("memEmb.local.download")}
          </Button>
        </div>
      </div>
      {downloadingThis && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${total > 0 ? Math.min(100, (received / total) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("memEmb.local.downloading", { received: formatBytes(received), total: formatBytes(total) })}
          </p>
        </div>
      )}
    </div>
  );
}
