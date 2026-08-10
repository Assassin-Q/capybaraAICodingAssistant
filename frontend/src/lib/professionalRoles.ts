import { t } from "@/lib/i18n";
export interface ProfessionalRolePreset {
  description: string;
  id: string;
  instructions: string;
  name: string;
}

export interface ProfessionalRoleConfig {
  enabled: boolean;
  instructions: string;
  mcpNames: string[];
  skillNames: string[];
}

export interface ProfessionalRolePreferences {
  enabled: boolean;
  roles: Record<string, ProfessionalRoleConfig>;
  selectedRoleId: string;
}

export const AUTO_PROFESSIONAL_ROLE_ID = "auto";

export const PROFESSIONAL_ROLE_PRESETS: ProfessionalRolePreset[] = [
  {
    id: "architect",
    name: t("s_d7e771fa3c"),
    description: t("s_accfaebe1a"),
    instructions: t("s_37af40b490"),
  },
  {
    id: "ui-designer",
    name: t("s_6f16a9fba5"),
    description: t("s_aeb5831e2a"),
    instructions: t("s_f50f41736a"),
  },
  {
    id: "frontend",
    name: t("s_fbd8290395"),
    description: t("s_260d77992b"),
    instructions: t("s_ad8491fb40"),
  },
  {
    id: "backend",
    name: t("s_334850108c"),
    description: t("s_3c1f1cd8e7"),
    instructions: t("s_62c4671a69"),
  },
  {
    id: "database",
    name: t("s_e33647a447"),
    description: t("s_c042fb2097"),
    instructions: t("s_055fca5cda"),
  },
  {
    id: "quality",
    name: t("s_536b667871"),
    description: t("s_def9a047a8"),
    instructions: t("s_ebf2447d71"),
  },
  {
    id: "reviewer",
    name: t("s_40c93a312e"),
    description: t("s_53eb10484b"),
    instructions: t("s_ffa27e08c5"),
  },
  {
    id: "debugger",
    name: t("s_aa91a9604c"),
    description: t("s_c86e12be52"),
    instructions: t("s_e241e1eb93"),
  },
];

export const findProfessionalRolePreset = (id: string): ProfessionalRolePreset | undefined =>
  PROFESSIONAL_ROLE_PRESETS.find((preset) => preset.id === id);

export const createDefaultProfessionalRolePreferences = (): ProfessionalRolePreferences => ({
  enabled: false,
  roles: Object.fromEntries(PROFESSIONAL_ROLE_PRESETS.map((preset) => [
    preset.id,
    { enabled: true, instructions: preset.instructions, mcpNames: [], skillNames: [] },
  ])),
  selectedRoleId: AUTO_PROFESSIONAL_ROLE_ID,
});

export const buildProfessionalRoleInstructions = (
  preferences: ProfessionalRolePreferences,
  availableSkillNames: string[],
  availableMcpNames: string[]
): string | undefined => {
  if (!preferences.enabled || preferences.selectedRoleId === AUTO_PROFESSIONAL_ROLE_ID) return undefined;
  const preset = findProfessionalRolePreset(preferences.selectedRoleId);
  const config = preferences.roles[preferences.selectedRoleId];
  if (!preset || !config?.enabled) return undefined;
  const skillSet = new Set(availableSkillNames);
  const mcpSet = new Set(availableMcpNames);
  const skills = config.skillNames.filter((name) => skillSet.has(name));
  const mcps = config.mcpNames.filter((name) => mcpSet.has(name));
  return [
    t("s_c64b59f745", { p0: preset.name }),
    config.instructions.trim() || preset.instructions,
    t("s_8bdb401689"),
    skills.length > 0 ? t("s_a4aea5d5a6", { p0: skills.join("、") }) : "",
    mcps.length > 0 ? t("s_55cd554cbf", { p0: mcps.join("、") }) : "",
  ].filter(Boolean).join("\n");
};
