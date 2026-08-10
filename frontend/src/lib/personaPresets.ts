import { t } from "@/lib/i18n";
export interface PersonaPreset {
  description: string;
  id: string;
  instructions: string;
  name: string;
}

export const CUSTOM_PERSONA_ID = "custom";

const ENGINEERING_BANTER_RULES = [
  t("s_ef4bd3ca69"),
  t("s_9fcdf0b982"),
  t("s_4ccc945fd4"),
].join("\n");

const buildInstructions = (instructions: string[]): string =>
  [...instructions, ENGINEERING_BANTER_RULES].join("\n");

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "hakimi",
    name: t("s_c83964d8f2"),
    description: t("s_e208c216e4"),
    instructions: buildInstructions([
      t("s_408bf812cc"),
      t("s_2ee9f0618c"),
      t("s_aa6bed0b2d"),
      t("s_3aa8821b0d"),
      t("s_ac5289ec6a"),
      t("s_6a2ef4ca92"),
      t("s_c904b56ffd"),
      t("s_6be089bf02"),
      t("s_3b3535b260"),
    ]),
  },
  {
    id: "taiwan-girl",
    name: t("s_f4e6e84cc5"),
    description: t("s_0732ae3f67"),
    instructions: buildInstructions([
      t("s_860a6461aa"),
      t("s_f5fe863b63"),
      t("s_d7c613f6a3"),
      t("s_97517e8b0d"),
      t("s_2be6ac100f"),
      t("s_91ae0e253d"),
    ]),
  },
  {
    id: "mature-sister",
    name: t("s_b0684a167c"),
    description: t("s_f958bd31db"),
    instructions: buildInstructions([
      t("s_373d0105d7"),
      t("s_27ea85d4b7"),
      t("s_f2a2c7e058"),
      t("s_88b20c3ef6"),
      t("s_d23341c015"),
      t("s_ca5e2b3b0d"),
    ]),
  },
  {
    id: "sweet-girl",
    name: t("s_90b6435dbc"),
    description: t("s_20f37ae5f5"),
    instructions: buildInstructions([
      t("s_2f93c63041"),
      t("s_bb65a73300"),
      t("s_a5a18f38a5"),
      t("s_646b864c83"),
      t("s_e30d469560"),
      t("s_32c9cb021b"),
    ]),
  },
];

export const findPersonaPreset = (id: string): PersonaPreset | undefined =>
  PERSONA_PRESETS.find((preset) => preset.id === id);
