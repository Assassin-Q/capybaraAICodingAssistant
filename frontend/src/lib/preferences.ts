import { CUSTOM_PERSONA_ID, findPersonaPreset, PERSONA_PRESETS } from "@/lib/personaPresets";

export interface PersonaPreferences {
  enabled: boolean;
  name: string;
  presetId: string;
  instructions: string;
}

export type ModelVariantLabels = Record<string, Record<string, string>>;

export interface WorkspacePreferences {
  disabledSkillNames: string[];
  modelVariantLabels: ModelVariantLabels;
  persona: PersonaPreferences;
}

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  disabledSkillNames: [],
  modelVariantLabels: {},
  persona: {
    enabled: false,
    name: PERSONA_PRESETS[0].name,
    presetId: PERSONA_PRESETS[0].id,
    instructions: PERSONA_PRESETS[0].instructions,
  },
};

const preferenceKey = (projectPath?: string): string =>
  `capybara-ai:workspace-preferences:${projectPath ?? "default"}`;

const REMOVED_PERSONA_IDS = new Set(["balanced", "analyst", "empathetic", "reviewer", "pair-programmer"]);

const normalizeModelVariantLabels = (value: unknown): ModelVariantLabels => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([modelID, labels]) => {
      if (!labels || typeof labels !== "object" || Array.isArray(labels)) return [];
      const normalizedLabels = Object.fromEntries(
        Object.entries(labels as Record<string, unknown>)
          .filter(([variantID, label]) => variantID.trim() && typeof label === "string")
          .map(([variantID, label]) => [variantID, (label as string).trim()])
          .filter(([, label]) => label)
      );
      return Object.keys(normalizedLabels).length > 0 ? [[modelID, normalizedLabels]] : [];
    })
  );
};

const normalize = (value: unknown): WorkspacePreferences => {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const raw = value as Partial<WorkspacePreferences>;
  const persona = (raw.persona ?? {}) as Partial<PersonaPreferences>;
  const presetId = typeof persona.presetId === "string" ? persona.presetId.trim() : "";
  const preset = findPersonaPreset(presetId);
  const custom = presetId === CUSTOM_PERSONA_ID || (!preset && !REMOVED_PERSONA_IDS.has(presetId));
  const normalizedPersona = preset
    ? { enabled: persona.enabled === true, instructions: preset.instructions, name: preset.name, presetId: preset.id }
    : custom
      ? {
          enabled: persona.enabled === true,
          instructions: typeof persona.instructions === "string" ? persona.instructions : "",
          name: typeof persona.name === "string" && persona.name.trim() ? persona.name : "自定义人格",
          presetId: CUSTOM_PERSONA_ID,
        }
      : DEFAULT_PREFERENCES.persona;
  return {
    disabledSkillNames: Array.isArray(raw.disabledSkillNames)
      ? raw.disabledSkillNames.filter((name): name is string => typeof name === "string")
      : [],
    modelVariantLabels: normalizeModelVariantLabels(raw.modelVariantLabels),
    persona: normalizedPersona,
  };
};

export const loadWorkspacePreferences = (projectPath?: string): WorkspacePreferences => {
  try {
    return normalize(JSON.parse(window.localStorage.getItem(preferenceKey(projectPath)) ?? "null"));
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

export const saveWorkspacePreferences = (
  projectPath: string | undefined,
  preferences: WorkspacePreferences
): WorkspacePreferences => {
  const normalized = normalize(preferences);
  window.localStorage.setItem(preferenceKey(projectPath), JSON.stringify(normalized));
  return loadWorkspacePreferences(projectPath);
};
