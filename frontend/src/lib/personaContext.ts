import { t } from "@/lib/i18n";
const PERSONA_CONTEXT_START = "<capybara-persona-context>";
const PERSONA_CONTEXT_END = "</capybara-persona-context>";

const PERSONA_CONTEXT_RULES = [
  "<system-reminder>",
  t("s_2d8dfba824"),
  t("s_cff8d8423a"),
  t("s_7a7758e816"),
  t("s_023b93266d"),
  t("s_8b213382fa"),
  t("s_57b872ff9b"),
  t("s_4ed45d0411"),
  t("s_f07792555b"),
  "</system-reminder>",
].join("\n");

const LEGACY_PERSONA_BOUNDARIES = [
  [t("s_c980c12673"), t("s_30cc58513a")],
  [t("s_f47c245c62"), t("s_20972a2284")],
  [t("s_d5ae9b9e71"), t("s_07d73ad332")],
  [t("s_b38e92cdd6"), t("s_9b43116f0a")],
  [t("s_5abd3b1683"), t("s_a2e9f782bc")],
  [t("s_270b91931c"), t("s_1c416cf042")],
] as const;

const stripLegacyPersonaContext = (text: string): string => {
  const boundary = LEGACY_PERSONA_BOUNDARIES.find(([start]) => text.startsWith(start));
  if (!boundary) return text;
  const end = text.indexOf(boundary[1], boundary[0].length);
  if (end < 0) return text;
  return text.slice(end + boundary[1].length).replace(/^\s+/, "");
};

export const attachPersonaContext = (text: string, instructions?: string): string => {
  const normalized = instructions?.trim();
  if (!normalized) return text;
  return [
    PERSONA_CONTEXT_START,
    PERSONA_CONTEXT_RULES,
    normalized,
    PERSONA_CONTEXT_END,
    "",
    text,
  ].join("\n");
};

export const stripPersonaContext = (text: string): string => {
  if (!text.startsWith(PERSONA_CONTEXT_START)) return stripLegacyPersonaContext(text);
  const end = text.indexOf(PERSONA_CONTEXT_END, PERSONA_CONTEXT_START.length);
  if (end < 0) return text;
  return text.slice(end + PERSONA_CONTEXT_END.length).replace(/^\s+/, "");
};
