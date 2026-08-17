import { Languages } from "lucide-react";

import { SettingsHeader } from "@/components/assistant/settingsShared";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { detectLocale, resolveLocale, setLocale, type LocalePreference } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSettingsProps {
  onChange: (language: LocalePreference) => void;
  value: LocalePreference;
}

/**
 * Language choice, with an explicit "follow the IDE" option.
 *
 * `auto` is the default so a Chinese IDE opens in Chinese and everything else in English without
 * anyone configuring it; picking a language pins it, and that choice then outranks the environment
 * on every machine the preference travels to.
 */
export function LanguageSettings({ onChange, value }: LanguageSettingsProps) {
  const options: Array<{ id: LocalePreference; label: string; hint: string }> = [
    { id: "auto", label: t("i18n.auto"), hint: t("i18n.autoHint", { p0: detectLocale() === "zh" ? "中文" : "English" }) },
    { id: "zh", label: "中文", hint: t("i18n.zhHint") },
    { id: "en", label: "English", hint: t("i18n.enHint") },
  ];

  return (
    <section className="flex flex-col gap-5">
      <SettingsHeader
        description={t("i18n.description")}
        icon={<Languages className="mt-1 size-5 shrink-0 text-muted-foreground" />}
        title={t("i18n.title")}
      />
      <div className="grid gap-1 rounded-md bg-muted/45 p-1 sm:grid-cols-3">
        {options.map((option) => (
          <Button
            aria-pressed={value === option.id}
            className={cn("h-auto min-h-12 justify-start px-3 py-2 text-left font-normal", value === option.id && "bg-background shadow-sm hover:bg-background")}
            key={option.id}
            onClick={() => {
              onChange(option.id);
              // Applied immediately: waiting for a save button would leave the page describing a
              // language it is not currently showing.
              setLocale(resolveLocale(option.id));
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium">{option.label}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{option.hint}</span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
