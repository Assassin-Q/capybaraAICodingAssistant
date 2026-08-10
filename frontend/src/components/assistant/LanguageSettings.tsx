import { Languages } from "lucide-react";

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
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <Languages className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t("i18n.title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("i18n.description")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            className={cn("h-auto flex-1 justify-start gap-0 px-3 py-2 text-left", value === option.id && "ring-1 ring-ring/50")}
            key={option.id}
            onClick={() => {
              onChange(option.id);
              // Applied immediately: waiting for a save button would leave the page describing a
              // language it is not currently showing.
              setLocale(resolveLocale(option.id));
            }}
            size="sm"
            type="button"
            variant={value === option.id ? "secondary" : "outline"}
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
