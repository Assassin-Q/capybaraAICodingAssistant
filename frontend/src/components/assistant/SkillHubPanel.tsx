import { useCallback, useEffect, useState } from "react";
import { CloudDownload, PackageOpen, Search, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  SettingsHeader,
  SettingsMessage,
  useSettingsFeedback,
} from "@/components/assistant/settingsShared";
import { errorMessage } from "@/components/assistant/shared";
import { skillsApi, type ManagedScope, type SkillHubSkill, type SkillHubStatus } from "@/lib/ideaIntegrations";

interface SkillHubPanelProps {
  onInstalled: () => void;
}

const limitOptions = ["10", "20", "50"];

export function SkillHubPanel({ onInstalled }: SkillHubPanelProps) {
  const [status, setStatus] = useState<SkillHubStatus>();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("20");
  const [scope, setScope] = useState<ManagedScope>("project");
  const [results, setResults] = useState<SkillHubSkill[]>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const { error, notice, report, setError, setNotice } = useSettingsFeedback();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await skillsApi.hubStatus());
      setError("");
    } catch (statusError) {
      setError(errorMessage(statusError));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const search = async () => {
    if (!query.trim()) {
      setError("请输入搜索关键词");
      return;
    }
    setBusy(true);
    try {
      const response = await skillsApi.searchHub(query.trim(), Number(limit));
      if (!response.success) {
        setResults(undefined);
        setError(response.message ?? "SkillHub 搜索失败");
        return;
      }
      setError("");
      setNotice("");
      setResults(response.results);
    } catch (searchError) {
      setError(errorMessage(searchError));
    } finally {
      setBusy(false);
    }
  };

  const install = async (skill: SkillHubSkill) => {
    setBusy(true);
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
      setBusy(false);
    }
  };

  const ready = status?.available === true;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <SettingsHeader
        description="直接调用 SkillHub 的搜索与下载接口安装技能，不需要 Python、Git Bash 或 SkillHub CLI。"
        loading={loading}
        onRefresh={() => void refreshStatus()}
        title="SkillHub"
      />

      <SettingsMessage error={error} notice={notice} />

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/50 bg-card/60 px-4 py-3">
        {ready ? (
          <Wifi className="size-4 text-emerald-500" />
        ) : (
          <WifiOff className="size-4 text-muted-foreground" />
        )}
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">{ready ? "SkillHub 可用" : "无法连接 SkillHub"}</p>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">
            {status?.message ?? status?.endpoint ?? "正在检测…"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            disabled={!ready}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
            placeholder="搜索 SkillHub 技能..."
            value={query}
          />
        </div>
        <Select onValueChange={setLimit} value={limit}>
          <SelectTrigger aria-label="结果数量" className="h-9 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {limitOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={(value) => setScope(value as ManagedScope)} value={scope}>
          <SelectTrigger aria-label="安装范围" className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">安装到项目</SelectItem>
            <SelectItem value="global">安装到全局</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={!ready || busy} onClick={() => void search()} size="sm" type="button">
          <Search className="size-3.5" />
          搜索
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10">
        {results === undefined ? (
          <EmptyState icon={<Search className="size-5" />}>
            {ready ? "输入关键词后开始搜索" : "SkillHub 暂时不可达"}
          </EmptyState>
        ) : results.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-5" />}>没有找到匹配的技能</EmptyState>
        ) : (
          results.map((skill) => (
            <article
              className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-b-0"
              key={`${skill.source ?? "community"}-${skill.slug}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{skill.name ?? skill.slug}</h3>
                  <Badge variant="outline">{skill.slug}</Badge>
                  {skill.version && <Badge variant="secondary">{skill.version}</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {skill.description ?? "未提供介绍"}
                </p>
              </div>
              <Button disabled={busy} onClick={() => void install(skill)} size="sm" type="button" variant="outline">
                <CloudDownload className="size-3.5" />
                安装
              </Button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
