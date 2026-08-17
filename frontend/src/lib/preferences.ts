import { CUSTOM_PERSONA_ID, findPersonaPreset, personaPresets } from "@/lib/personaPresets";
import { ideaApi } from "@/lib/idea";
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

export interface SessionTabPreferences {
  /** When disabled, opening a session replaces the current tab. */
  enabled: boolean;
  /** Null means there is no tab limit. Multi-tab mode otherwise keeps at least two tabs. */
  maxOpen: number | null;
  /** Controls what happens when opening another tab would exceed maxOpen. */
  overflow: "prompt" | "replace-oldest";
}

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
  sessionTabs: SessionTabPreferences;
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
  sessionTabs: {
    enabled: true,
    maxOpen: 8,
    overflow: "prompt",
  },
};

const LANGUAGE_KEY = "capybara-ai:language";
const IDEA_PREFERENCES_BRIDGE = new URLSearchParams(window.location.search).get("nativeTitleActions") === "1";
let pendingIdeaPreferenceSave: Promise<unknown> | undefined;

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

const normalizeSessionTabs = (value: unknown): SessionTabPreferences => {
  const defaults = DEFAULT_PREFERENCES.sessionTabs;
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<SessionTabPreferences>;
  const numericLimit = typeof raw.maxOpen === "number" && Number.isFinite(raw.maxOpen)
    ? Math.max(2, Math.min(50, Math.round(raw.maxOpen)))
    : null;
  return {
    enabled: raw.enabled !== false,
    maxOpen: raw.maxOpen === null ? null : numericLimit ?? defaults.maxOpen,
    overflow: raw.overflow === "replace-oldest" ? "replace-oldest" : "prompt",
  };
};

export const normalizeWorkspacePreferences = (value: unknown): WorkspacePreferences => {
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
    sessionTabs: normalizeSessionTabs(raw.sessionTabs),
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
    return normalizeWorkspacePreferences(JSON.parse(window.localStorage.getItem(preferenceKey(projectPath)) ?? "null"));
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const cacheWorkspacePreferences = (
  projectPath: string | undefined,
  preferences: unknown
): WorkspacePreferences => {
  const normalized = normalizeWorkspacePreferences(preferences);
  window.localStorage.setItem(preferenceKey(projectPath), JSON.stringify(normalized));
  window.localStorage.setItem(LANGUAGE_KEY, normalized.language);
  return normalized;
};

export const loadPersistedWorkspacePreferences = async (
  projectPath?: string
): Promise<WorkspacePreferences> => {
  const local = loadWorkspacePreferences(projectPath);
  if (!IDEA_PREFERENCES_BRIDGE) return local;
  try {
    await pendingIdeaPreferenceSave;
    const persisted = await ideaApi.getWorkspacePreferences();
    if (persisted && typeof persisted === "object" && !Array.isArray(persisted)) {
      return cacheWorkspacePreferences(projectPath, persisted);
    }
    await ideaApi.saveWorkspacePreferences(local);
  } catch (error) {
    console.error("Unable to load IDEA workspace preferences", error);
  }
  return local;
};

export const saveWorkspacePreferences = (
  projectPath: string | undefined,
  preferences: WorkspacePreferences
): WorkspacePreferences => {
  const normalized = cacheWorkspacePreferences(projectPath, preferences);
  // Mirrored outside the per-project record on purpose — see loadLanguagePreference.
  if (IDEA_PREFERENCES_BRIDGE) {
    const save = (pendingIdeaPreferenceSave ?? Promise.resolve())
      .then(() => ideaApi.saveWorkspacePreferences(normalized))
      .catch((error) => {
        console.error("Unable to save IDEA workspace preferences", error);
      });
    pendingIdeaPreferenceSave = save;
    void save.finally(() => {
      if (pendingIdeaPreferenceSave === save) pendingIdeaPreferenceSave = undefined;
    });
  }
  return normalized;
};

/**
 * The interface language, stored on its own rather than inside the per-project record.
 *
 * The panel has to choose a language before it knows which project it is attached to, so boot read
 * the preferences under the "default" key while the settings page had written them under the
 * project key. The choice was saved correctly and simply never read back: every restart fell to
 * `auto` and, on a non-Chinese IDE, came up English no matter what the user had picked. A language
 * is a property of the person, not of the workspace, so one global key is also the right shape.
 */
export const loadLanguagePreference = (): LocalePreference => {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  if (stored === "zh" || stored === "en" || stored === "auto") return stored;
  // Falls back to whatever an older build wrote into the default record.
  return loadWorkspacePreferences().language;
};
