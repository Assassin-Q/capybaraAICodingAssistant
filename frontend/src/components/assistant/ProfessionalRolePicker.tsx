import { BriefcaseBusiness, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  PROFESSIONAL_ROLE_PRESETS,
  type ProfessionalRolePreferences,
} from "@/lib/professionalRoles";

interface ProfessionalRolePickerProps {
  onChange: (roleId: string) => void;
  preferences: ProfessionalRolePreferences;
}

export function ProfessionalRolePicker({ onChange, preferences }: ProfessionalRolePickerProps) {
  if (!preferences.enabled) return null;
  const enabledRoles = PROFESSIONAL_ROLE_PRESETS.filter((preset) => preferences.roles[preset.id]?.enabled);
  const selected = findProfessionalRolePreset(preferences.selectedRoleId);
  const label = selected && preferences.roles[selected.id]?.enabled ? selected.name : "自动角色";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`专业角色：${label}`} className="h-7 max-w-36 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground" title={`专业角色：${label}`} type="button" variant="ghost">
          <BriefcaseBusiness className="size-3.5" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">专业角色</DropdownMenuLabel>
        <DropdownMenuItem className="items-start focus:bg-transparent focus-visible:bg-accent hover:bg-accent" onSelect={() => onChange(AUTO_PROFESSIONAL_ROLE_ID)}>
          <BriefcaseBusiness className="mt-0.5 size-3.5" />
          <span className="min-w-0 flex-1"><span className="block text-sm">自动角色</span><span className="block text-xs text-muted-foreground">由模型根据任务自行判断</span></span>
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
