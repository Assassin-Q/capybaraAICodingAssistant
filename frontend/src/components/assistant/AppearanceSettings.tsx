import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, MonitorCog, Moon, Palette, Save, Sun } from "lucide-react";

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
import { t } from "@/lib/i18n";

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
          <span className="truncate">{selected?.name ?? t("s_eec5699f15")}</span>
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
                  <Check className="size-3" />{t("s_25e74dceac")}
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
      if (!next.success) setError(next.message ?? t("s_02b2602382"));
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
    () => (settings?.themes ?? []).filter((theme) => !theme.dark),
    [settings]
  );
  const darkThemes = useMemo(
    () => (settings?.themes ?? []).filter((theme) => theme.dark),
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
      if (report(result, t("s_3003133194"))) applySettings(result);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <SettingsHeader
        actions={(
          <Button disabled={!dirty || saving || loading} onClick={() => void save()} size="sm" type="button">
            <Save className="size-3.5" />
            {t("s_4a3adda036")}
          </Button>
        )}
        description={t("s_f6fbf8afe8")}
        icon={<Palette className="mt-1 size-5 shrink-0 text-muted-foreground" />}
        loading={loading}
        onRefresh={() => void load()}
        title={t("s_09b58aa342")}
      />

      <SettingsMessage error={error} notice={notice} />

      <div className="divide-y divide-border/60 border-y border-border/60">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Sun className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("s_b535c2a75c")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("s_6111cb9c32")}</p>
            </div>
          </div>
          <ThemePicker disabled={loading} label={t("s_610c7bbdf9")} onChange={setLightThemeId} options={lightThemes} value={lightThemeId} />
        </div>

        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Moon className="mt-0.5 size-4 shrink-0 text-indigo-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("s_79c378557e")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("s_788c2ed500")}</p>
            </div>
          </div>
          <ThemePicker disabled={loading} label={t("s_4324fb09b1")} onChange={setDarkThemeId} options={darkThemes} value={darkThemeId} />
        </div>

        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <MonitorCog className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("s_79895b2c53")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {settings?.syncWithOsSupported ? t("s_18c04b37ea") : t("s_8b94610e14")}
              </p>
            </div>
          </div>
          <Switch
            aria-label={t("s_79895b2c53")}
            checked={syncWithOs}
            disabled={loading || !settings?.syncWithOsSupported}
            onCheckedChange={setSyncWithOs}
          />
        </div>
      </div>

      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", loading && "opacity-60")}>
        <span className={cn("size-2 rounded-full", settings?.theme === "dark" ? "bg-indigo-400" : "bg-amber-500")} />
        {t("s_c12709318b")}{settings?.currentThemeName ?? (loading ? t("s_b21b631cd5") : t("s_d9c32a4c3d"))}
      </div>
    </section>
  );
}
