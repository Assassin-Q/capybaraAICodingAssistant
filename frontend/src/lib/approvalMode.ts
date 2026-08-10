import { t } from "@/lib/i18n";
import type {
  LegacyPermissionConfig,
  PermissionEffect,
  PermissionRule,
} from "@/lib/opencodeTypes";

export type ApprovalMode = "ask" | "auto" | "full";

export interface ApprovalModeOption {
  description: string;
  id: ApprovalMode;
  label: string;
}

export const approvalModeOptions: ApprovalModeOption[] = [
  {
    description: t("s_a557a9a148"),
    id: "ask",
    label: t("s_4e79789710"),
  },
  {
    description: t("s_a150e1cc69"),
    id: "auto",
    label: t("s_0eb7bec970"),
  },
  {
    description: t("s_dbcd31de89"),
    id: "full",
    label: t("s_31fe549474"),
  },
];

const rule = (action: string, effect: PermissionEffect): PermissionRule => ({
  action,
  effect,
  resource: "*",
});

export const rulesForApprovalMode = (mode: ApprovalMode): PermissionRule[] => {
  if (mode === "full") return [rule("*", "allow")];

  const editEffect: PermissionEffect = mode === "auto" ? "allow" : "ask";
  return [
    // Reset any broader rule inherited from an earlier mode. OpenCode evaluates
    // the last matching rule, so the explicit safe rules below still win.
    rule("*", "ask"),
    rule("read", "allow"),
    rule("glob", "allow"),
    rule("grep", "allow"),
    rule("list", "allow"),
    rule("lsp", "allow"),
    rule("todowrite", "allow"),
    rule("question", "allow"),
    rule("idea_project_context", "allow"),
    rule("idea_editor_context", "allow"),
    rule("idea_diagnostics", "allow"),
    rule("idea_symbol", "allow"),
    rule("idea_read_run_log", "allow"),
    rule("idea_navigate", "allow"),
    rule("edit", editEffect),
    rule("bash", "ask"),
    rule("task", "ask"),
    rule("external_directory", "ask"),
    rule("webfetch", "ask"),
    rule("websearch", "ask"),
  ];
};

export interface LegacySessionPermissionRule {
  action: PermissionEffect;
  pattern: string;
  permission: string;
}

/** Convert canonical V2 rules to the V1 session PATCH contract exposed by OpenCode. */
export const legacySessionRules = (rules: PermissionRule[]): LegacySessionPermissionRule[] =>
  rules.map((item) => ({
    action: item.effect,
    pattern: item.resource,
    permission: item.action,
  }));

/** Convert canonical V2 rules to the V1 /config permission object contract. */
export const legacyPermissionConfig = (rules: PermissionRule[]): LegacyPermissionConfig => {
  const result: LegacyPermissionConfig = {};
  rules.forEach((item) => {
    const current = result[item.action];
    if (item.resource === "*" && (current === undefined || typeof current === "string")) {
      result[item.action] = item.effect;
      return;
    }
    const resources: Record<string, PermissionEffect> = typeof current === "object" && current !== null
      ? { ...current }
      : current
        ? { "*": current }
        : {};
    resources[item.resource] = item.effect;
    result[item.action] = resources;
  });
  return result;
};

const isEffect = (value: unknown): value is PermissionEffect =>
  value === "allow" || value === "ask" || value === "deny";

/** Normalize either the V2 ruleset or the public V1 config/session shape. */
export const normalizePermissionRules = (value: unknown): PermissionRule[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const effect = isEffect(record.effect) ? record.effect : record.action;
      const action = typeof record.action === "string" && !isEffect(record.action)
        ? record.action
        : typeof record.permission === "string" ? record.permission : "";
      const resource = typeof record.resource === "string"
        ? record.resource
        : typeof record.pattern === "string" ? record.pattern : "*";
      return action && isEffect(effect) ? [{ action, effect, resource }] : [];
    });
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([action, entry]) => {
    if (isEffect(entry)) return [{ action, effect: entry, resource: "*" }];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    return Object.entries(entry as Record<string, unknown>).flatMap(([resource, effect]) =>
      isEffect(effect) ? [{ action, effect, resource }] : []
    );
  });
};

export const configForApprovalMode = (mode: ApprovalMode): LegacyPermissionConfig =>
  legacyPermissionConfig(rulesForApprovalMode(mode));

/** Read-only inspection. Everything else waits for the mode to say otherwise. */
const alwaysAllowed = new Set(["read", "glob", "grep", "list", "lsp", "todowrite", "question"]);

/**
 * Whether this mode answers a permission request on the user's behalf.
 *
 * Deliberately mirrors ApprovalModeService.decide on the plugin side. The two exist because they
 * answer at different moments: the plugin catches requests raised while no panel is watching,
 * this one answers the moment the event lands in a panel that is. Keeping the rules identical is
 * what stops the same request being auto-allowed in one place and queued in the other.
 *
 * Unknown permission kinds fall through to "ask" so a newly added OpenCode tool is never
 * auto-approved by a build that has not heard of it.
 */
export const approvalModeAllows = (mode: ApprovalMode, permission: string): boolean => {
  if (mode === "full") return true;
  const kind = permission.trim().toLowerCase();
  if (alwaysAllowed.has(kind)) return true;
  return kind === "edit" && mode === "auto";
};

const lastEffect = (rules: PermissionRule[], action: string): PermissionEffect | undefined =>
  [...rules].reverse().find((item) =>
    item.resource === "*" && (item.action === action || item.action === "*")
  )?.effect;

export const inferApprovalMode = (rules: PermissionRule[]): ApprovalMode => {
  const riskPermissions = ["bash", "task", "external_directory", "webfetch", "websearch"];
  if (riskPermissions.every((permission) => lastEffect(rules, permission) === "allow")) return "full";
  if (lastEffect(rules, "edit") === "allow"
    && lastEffect(rules, "bash") === "ask"
    && lastEffect(rules, "websearch") === "ask") return "auto";
  return "ask";
};
