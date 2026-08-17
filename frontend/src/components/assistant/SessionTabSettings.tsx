import { MessagesSquare } from "lucide-react";

import { SettingsHeader } from "@/components/assistant/settingsShared";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SessionTabPreferences } from "@/lib/preferences";
import { t } from "@/lib/i18n";

export function SessionTabSettings({
  onChange,
  value,
}: {
  onChange: (value: SessionTabPreferences) => void;
  value: SessionTabPreferences;
}) {
  return (
    <section className="flex flex-col gap-5">
      <SettingsHeader
        actions={<Switch aria-label={t("tabs.multiMode")} checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />}
        description={t("tabs.settingsHint")}
        icon={<MessagesSquare className="mt-1 size-5 shrink-0 text-muted-foreground" />}
        title={t("tabs.settingsTitle")}
      />

      <div className="grid gap-4 border-y border-border/60 py-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-xs font-medium">
          <span>{t("tabs.maxOpen")}</span>
          <div className="flex items-center gap-2">
            <Input
              className="h-8"
              disabled={!value.enabled || value.maxOpen === null}
              inputMode="numeric"
              max={50}
              min={2}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) onChange({ ...value, maxOpen: Math.max(2, Math.min(50, Math.round(parsed))) });
              }}
              type="number"
              value={value.maxOpen ?? ""}
            />
            <div className="flex shrink-0 items-center gap-1.5 font-normal text-muted-foreground">
              <Switch
                checked={value.maxOpen === null}
                disabled={!value.enabled}
                onCheckedChange={(unlimited) => onChange({ ...value, maxOpen: unlimited ? null : 8 })}
              />
              {t("tabs.unlimited")}
            </div>
          </div>
        </div>
        <div className="grid gap-1.5 text-xs font-medium">
          <span>{t("tabs.atLimit")}</span>
          <Select
            disabled={!value.enabled || value.maxOpen === null}
            onValueChange={(overflow) => onChange({ ...value, overflow: overflow as SessionTabPreferences["overflow"] })}
            value={value.overflow}
          >
            <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prompt">{t("tabs.promptToClose")}</SelectItem>
              <SelectItem value="replace-oldest">{t("tabs.replaceOldest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{t("tabs.closeExplanation")}</p>
    </section>
  );
}
