import { Checkpoint, CheckpointIcon, CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AssistantMessage } from "@/lib/opencode";
import { formatToolValue } from "@/components/assistant/shared";

interface RunProgressProps {
  assistant?: AssistantMessage;
  queuedCount: number;
}

const toolLabel = (name: string): string => {
  const labels: Record<string, string> = {
    apply_patch: "应用补丁",
    bash: "执行命令",
    edit: "编辑文件",
    glob: "查找文件",
    grep: "搜索内容",
    list: "列出文件",
    read: "读取文件",
    task: "执行任务",
    write: "写入文件",
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
  const label = tool ? toolLabel(tool.name) : "正在处理";

  return (
    <Checkpoint className="mb-1 min-h-7 gap-1 px-1 text-[11px]">
      <CheckpointIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">
        <Shimmer duration={1.2}>{label}</Shimmer>
      </span>
      {detail && <span className="max-w-[40%] truncate text-muted-foreground">{detail.split("\n")[0]}</span>}
      {queuedCount > 0 && (
        <CheckpointTrigger className="ml-auto h-6 px-1.5 text-[10px] text-muted-foreground" tooltip="待发送消息">
          队列 {queuedCount}
        </CheckpointTrigger>
      )}
    </Checkpoint>
  );
}
