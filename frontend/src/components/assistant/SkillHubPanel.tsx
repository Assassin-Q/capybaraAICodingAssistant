import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CloudDownload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  KeyRound,
  PackageOpen,
  Search,
  Star,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SkillHubDetailView } from "@/components/assistant/SkillHubDetail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  SettingsHeader,
  SettingsMessage,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import {
  skillsApi,
  type ManagedScope,
  type SkillHubSearchRequest,
  type SkillHubSkill,
  type SkillHubStatus,
  type ManagedSkillInfo,
} from "@/lib/ideaIntegrations";
import { cn } from "@/lib/utils";

interface SkillHubPanelProps {
  onInstalled: () => void;
}

interface FilterMenuProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterMenu({ label, value, options, onChange }: FilterMenuProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={label} className="h-7 max-w-32 gap-1 px-2 text-[11px]" size="sm" type="button" variant="outline">
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 min-w-36 text-xs">
        <DropdownMenuRadioGroup onValueChange={onChange} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mirrors SkillHub's own scene categories. */
const categoryLabels: Record<string, string> = {
  "ai-agent": "AI Agent",
  "business-ops": "商业运营",
  "content-creation": "内容创作",
  "data-analysis": "数据分析",
  "design-media": "设计多媒体",
  "dev-programming": "开发编程",
  "it-ops-security": "IT 运维安全",
  "knowledge-management": "知识管理",
  "office-efficiency": "办公效率",
  professional: "专业领域",
};

const sourceLabels: Record<string, string> = {
  clawhub: "SkillHub",
  community: "社区",
  enterprise: "企业",
};

/**
 * Only the orderings the listing endpoint actually accepts. `GET /api/skills` answers anything
 * else with `400 参数错误：sortBy 不支持（updated_at/downloads/stars/installs/score）`, so
 * SkillHub's own 推荐精选 (`curated_score`) and 近期飙升 (`rank`) are absent rather than faked.
 */
const sortOptions = [
  { id: "score", label: "全部" },
  { id: "downloads", label: "下载量" },
  { id: "stars", label: "收藏量" },
  { id: "installs", label: "安装量" },
  { id: "updated_at", label: "最近上新" },
] as const;

type SortId = typeof sortOptions[number]["id"];

const compact = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1, notation: "compact" });

function SkillIcon({ skill }: { skill: SkillHubSkill }) {
  const [failed, setFailed] = useState(false);
  if (!skill.iconUrl || failed) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
        {(skill.name ?? skill.slug).slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      alt=""
      className="size-9 shrink-0 rounded-lg object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
      src={skill.iconUrl}
    />
  );
}

export function SkillHubPanel({ onInstalled }: SkillHubPanelProps) {
  const [status, setStatus] = useState<SkillHubStatus>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("score");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [apiKey, setApiKey] = useState("all");
  const [results, setResults] = useState<SkillHubSkill[]>();
  const [page, setPage] = useState(1);
  /** What is already on disk, so the detail view can point at the installed release. */
  const [installed, setInstalled] = useState<ManagedSkillInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<SkillHubSkill>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const { error, notice, report, setError, setNotice } = useSettingsFeedback();

  /** Empty query returns SkillHub's default listing, so the page is never blank on entry. */
  const load = useCallback(
    async (searchQuery: string, nextPage = 1, overrides: Partial<SkillHubSearchRequest> = {}) => {
      setLoading(true);
      try {
        const response = await skillsApi.searchHub({
          category,
          limit: 20,
          order,
          page: nextPage,
          query: searchQuery.trim(),
          requiresApiKey: apiKey === "all" ? undefined : apiKey === "required",
          sortBy: sort,
          source,
          ...overrides,
        });
        if (!response.success) {
          setResults(undefined);
          setError(response.message ?? "SkillHub 请求失败");
          return;
        }
        setResults(response.results);
        // Falls back to what was asked for: a server that omits the echo must not be able to
        // knock the pager into NaN, which is exactly what happened when the field was dropped.
        setPage(response.page || nextPage);
        setTotal(response.total);
        setError("");
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [apiKey, category, order, setError, sort, source]
  );

  useEffect(() => {
    void skillsApi.list().then(setInstalled).catch(() => setInstalled([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void skillsApi
      .hubStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        if (next.available) void load("", 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const categories = Object.keys(categoryLabels);
  const sources = Object.keys(sourceLabels);
  const visible = results ?? [];
  const pageCount = Math.max(1, Math.ceil(total / 20));

  /**
   * The locally installed release of a hub skill, if any.
   *
   * Matched by name rather than slug: the hub keys entries by "@owner/slug" while the installed
   * copy only knows the name from its own SKILL.md, which is what the install writes to disk.
   */
  const installedVersion = (skill: SkillHubSkill): string | undefined => {
    const wanted = (skill.name ?? skill.publicSlug ?? skill.slug).split("/").pop()?.toLowerCase();
    if (!wanted) return undefined;
    return installed.find((item) => item.name.toLowerCase() === wanted)?.version;
  };

  const install = async (skill: SkillHubSkill, scope: ManagedScope) => {
    setBusy(skill.slug);
    setNotice(`正在下载 ${skill.slug}…`);
    try {
      const result = await skillsApi.installFromHub({
        coordinate: skill.publicSlug ?? skill.slug,
        overwrite: false,
        scope,
      });
      if (report(result, `已安装 ${skill.slug}`)) onInstalled();
    } catch (installError) {
      setNotice("");
      setError(errorMessage(installError));
    } finally {
      setBusy("");
    }
  };

  const ready = status?.available === true;

  if (detail) {
    return (
      <SkillHubDetailView
        busy={busy !== ""}
        installedVersion={installedVersion(detail)}
        namespace={detail.namespaceHandle ?? detail.owner ?? ""}
        onBack={() => setDetail(undefined)}
        onInstall={(scope: ManagedScope) => void install(detail, scope)}
        slug={detail.publicSlug ?? detail.slug}
      />
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <SettingsHeader
        description="数据来源：腾讯 SkillHub"
        loading={loading}
        onRefresh={() => void load(query)}
        title="SkillHub"
      />

      <SettingsMessage error={error} notice={notice} />

      {!ready && (
        <div className="flex items-center gap-3 rounded-md border border-border/50 bg-card/60 px-4 py-3">
          <WifiOff className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">无法连接 SkillHub</p>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">{status?.message ?? "正在检测…"}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            disabled={!ready}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load(query);
            }}
            placeholder="搜索技能，留空查看全部"
            value={query}
          />
        </div>
        <Button disabled={!ready || loading} onClick={() => void load(query)} size="sm" type="button">
          <Search className="size-3.5" />
          搜索
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {sortOptions.map((option) => (
          <Button
            className="h-7 px-2 text-[11px]"
            key={option.id}
            onClick={() => {
              setSort(option.id);
              void load(query, 1, { sortBy: option.id });
            }}
            size="sm"
            type="button"
            variant={sort === option.id ? "secondary" : "ghost"}
          >
            {option.label}
          </Button>
        ))}
        <Button
          aria-label={order === "desc" ? "当前为降序，点击切换升序" : "当前为升序，点击切换降序"}
          onClick={() => {
            const nextOrder = order === "desc" ? "asc" : "desc";
            setOrder(nextOrder);
            void load(query, 1, { order: nextOrder });
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {order === "desc" ? <ArrowDownWideNarrow className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}
          {order === "desc" ? "降序" : "升序"}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <FilterMenu
            label="场景分类"
            onChange={(value) => {
              setCategory(value);
              void load(query, 1, { category: value });
            }}
            options={[{ value: "all", label: "所有场景分类" }, ...categories.map((value) => ({
              value,
              label: categoryLabels[value] ?? value,
            }))]}
            value={category}
          />
          <FilterMenu
            label="来源"
            onChange={(value) => {
              setSource(value);
              void load(query, 1, { source: value });
            }}
            options={[{ value: "all", label: "所有来源" }, ...sources.map((value) => ({
              value,
              label: sourceLabels[value] ?? value,
            }))]}
            value={source}
          />
          <FilterMenu
            label="API Key"
            onChange={(value) => {
              setApiKey(value);
              void load(query, 1, {
                requiresApiKey: value === "all" ? undefined : value === "required",
              });
            }}
            options={[
              { value: "all", label: "不限 API Key" },
              { value: "none", label: "无需 API Key" },
              { value: "required", label: "需配置 API Key" },
            ]}
            value={apiKey}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10">
        {results === undefined ? (
          <EmptyState icon={<Wifi className="size-5" />}>{ready ? "正在加载技能…" : "SkillHub 暂时不可达"}</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-5" />}>没有符合条件的技能</EmptyState>
        ) : (
          visible.map((skill) => (
            <article
              className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-accent/40"
              key={`${skill.source ?? "community"}-${skill.slug}`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setDetail(skill)}
                title="查看详情"
                type="button"
              >
                <SkillIcon skill={skill} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-sm font-medium">{skill.name ?? skill.slug}</h3>
                    {skill.category && (
                      <Badge variant="secondary">{categoryLabels[skill.category] ?? skill.category}</Badge>
                    )}
                    {skill.requiresApiKey && (
                      <Badge variant="outline">
                        <KeyRound className="size-3" />
                        需 API Key
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {skill.description ?? "未提供介绍"}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-0.5">
                  <Star className="size-2.5" />
                  {compact.format(skill.stars)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Download className="size-2.5" />
                  {compact.format(skill.downloads)}
                </span>
              </div>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={`安装 ${skill.name ?? skill.slug}`}
                    className={cn("h-8 w-24 shrink-0 gap-1 text-xs", busy === skill.slug && "opacity-60")}
                    disabled={busy !== ""}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <CloudDownload className="size-3.5" />
                    {busy === skill.slug ? "安装中" : "安装"}
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void install(skill, "project")}>安装到项目</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void install(skill, "global")}>安装到全局</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </article>
          ))
        )}
      </div>
      {results !== undefined && total > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            共 {total.toLocaleString("zh-CN")} 个技能，第 {page}/{pageCount} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="上一页"
              disabled={loading || page <= 1}
              onClick={() => void load(query, page - 1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              aria-label="下一页"
              disabled={loading || page >= pageCount}
              onClick={() => void load(query, page + 1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
