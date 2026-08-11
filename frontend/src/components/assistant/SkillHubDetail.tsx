import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, Download, ExternalLink, FileText, KeyRound, ShieldCheck, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownResponse } from "@/components/assistant/MarkdownResponse";
import { errorMessage } from "@/components/assistant/shared";
import { skillsApi } from "@/lib/ideaIntegrations";
import type { SkillHubDetail, SkillHubTraceDimension } from "@/lib/ideaIntegrations";
import type { ManagedScope } from "@/lib/ideaIntegrations";
import { cn } from "@/lib/utils";
import { getLocale, t } from "@/lib/i18n";

const compact = (): Intl.NumberFormat =>
  new Intl.NumberFormat(getLocale() === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  });

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const tabs = () => [
  { id: "overview", label: t("s_153042ed9e") },
  { id: "files", label: t("s_49deaf7da2") },
  { id: "versions", label: t("s_8770418ba3") },
  { id: "trace", label: t("s_7f68264e69") },
] as const;

type TabID = ReturnType<typeof tabs>[number]["id"];

const formatDate = (value: number): string =>
  value > 0 ? new Date(value).toLocaleDateString("zh-CN") : "—";

const formatSize = (bytes: number): string =>
  bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;

/** SkillHub grades 1–5; the site colours the bar per dimension rather than per score. */
const dimensionColor: Record<string, string> = {
  adaptability: "bg-amber-500",
  convention: "bg-violet-500",
  effectiveness: "bg-rose-500",
  reliability: "bg-blue-500",
  trust: "bg-emerald-500",
};

function TraceDimension({ dimension }: { dimension: SkillHubTraceDimension }) {
  return (
    <div className="border-b border-border/40 px-3 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{dimension.label}</span>
        <span className="ml-auto font-mono text-xs tabular-nums">{dimension.score.toFixed(1)}<span className="text-muted-foreground"> /5</span></span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", dimensionColor[dimension.key] ?? "bg-primary")}
          style={{ width: `${Math.min(100, (dimension.score / 5) * 100)}%` }}
        />
      </div>
      {dimension.reason && (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{dimension.reason}</p>
      )}
    </div>
  );
}

export function SkillHubDetailView({
  busy,
  installedVersion,
  namespace,
  onBack,
  onInstall,
  slug,
}: {
  busy: boolean;
  /** Version already on disk, if this skill is installed — marks the matching row in 版本历史. */
  installedVersion?: string;
  namespace: string;
  onBack: () => void;
  onInstall: (scope: ManagedScope) => void;
  slug: string;
}) {
  const [detail, setDetail] = useState<SkillHubDetail>();
  const [tab, setTab] = useState<TabID>("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  /** Path currently open in the 文件 tab; empty means the tree is showing. */
  const [openPath, setOpenPath] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  /**
   * 概述 keeps its own copy of SKILL.md.
   *
   * Both views used to share openPath/fileText, so the overview auto-opening SKILL.md left the
   * file browser already pointed at a file — opening the 文件 tab dropped the user straight into
   * it instead of showing the tree they came to see.
   */
  const [overviewText, setOverviewText] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void skillsApi
      .hubDetail(slug, namespace)
      .then((next) => {
        if (cancelled) return;
        // Treat a missing flag as success: the plugin serialises with encodeDefaults=false, so an
        // older build omits it entirely on the happy path.
        if (next.success === false) setError(next.message ?? t("s_83f79675f8"));
        else setDetail(next);
      })
      .catch((detailError) => {
        if (!cancelled) setError(errorMessage(detailError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [namespace, slug]);

  const openFile = useCallback(async (path: string) => {
    setOpenPath(path);
    setFileLoading(true);
    setFileText("");
    try {
      const content = await skillsApi.hubFile(slug, namespace, path);
      setFileText(content.success === false ? content.message ?? t("s_d9f607a200") : content.text);
    } catch (fileError) {
      setFileText(errorMessage(fileError));
    } finally {
      setFileLoading(false);
    }
  }, [namespace, slug]);

  /**
   * 概述 renders SKILL.md, which is where the actual instructions live.
   *
   * The "already fetching" guard is a ref, not state. As a dependency it deadlocked the effect:
   * setting it re-ran the effect, whose cleanup cancelled the request in flight, so the `finally`
   * skipped clearing the flag and the next run bailed out on it — leaving 正在读取 forever.
   */
  const overviewRequestedFor = useRef("");
  useEffect(() => {
    if (!detail) return;
    const key = `${namespace}/${slug}`;
    if (overviewRequestedFor.current === key) return;
    const entry = detail.files.find((file) => file.path.toLowerCase() === "skill.md");
    if (!entry) return;
    overviewRequestedFor.current = key;
    let cancelled = false;
    setOverviewLoading(true);
    void skillsApi.hubFile(slug, namespace, entry.path)
      .then((result) => {
        if (!cancelled && result.success) setOverviewText(result.text ?? "");
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [detail, namespace, slug]);

  if (loading) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("s_26a7c79c79")}
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error || t("s_87b83b7cce")}</p>
        <Button onClick={onBack} size="sm" type="button" variant="outline">{t("s_53505b1fcd")}</Button>
      </section>
    );
  }

  return (
    // The section itself must not scroll: the footer used to be a sticky child of the scroll
    // container, which floats it over the content instead of sitting below it. Only the tab body
    // scrolls now, so the install bar is always clear of whatever is being read.
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <header className="flex items-start gap-3">
        <Button aria-label={t("s_53505b1fcd")} onClick={onBack} size="icon-sm" type="button" variant="ghost">
          <ArrowLeft className="size-4" />
        </Button>
        {detail.iconUrl
          ? <img alt="" className="size-10 shrink-0 rounded-lg object-cover" src={detail.iconUrl} />
          : <div className="size-10 shrink-0 rounded-lg bg-muted" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{detail.name}</h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {detail.canonicalName || detail.slug}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            {detail.evaluation && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <Star className="size-3 fill-current" />
                {detail.evaluation.overall.toFixed(1)}
                <span className="font-normal text-muted-foreground">{t("s_71ad1d5ce5")}</span>
              </span>
            )}
            {detail.security.map((report) => (
              <span
                className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                key={report.lab}
                title={`${report.lab}：${report.statusText}`}
              >
                <ShieldCheck className="size-3" />
                {report.statusText || report.status}
              </span>
            ))}
          </div>
        </div>
      </header>

      <p className="whitespace-pre-wrap text-sm leading-6">{detail.description || t("s_7e73fb8978")}</p>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {detail.subCategories.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}
        {detail.version && <Badge variant="outline">v{detail.version}</Badge>}
        {detail.requiresApiKey && (
          <Badge variant="outline"><KeyRound className="size-3" />{t("s_8e12c97a7a")}</Badge>
        )}
        <span className="text-muted-foreground">{t("s_1e1ed72b9a")} {formatDate(detail.updatedAt)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/35 px-3 py-2 text-center">
        <div><p className="text-[10px] text-muted-foreground">{t("s_2b9d013177")}</p><p className="font-mono text-sm">{compact().format(detail.downloads)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">{t("s_d07cee786a")}</p><p className="font-mono text-sm">{compact().format(detail.stars)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">{t("s_087db63ab1")}</p><p className="font-mono text-sm">{compact().format(detail.installs)}</p></div>
      </div>

      <nav className="flex shrink-0 gap-1 border-b border-border/50">
        {tabs().map((entry) => (
          <button
            className={cn(
              "border-b-2 px-3 py-1.5 text-xs transition-colors",
              tab === entry.id
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            key={entry.id}
            onClick={() => {
              setTab(entry.id);
              if (entry.id !== "files") setOpenPath("");
            }}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="min-h-32 min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" && (
          overviewLoading
            ? <p className="py-6 text-center text-xs text-muted-foreground">{t("s_63ed6869b5")}</p>
            : overviewText
              ? <MarkdownResponse>{overviewText}</MarkdownResponse>
              : <p className="py-6 text-center text-xs text-muted-foreground">{t("s_dd58c36470")}</p>
        )}

        {tab === "files" && (openPath ? (
          <div className="rounded-md border border-border/50">
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
              <Button className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => setOpenPath("")} size="sm" type="button" variant="ghost">
                <ChevronLeft className="size-3" />{t("s_b3dd0b880c")}
              </Button>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{openPath}</span>
            </div>
            <div className="max-h-96 overflow-auto px-3 py-2">
              {fileLoading
                ? <p className="text-xs text-muted-foreground">{t("s_fcabadb2a7")}</p>
                : <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5">{fileText}</pre>}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border/50">
            <p className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
              {t("s_3b6ef811b8")} {detail.files.length} {t("s_6218629ae2")}
            </p>
            {detail.files.map((file) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/50"
                key={file.path}
                onClick={() => void openFile(file.path)}
                type="button"
              >
                <FileText className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatSize(file.size)}</span>
              </button>
            ))}
          </div>
        ))}

        {tab === "versions" && (
          <div className="rounded-md border border-border/50">
            {detail.versions.length === 0
              ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("s_df844966a8")}</p>
              : detail.versions.map((version) => (
                <div className="border-b border-border/40 px-3 py-2.5 last:border-b-0" key={version.version}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">v{version.version}</span>
                    {version.latest && <Badge variant="secondary">{t("s_7e805a1230")}</Badge>}
                    {/* Comparison ignores a leading v so "v1.1.9" and "1.1.9" are the same release. */}
                    {installedVersion
                      && version.version.replace(/^v/i, "") === installedVersion.replace(/^v/i, "")
                      && <Badge className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400" variant="outline">{t("s_e3277e9f89")}</Badge>}
                    <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(version.createdAt)}</span>
                  </div>
                  {version.changelog && (
                    <p className="mt-1 border-l-2 border-border pl-2 text-[11px] text-muted-foreground">
                      {version.changelog}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        {tab === "trace" && (detail.evaluation ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border/50 bg-muted/25 px-3 py-2.5">
              <p className="text-[11px] leading-5 text-muted-foreground">
                {t("s_8d31559f70")}
              </p>
            </div>
            <div className="flex items-baseline gap-2 px-1">
              <span className="text-3xl font-semibold">{detail.evaluation.overall.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/ 5</span>
            </div>
            {detail.evaluation.userSummary && (
              <p className="px-1 text-xs leading-6">{detail.evaluation.userSummary}</p>
            )}
            <div className="rounded-md border border-border/50">
              {detail.evaluation.dimensions.map((dimension) => (
                <TraceDimension dimension={dimension} key={dimension.key} />
              ))}
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("s_c228120fb4")}</p>
        ))}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/50 bg-background pt-3">
        <Button disabled={busy} onClick={() => onInstall("project")} size="sm" type="button">
          <Download className="size-3.5" />{t("s_fce92787ed")}
        </Button>
        <Button disabled={busy} onClick={() => onInstall("global")} size="sm" type="button" variant="outline">
          <Download className="size-3.5" />{t("s_268643e9a1")}
        </Button>
        {detail.homepage && (
          <a
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            href={detail.homepage}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-3" />{t("s_0ffa426624")}
          </a>
        )}
      </footer>
    </section>
  );
}
