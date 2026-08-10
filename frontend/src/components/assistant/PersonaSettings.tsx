import { useEffect, useState } from "react";
import { Bot, Check, CheckCircle2, PencilLine, Save, Sparkles } from "lucide-react";

import { ProfessionalRoleSettings } from "@/components/assistant/ProfessionalRoleSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_PERSONA_ID, findPersonaPreset, PERSONA_PRESETS } from "@/lib/personaPresets";
import type { WorkspacePreferences } from "@/lib/preferences";
import type { SkillInfo } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface PersonaSettingsProps {
  mcpNames: string[];
  onSave: (preferences: WorkspacePreferences) => WorkspacePreferences;
  preferences: WorkspacePreferences;
  skills: SkillInfo[];
}

interface ToneRoleSettingsProps {
  onSave: (preferences: WorkspacePreferences) => WorkspacePreferences;
  preferences: WorkspacePreferences;
}

function ToneRoleSettings({ onSave, preferences }: ToneRoleSettingsProps) {
  const [persona, setPersona] = useState(preferences.persona);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPersona(preferences.persona);
  }, [preferences.persona]);

  const update = (changes: Partial<typeof persona>) => {
    setSaved(false);
    setPersona((current) => ({ ...current, ...changes }));
  };
  const choosePreset = (presetId: string) => {
    if (presetId === CUSTOM_PERSONA_ID) {
      update({ presetId });
      return;
    }
    const preset = findPersonaPreset(presetId);
    if (!preset) return;
    setSaved(false);
    // Picking a preset edits the draft content only. Whether the persona is on is the switch's
    // business, and silently turning it on here would take a decision away from the user.
    setPersona((current) => ({ ...current, instructions: preset.instructions, name: preset.name, presetId: preset.id }));
  };
  const customize = (changes: Partial<typeof persona>) => update({ ...changes, presetId: CUSTOM_PERSONA_ID });

  /**
   * The switch is a live setting, not part of the draft.
   *
   * It used to only mutate local state, so the persona was not actually enabled until the save
   * button was pressed — and because `dirty` counted `enabled`, flipping it also lit up a button
   * labelled "save the tone role", conflating "turn this on" with "commit my text edits".
   * Merging onto the persisted persona keeps unsaved text out of the write.
   */
  const toggleEnabled = (enabled: boolean) => {
    const next = onSave({ ...preferences, persona: { ...preferences.persona, enabled } });
    setPersona((current) => ({ ...current, enabled: next.persona.enabled }));
  };

  const dirty = persona.name !== preferences.persona.name
    || persona.instructions !== preferences.persona.instructions
    || persona.presetId !== preferences.persona.presetId;
  const valid = persona.name.trim().length > 0 && persona.instructions.trim().length > 0;
  const save = () => {
    if (!valid) return;
    const next = onSave({
      ...preferences,
      persona: {
        ...persona,
        // Never written from the draft — only the switch owns it.
        enabled: preferences.persona.enabled,
        instructions: persona.instructions.trim(),
        name: persona.name.trim(),
      },
    });
    setPersona(next.persona);
    setSaved(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex items-center gap-3 border-b border-border pb-4"><div className="flex size-9 items-center justify-center rounded-md bg-muted"><Bot className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{t("s_1a2d88b52f")}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("s_b00ffd8ed4")}</p></div><Switch checked={preferences.persona.enabled} onCheckedChange={toggleEnabled} /></div>

      <div className="grid min-h-0 max-w-5xl gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("s_4dfbee9012")}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 md:max-h-[31rem] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pr-1">
            {PERSONA_PRESETS.map((preset) => {
              const selected = persona.presetId === preset.id;
              return <button aria-pressed={selected} className={cn("min-w-44 rounded-md px-3 py-2.5 text-left transition-colors md:min-w-0", selected ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")} key={preset.id} onClick={() => choosePreset(preset.id)} type="button"><span className="flex items-center gap-2 text-sm font-medium"><span className="min-w-0 flex-1 truncate">{preset.name}</span>{selected && <Check className="size-3.5 shrink-0" />}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{preset.description}</span></button>;
            })}
            <button aria-pressed={persona.presetId === CUSTOM_PERSONA_ID} className={cn("min-w-44 rounded-md px-3 py-2.5 text-left transition-colors md:min-w-0", persona.presetId === CUSTOM_PERSONA_ID ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")} onClick={() => choosePreset(CUSTOM_PERSONA_ID)} type="button"><span className="flex items-center gap-2 text-sm font-medium"><PencilLine className="size-3.5" />{t("s_c493338e8c")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("s_43ea01dbf8")}</span></button>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div><p className="text-sm font-medium">{persona.presetId === CUSTOM_PERSONA_ID ? t("s_bed66b170b") : persona.name}</p><p className="mt-1 text-xs text-muted-foreground">{t("s_144ad7aebd")}</p></div>
          <label className="grid gap-1.5 text-xs font-medium">{t("s_3aa1f085b2")}<Input onChange={(event) => customize({ name: event.target.value })} placeholder={t("s_6855fa4cde")} value={persona.name} /></label>
          <label className="grid gap-1.5 text-xs font-medium">{t("s_8ef473dd60")}<Textarea className="min-h-64 resize-y leading-6" onChange={(event) => customize({ instructions: event.target.value })} placeholder={t("s_203e96d15a")} value={persona.instructions} /></label>
        </div>
      </div>
      <div className="flex max-w-5xl items-start gap-2 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0" /><span>{t("s_22584d9ab5")}</span></div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty || !valid} onClick={save} size="sm" type="button"><Save className="size-3.5" />{t("s_37c6e2c0cd")}</Button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500"><CheckCircle2 className="size-3.5" />{t("s_cb8e3be7aa")}</span>}
        {!valid && <span className="text-xs text-destructive">{t("s_4ebf53ee81")}</span>}
      </div>
    </div>
  );
}

export function PersonaSettings({ mcpNames, onSave, preferences, skills }: PersonaSettingsProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <header><h2 className="text-lg font-semibold">{t("s_6b26695e4d")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("s_1a17ec9f30")}</p></header>
      <Tabs className="flex min-h-0 flex-1 flex-col overflow-hidden" defaultValue="tone">
        <TabsList className="shrink-0" variant="line">
          <TabsTrigger value="tone">{t("s_47bf4a6951")}</TabsTrigger>
          <TabsTrigger value="professional">{t("s_7d6b576c8e")}</TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0 overflow-y-auto pt-3" value="tone"><ToneRoleSettings onSave={onSave} preferences={preferences} /></TabsContent>
        <TabsContent className="min-h-0 overflow-y-auto pt-3" value="professional"><ProfessionalRoleSettings mcpNames={mcpNames} onSave={onSave} preferences={preferences} skills={skills} /></TabsContent>
      </Tabs>
    </section>
  );
}
