import { CUSTOM_PERSONA_ID, findPersonaPreset, personaPresets } from "@/lib/personaPresets";
import { t } from "@/lib/i18n";
import {
  AUTO_PROFESSIONAL_ROLE_ID,
  createDefaultProfessionalRolePreferences,
  findProfessionalRolePreset,
  professionalRolePresets,
  type ProfessionalRolePreferences,
} from "@/lib/professionalRoles";

export interface PersonaPreferences {
  enabled: boolean;
  name: string;
  presetId: string;
  instructions: string;
}

export type ModelVariantLabels = Record<string, Record<string, string>>;

/** Re-exported so callers do not need to reach into the i18n module for the preference shape. */
import type { LocalePreference } from "@/lib/i18n";
export type { LocalePreference } from "@/lib/i18n";

export interface WorkspacePreferences {
  /** `auto` follows the IDE locale; the explicit values are the user's own choice. */
  language: LocalePreference;
  disabledSkillNames: string[];
  modelVariantLabels: ModelVariantLabels;
  persona: PersonaPreferences;
  professionalRoles: ProfessionalRolePreferences;
  /**
   * Describes images for conversation models that cannot read them. Undefined leaves images
   * untouched, which is the right default: converting silently would hide a real capability gap.
   */
  visionModel?: { providerID: string; modelID: string };
}

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  language: "auto",
  disabledSkillNames: [],
  modelVariantLabels: {},
  persona: {
    enabled: false,
    name: personaPresets()[0].name,
    presetId: personaPresets()[0].id,
    instructions: personaPresets()[0].instructions,
  },
  professionalRoles: createDefaultProfessionalRolePreferences(),
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

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
  : [];

const normalizeProfessionalRoles = (value: unknown): ProfessionalRolePreferences => {
  const defaults = createDefaultProfessionalRolePreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<ProfessionalRolePreferences>;
  const rawRoles = raw.roles && typeof raw.roles === "object" && !Array.isArray(raw.roles)
    ? raw.roles as Record<string, unknown>
    : {};
  const roles = Object.fromEntries(professionalRolePresets().map((preset) => {
    const candidate = rawRoles[preset.id];
    const role = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Partial<ProfessionalRolePreferences["roles"][string]>
      : {};
    return [preset.id, {
      enabled: role.enabled !== false,
      instructions: typeof role.instructions === "string" && role.instructions.trim()
        ? role.instructions.trim()
        : preset.instructions,
      mcpNames: stringArray(role.mcpNames),
      skillNames: stringArray(role.skillNames),
    }];
  }));
  const requestedRoleId = typeof raw.selectedRoleId === "string" ? raw.selectedRoleId : "";
  const selectedRoleId = requestedRoleId === AUTO_PROFESSIONAL_ROLE_ID
    || (findProfessionalRolePreset(requestedRoleId) && roles[requestedRoleId]?.enabled)
    ? requestedRoleId
    : AUTO_PROFESSIONAL_ROLE_ID;
  return { enabled: raw.enabled === true, roles, selectedRoleId };
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
          name: typeof persona.name === "string" && persona.name.trim() ? persona.name : t("s_cfeed967b1"),
          presetId: CUSTOM_PERSONA_ID,
        }
      : DEFAULT_PREFERENCES.persona;
  return {
    // Anything unrecognised falls back to following the environment rather than pinning a
    // language the user never picked.
    language: raw.language === "zh" || raw.language === "en" ? raw.language : "auto",
    disabledSkillNames: Array.isArray(raw.disabledSkillNames)
      ? raw.disabledSkillNames.filter((name): name is string => typeof name === "string")
      : [],
    modelVariantLabels: normalizeModelVariantLabels(raw.modelVariantLabels),
    persona: normalizedPersona,
    professionalRoles: normalizeProfessionalRoles(raw.professionalRoles),
    visionModel: normalizeVisionModel(raw.visionModel),
  };
};

/** Both halves have to be present; a partial reference would fail at send time, not at load. */
const normalizeVisionModel = (value: unknown): WorkspacePreferences["visionModel"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const providerID = typeof record.providerID === "string" ? record.providerID.trim() : "";
  const modelID = typeof record.modelID === "string" ? record.modelID.trim() : "";
  return providerID && modelID ? { modelID, providerID } : undefined;
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
