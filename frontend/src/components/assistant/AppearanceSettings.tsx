import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, MonitorCog, Moon, Save, Sun } from "lucide-react";

import { SettingsHeader, SettingsMessage, useSettingsFeedback } from "@/components/assistant/settingsShared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/components/assistant/shared";
import { ideaApi, type IdeaThemeOption, type IdeaThemeSettings } from "@/lib/idea";
import { cn } from "@/lib/utils";

interface ThemePickerProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: IdeaThemeOption[];
  value: string;
}

function ThemePicker({ disabled, label, onChange, options, value }: ThemePickerProps) {
  const selected = options.find((theme) => theme.id === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="h-9 min-w-0 max-w-full justify-between gap-2 border-border/60 px-3 font-normal sm:w-52"
          disabled={disabled || options.length === 0}
          type="button"
          variant="outline"
        >
          <span className="truncate">{selected?.name ?? "没有可用主题"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 min-w-52"
      >
        <DropdownMenuRadioGroup onValueChange={onChange} value={value}>
          {options.map((theme) => (
            <DropdownMenuRadioItem
              className="min-h-9 focus:bg-transparent focus-visible:bg-accent hover:bg-accent"
              key={theme.id}
              value={theme.id}
            >
              <span className="min-w-0 flex-1 truncate">{theme.name}</span>
              {theme.current && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Check className="size-3" />当前
                </span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppearanceSettings() {
  const [settings, setSettings] = useState<IdeaThemeSettings>();
  const [lightThemeId, setLightThemeId] = useState("");
  const [darkThemeId, setDarkThemeId] = useState("");
  const [syncWithOs, setSyncWithOs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { error, notice, report, reset, setError } = useSettingsFeedback();

  const applySettings = useCallback((next: IdeaThemeSettings) => {
    setSettings(next);
    setLightThemeId(next.lightThemeId ?? "");
    setDarkThemeId(next.darkThemeId ?? "");
    setSyncWithOs(next.syncWithOs);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    reset();
    try {
      const next = await ideaApi.getIdeaThemeSettings();
      applySettings(next);
      if (!next.success) setError(next.message ?? "读取 IDEA 主题失败");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [applySettings, reset, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const lightThemes = useMemo(
    () => settings?.themes.filter((theme) => !theme.dark) ?? [],
    [settings]
  );
  const darkThemes = useMemo(
    () => settings?.themes.filter((theme) => theme.dark) ?? [],
    [settings]
  );
  const dirty = Boolean(settings) && (
    lightThemeId !== settings?.lightThemeId ||
    darkThemeId !== settings?.darkThemeId ||
    syncWithOs !== settings?.syncWithOs
  );

  const save = async () => {
    if (!lightThemeId || !darkThemeId) return;
    setSaving(true);
    reset();
    try {
      const result = await ideaApi.updateIdeaThemeSettings({ darkThemeId, lightThemeId, syncWithOs });
      if (report(result, "主题映射已保存")) applySettings(result);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <SettingsHeader
        actions={(
          <Button disabled={!dirty || saving || loading} onClick={() => void save()} size="sm" type="button">
            <Save className="size-3.5" />
            保存映射
          </Button>
        )}
        description="为插件的明亮和暗色模式指定 IDEA 已安装主题。"
        loading={loading}
        onRefresh={() => void load()}
        title="外观"
      />

      <SettingsMessage error={error} notice={notice} />

      <div className="divide-y divide-border/60 border-y border-border/60">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Sun className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium">插件明亮模式</p>
              <p className="mt-0.5 text-xs text-muted-foreground">同时应用到 IDEA 的明亮主题</p>
            </div>
          </div>
          <ThemePicker disabled={loading} label="选择 IDEA 明亮主题" onChange={setLightThemeId} options={lightThemes} value={lightThemeId} />
        </div>

        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Moon className="mt-0.5 size-4 shrink-0 text-indigo-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium">插件暗色模式</p>
              <p className="mt-0.5 text-xs text-muted-foreground">同时应用到 IDEA 的暗色主题</p>
            </div>
          </div>
          <ThemePicker disabled={loading} label="选择 IDEA 暗色主题" onChange={setDarkThemeId} options={darkThemes} value={darkThemeId} />
        </div>

        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <MonitorCog className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">跟随系统明暗模式</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {settings?.syncWithOsSupported ? "系统变化时使用上面的 IDEA 主题映射" : "当前 IDEA 运行环境不支持自动跟随"}
              </p>
            </div>
          </div>
          <Switch
            aria-label="跟随系统明暗模式"
            checked={syncWithOs}
            disabled={loading || !settings?.syncWithOsSupported}
            onCheckedChange={setSyncWithOs}
          />
        </div>
      </div>

      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", loading && "opacity-60")}>
        <span className={cn("size-2 rounded-full", settings?.theme === "dark" ? "bg-indigo-400" : "bg-amber-500")} />
        当前 IDEA 主题：{settings?.currentThemeName ?? (loading ? "读取中" : "未知")}
      </div>
    </section>
  );
}
