import { variantLabel } from "@/components/assistant/modelVariants";
import { Badge } from "@/components/ui/badge";

export function ModelVariantSummary({ variants }: { variants: string[] }) {
  const entries = variants.length > 0 ? variants : ["default"];

  return (
    <section className="grid gap-2">
      <div>
        <h4 className="text-xs font-medium">思考档位</h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">由 OpenCode 当前模型提供，发送时只使用对应的档位 key。</p>
      </div>
      <div className="divide-y divide-border/45 rounded-md bg-muted/25 px-2.5">
        {entries.map((key) => (
          <div className="flex min-h-9 items-center gap-3 py-2" key={key}>
            <span className="min-w-0 flex-1 text-xs font-medium">{variantLabel(key)}</span>
            <Badge className="shrink-0 font-mono text-[10px] font-normal" variant="secondary">{key}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
