import { useEffect, useState } from "react";
import { Bot, Check, CheckCircle2, PencilLine, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_PERSONA_ID, findPersonaPreset, PERSONA_PRESETS } from "@/lib/personaPresets";
import type { WorkspacePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface PersonaSettingsProps {
  onSave: (preferences: WorkspacePreferences) => WorkspacePreferences;
  preferences: WorkspacePreferences;
}

export function PersonaSettings({ onSave, preferences }: PersonaSettingsProps) {
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
    setPersona({ enabled: true, instructions: preset.instructions, name: preset.name, presetId: preset.id });
  };
  const customize = (changes: Partial<typeof persona>) => update({ ...changes, presetId: CUSTOM_PERSONA_ID });
  const dirty = persona.enabled !== preferences.persona.enabled
    || persona.name !== preferences.persona.name
    || persona.instructions !== preferences.persona.instructions
    || persona.presetId !== preferences.persona.presetId;
  const valid = persona.name.trim().length > 0 && persona.instructions.trim().length > 0;
  const save = () => {
    if (!valid) return;
    const next = onSave({ ...preferences, persona: { ...persona, name: persona.name.trim(), instructions: persona.instructions.trim() } });
    setPersona(next.persona);
    setSaved(true);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <header><h2 className="text-lg font-semibold">人格</h2><p className="mt-1 text-sm text-muted-foreground">为当前工作区定义一套稳定的对话角色和回答准则。</p></header>
      <div className="flex items-center gap-3 border-b border-border pb-4"><div className="flex size-9 items-center justify-center rounded-md bg-muted"><Bot className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">启用人格定义</p><p className="mt-0.5 text-xs text-muted-foreground">人格指令会作为内部上下文发送，不会出现在用户消息中。</p></div><Switch checked={persona.enabled} onCheckedChange={(enabled) => update({ enabled })} /></div>

      <div className="grid min-h-0 max-w-5xl gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">预设人格</p>
          <div className="flex gap-2 overflow-x-auto pb-1 md:max-h-[31rem] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pr-1">
            {PERSONA_PRESETS.map((preset) => {
              const selected = persona.presetId === preset.id;
              return <button aria-pressed={selected} className={cn("min-w-44 rounded-md px-3 py-2.5 text-left transition-colors md:min-w-0", selected ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")} key={preset.id} onClick={() => choosePreset(preset.id)} type="button"><span className="flex items-center gap-2 text-sm font-medium"><span className="min-w-0 flex-1 truncate">{preset.name}</span>{selected && <Check className="size-3.5 shrink-0" />}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{preset.description}</span></button>;
            })}
            <button aria-pressed={persona.presetId === CUSTOM_PERSONA_ID} className={cn("min-w-44 rounded-md px-3 py-2.5 text-left transition-colors md:min-w-0", persona.presetId === CUSTOM_PERSONA_ID ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")} onClick={() => choosePreset(CUSTOM_PERSONA_ID)} type="button"><span className="flex items-center gap-2 text-sm font-medium"><PencilLine className="size-3.5" />自定义</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">从当前内容继续调整并保存。</span></button>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div><p className="text-sm font-medium">{persona.presetId === CUSTOM_PERSONA_ID ? "自定义人格" : persona.name}</p><p className="mt-1 text-xs text-muted-foreground">修改预设内容后会自动保存为自定义人格。</p></div>
          <label className="grid gap-1.5 text-xs font-medium">角色名称<Input onChange={(event) => customize({ name: event.target.value })} placeholder="例如 严谨的代码审阅助手" value={persona.name} /></label>
          <label className="grid gap-1.5 text-xs font-medium">角色指令<Textarea className="min-h-64 resize-y leading-6" onChange={(event) => customize({ instructions: event.target.value })} placeholder="描述语气、边界、偏好、代码规范和回答方式..." value={persona.instructions} /></label>
        </div>
      </div>
      <div className="flex max-w-5xl items-start gap-2 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0" /><span>人格只改变交流方式，不会修改 OpenCode agent、项目文件或 AGENTS.md；自定义内容仅保存在当前工作区。</span></div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty || !valid} onClick={save} size="sm" type="button"><Save className="size-3.5" />保存人格</Button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500"><CheckCircle2 className="size-3.5" />已保存并应用，下一条消息起生效</span>}
        {!valid && <span className="text-xs text-destructive">角色名称和角色指令不能为空</span>}
      </div>
    </section>
  );
}
