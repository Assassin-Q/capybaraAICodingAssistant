import { Checkpoint, CheckpointIcon, CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AssistantMessage } from "@/lib/opencode";
import { formatToolValue } from "@/components/assistant/shared";
import { t } from "@/lib/i18n";

interface RunProgressProps {
  assistant?: AssistantMessage;
  queuedCount: number;
}

const toolLabel = (name: string): string => {
  const labels: Record<string, string> = {
    apply_patch: t("s_80e1ecebdb"),
    bash: t("s_bf162782f5"),
    edit: t("s_fa65902674"),
    glob: t("s_acf33b0f89"),
    grep: t("s_9131beb744"),
    list: t("s_64e86e0d07"),
    read: t("s_dc995cddfa"),
    task: t("s_d3c1926c04"),
    write: t("s_e620fd4b1f"),
  };
  return labels[name.toLowerCase()] ?? name;
};

export function RunProgress({ assistant, queuedCount }: RunProgressProps) {
  const tool = assistant?.content
    .filter((part) => part.type === "tool")
    .map((part) => part as Extract<AssistantMessage["content"][number], { type: "tool" }>)
    .reverse()
    .find((part) => part.state.status === "pending" || part.state.status === "running");
  const detail = tool?.state.input ? formatToolValue(tool.state.input) : "";
  const label = tool ? toolLabel(tool.name) : t("s_656aa6656e");

  return (
    <Checkpoint className="mb-1 min-h-7 gap-1 px-1 text-[11px]">
      <CheckpointIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">
        <Shimmer duration={1.2}>{label}</Shimmer>
      </span>
      {detail && <span className="max-w-[40%] truncate text-muted-foreground">{detail.split("\n")[0]}</span>}
      {queuedCount > 0 && (
        <CheckpointTrigger className="ml-auto h-6 px-1.5 text-[10px] text-muted-foreground" tooltip={t("s_221811cad0")}>
          {t("s_cd35413f05")} {queuedCount}
        </CheckpointTrigger>
      )}
    </Checkpoint>
  );
}
