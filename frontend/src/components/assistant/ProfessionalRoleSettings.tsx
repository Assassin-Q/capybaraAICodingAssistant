import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Check, CheckCircle2, ChevronDown, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PROFESSIONAL_ROLE_PRESETS,
  type ProfessionalRoleConfig,
  type ProfessionalRolePreferences,
} from "@/lib/professionalRoles";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { SkillInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";

interface ProfessionalRoleSettingsProps {
  mcpNames: string[];
  onSave: (preferences: WorkspacePreferences) => WorkspacePreferences;
  preferences: WorkspacePreferences;
  skills: SkillInfo[];
}

interface AssociationOption {
  description?: string;
  value: string;
}

interface AssociationPickerProps {
  emptyLabel: string;
  label: string;
  onChange: (values: string[]) => void;
  options: AssociationOption[];
  placeholder: string;
  values: string[];
}

function AssociationPicker({ emptyLabel, label, onChange, options, placeholder, values }: AssociationPickerProps) {
  const selected = new Set(values);
  const toggle = (value: string) => onChange(
    selected.has(value) ? values.filter((item) => item !== value) : [...values, value]
  );
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="h-9 min-w-0 justify-between px-3 font-normal" type="button" variant="outline">
            <span className="truncate text-xs">{values.length > 0 ? `已关联 ${values.length} 项` : placeholder}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={`搜索${label}`} />
            <CommandList className="max-h-64">
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.value} onSelect={() => toggle(option.value)} value={`${option.value} ${option.description ?? ""}`}>
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm border border-border/70", selected.has(option.value) && "border-foreground/30 bg-foreground text-background")}>
                      {selected.has(option.value) && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{option.value}</span>
                      {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {values.length > 0 && <p className="truncate text-[11px] text-muted-foreground">{values.join("、")}</p>}
    </div>
  );
}

export function ProfessionalRoleSettings({ mcpNames, onSave, preferences, skills }: ProfessionalRoleSettingsProps) {
  const [roles, setRoles] = useState(preferences.professionalRoles);
  const [selectedId, setSelectedId] = useState(PROFESSIONAL_ROLE_PRESETS[0].id);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRoles(preferences.professionalRoles);
  }, [preferences.professionalRoles]);

  const selectedPreset = PROFESSIONAL_ROLE_PRESETS.find((preset) => preset.id === selectedId)
    ?? PROFESSIONAL_ROLE_PRESETS[0];
  const selectedRole = roles.roles[selectedPreset.id];
  const skillOptions = useMemo(() => skills
    .filter((skill, index, values) => values.findIndex((candidate) => candidate.name === skill.name) === index)
    .map((skill) => ({ description: skill.description, value: skill.name }))
    .sort((left, right) => left.value.localeCompare(right.value)), [skills]);
  const mcpOptions = useMemo(() => mcpNames.map((name) => ({ value: name })).sort((left, right) => left.value.localeCompare(right.value)), [mcpNames]);
  const dirty = JSON.stringify(roles) !== JSON.stringify(preferences.professionalRoles);

  const update = (changes: Partial<ProfessionalRolePreferences>) => {
    setSaved(false);
    setRoles((current) => ({ ...current, ...changes }));
  };
  const updateRole = (changes: Partial<ProfessionalRoleConfig>) => {
    setSaved(false);
    setRoles((current) => ({
      ...current,
      roles: {
        ...current.roles,
        [selectedPreset.id]: { ...current.roles[selectedPreset.id], ...changes },
      },
    }));
  };
  const save = () => {
    const availableSkills = new Set(skillOptions.map((option) => option.value));
    const availableMcps = new Set(mcpOptions.map((option) => option.value));
    const cleanedRoles = Object.fromEntries(Object.entries(roles.roles).map(([id, role]) => [id, {
      ...role,
      mcpNames: role.mcpNames.filter((name) => availableMcps.has(name)),
      skillNames: role.skillNames.filter((name) => availableSkills.has(name)),
    }]));
    const selectedRoleEnabled = roles.selectedRoleId === "auto" || roles.roles[roles.selectedRoleId]?.enabled;
    const normalized = {
      ...roles,
      roles: cleanedRoles,
      selectedRoleId: selectedRoleEnabled ? roles.selectedRoleId : "auto",
    };
    const next = onSave({ ...preferences, professionalRoles: normalized });
    setRoles(next.professionalRoles);
    setSaved(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex size-9 items-center justify-center rounded-md bg-muted"><BriefcaseBusiness className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">启用专业角色</p>
          <p className="mt-0.5 text-xs text-muted-foreground">启用后，对话输入框底部才会显示角色选择器。</p>
        </div>
        <Switch aria-label="启用专业角色" checked={roles.enabled} onCheckedChange={(enabled) => update({ enabled })} />
      </div>

      <div className="grid min-h-0 max-w-5xl gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">常用专业角色</p>
          <div className="flex gap-2 overflow-x-auto pb-1 md:max-h-[34rem] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pr-1">
            {PROFESSIONAL_ROLE_PRESETS.map((preset) => {
              const selected = preset.id === selectedPreset.id;
              const enabled = roles.roles[preset.id]?.enabled !== false;
              return (
                <button className={cn("min-w-44 rounded-md px-3 py-2.5 text-left transition-colors md:min-w-0", selected ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")} key={preset.id} onClick={() => setSelectedId(preset.id)} type="button">
                  <span className="flex items-center gap-2 text-sm font-medium"><span className="min-w-0 flex-1 truncate">{preset.name}</span>{selected && <Check className="size-3.5" />}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{preset.description}</span>
                  {!enabled && <span className="mt-1 block text-[11px] text-muted-foreground">已从选择器隐藏</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-medium">{selectedPreset.name}</p><p className="mt-1 text-xs text-muted-foreground">提示词只描述关注点，不强制模型执行固定流程。</p></div>
            <Switch aria-label={`启用${selectedPreset.name}`} checked={selectedRole.enabled} onCheckedChange={(enabled) => updateRole({ enabled })} />
          </div>
          <label className="grid gap-1.5 text-xs font-medium">简短专业提示词<Textarea className="min-h-28 resize-y leading-6" onChange={(event) => updateRole({ instructions: event.target.value })} value={selectedRole.instructions} /></label>
          <Button className="w-fit" onClick={() => updateRole({ instructions: selectedPreset.instructions })} size="sm" type="button" variant="ghost"><RotateCcw className="size-3.5" />恢复默认提示词</Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <AssociationPicker emptyLabel="当前没有可关联的 Skill" label="关联 Skill" onChange={(skillNames) => updateRole({ skillNames })} options={skillOptions} placeholder="选择已安装 Skill" values={selectedRole.skillNames} />
            <AssociationPicker emptyLabel="当前没有配置 MCP" label="关联 MCP" onChange={(names) => updateRole({ mcpNames: names })} options={mcpOptions} placeholder="选择已配置 MCP" values={selectedRole.mcpNames} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty} onClick={save} size="sm" type="button"><Save className="size-3.5" />保存角色设置</Button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500"><CheckCircle2 className="size-3.5" />已保存，下一条消息起生效</span>}
      </div>
    </div>
  );
}
