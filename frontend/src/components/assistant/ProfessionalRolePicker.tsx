import { useState } from "react";
import { BriefcaseBusiness, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AUTO_PROFESSIONAL_ROLE_ID,
  findProfessionalRolePreset,
  professionalRolePresets,
  type ProfessionalRolePreferences,
} from "@/lib/professionalRoles";
import { useAssistantOverlayDismiss } from "@/lib/assistantOverlays";

interface ProfessionalRolePickerProps {
  onChange: (roleId: string) => void;
  preferences: ProfessionalRolePreferences;
}

export function ProfessionalRolePicker({ onChange, preferences }: ProfessionalRolePickerProps) {
  const [open, setOpen] = useState(false);
  useAssistantOverlayDismiss(() => setOpen(false));
  // Preferences saved before this feature existed have no `professionalRoles` key at all,
  // and reading `.enabled` off that undefined crashed the whole composer.
  if (!preferences?.enabled) return null;
  const roles = preferences.roles ?? {};
  const enabledRoles = professionalRolePresets().filter((preset) => roles[preset.id]?.enabled);
  const selected = findProfessionalRolePreset(preferences.selectedRoleId);
  const label = selected && roles[selected.id]?.enabled ? selected.name : t("s_13f490e30b");
  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("s_080edd40af", { p0: label })} className="h-7 max-w-36 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground" title={t("s_080edd40af", { p0: label })} type="button" variant="ghost">
          <BriefcaseBusiness className="size-3.5" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("s_7d6b576c8e")}</DropdownMenuLabel>
        <DropdownMenuItem className="items-start focus:bg-transparent focus-visible:bg-accent hover:bg-accent" onSelect={() => onChange(AUTO_PROFESSIONAL_ROLE_ID)}>
          <BriefcaseBusiness className="mt-0.5 size-3.5" />
          <span className="min-w-0 flex-1"><span className="block text-sm">{t("s_13f490e30b")}</span><span className="block text-xs text-muted-foreground">{t("s_09d76e0d9e")}</span></span>
          {preferences.selectedRoleId === AUTO_PROFESSIONAL_ROLE_ID && <Check className="mt-0.5 size-3.5" />}
        </DropdownMenuItem>
        {enabledRoles.length > 0 && <DropdownMenuSeparator />}
        {enabledRoles.map((preset) => (
          <DropdownMenuItem className="items-start focus:bg-transparent focus-visible:bg-accent hover:bg-accent" key={preset.id} onSelect={() => onChange(preset.id)}>
            <span className="min-w-0 flex-1"><span className="block text-sm">{preset.name}</span><span className="block max-w-64 text-xs text-muted-foreground">{preset.description}</span></span>
            {preferences.selectedRoleId === preset.id && <Check className="mt-0.5 size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
