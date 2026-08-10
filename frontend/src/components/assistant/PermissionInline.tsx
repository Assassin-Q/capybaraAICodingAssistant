import { CircleAlert, FileCog, FileSearch, Globe2, ShieldAlert, Terminal } from "lucide-react";

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import type { PermissionReply, PermissionRequest } from "@/lib/opencode";
import { t } from "@/lib/i18n";

const actionDetails = (action: string): { icon: typeof FileSearch; label: string } => {
  const normalized = action.toLowerCase();
  if (["read", "glob", "grep", "list"].includes(normalized)) return { icon: FileSearch, label: t("s_b57a6808f1") };
  if (["edit", "write", "apply_patch", "external_directory"].includes(normalized)) return { icon: FileCog, label: t("s_d535276b09") };
  if (["bash", "shell", "task"].includes(normalized)) return { icon: Terminal, label: t("s_bf162782f5") };
  if (["webfetch", "websearch"].includes(normalized)) return { icon: Globe2, label: t("s_cb959df3bf") };
  return { icon: ShieldAlert, label: action || t("s_44d2db9ca7") };
};

export function PermissionInline({
  request,
  onReply,
}: {
  onReply: (reply: PermissionReply) => void;
  request: PermissionRequest;
}) {
  const details = actionDetails(request.action);
  const Icon = details.icon;
  /**
   * What "本轮都允许" covers, in the request's own words.
   *
   * The panel answers matching requests itself for the rest of this run and never asks OpenCode to
   * remember anything, so this is a scope note rather than the warning it used to be: the old
   * button wrote a permanent project-wide rule, and websearch and edit both declare a `*` pattern.
   */
  const alwaysScope = request.action ? t("s_2185cfd923", { p0: details.label }) : "";
  // Deliberately not a modal. A dialog stole focus, could not be left open while switching
  // sessions, and dismissing it by clicking outside answered "reject" — which is the opposite of
  // what a stray click means. As a card it sits under the conversation and simply waits; the
  // request lives in OpenCode, so it survives a session switch and an IDE restart.
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
        <CircleAlert className="size-3.5 shrink-0" />
        {t("s_725b00fecf")}
        <span className="font-normal opacity-80">{t("s_e3f7000dce")}</span>
      </div>
      <Confirmation approval={{ id: request.id }} className="mt-2 border-0 bg-transparent p-0 shadow-none" state="approval-requested">
        <ConfirmationRequest>
          <div className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ConfirmationTitle className="font-medium text-foreground">{details.label}</ConfirmationTitle>
              {request.resources.length > 0 && (
                <div className="mt-2 max-h-28 overflow-y-auto rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                  {request.resources.map((resource) => (
                    <div className="break-all font-mono leading-5" key={resource}>{resource}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ConfirmationRequest>
        <ConfirmationActions className="mt-3 flex-wrap items-center justify-end self-stretch">
          {alwaysScope && (
            <span className="mr-auto text-[11px] text-muted-foreground">
              {t("s_a62bc5ce3d")}{alwaysScope}{t("s_ef58e51e3e")}
            </span>
          )}
          <ConfirmationAction onClick={() => onReply("reject")} variant="ghost">{t("s_03e210a66d")}</ConfirmationAction>
          <ConfirmationAction onClick={() => onReply("always")} variant="outline">{t("s_1e47fa9193")}</ConfirmationAction>
          <ConfirmationAction onClick={() => onReply("once")}>{t("s_0273f6d38d")}</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}
