import { useEffect, useState } from "react";
import { MessageSquareText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { localApiBaseUrl } from "@/lib/idea";

export interface BrowserAnnotation {
  id: string;
  selector: string;
  tagName: string;
  text: string;
  comment?: string;
  url: string;
}

interface PicksEvent {
  url?: string;
  picks?: BrowserAnnotation[];
}

/**
 * Live view of the annotations made in the built-in browser.
 *
 * The plugin pushes `browser.picks-changed` whenever a pick is added, edited or removed, so the
 * composer can surface them the way attachments are surfaced instead of the user having to
 * remember what they marked.
 */
export const useBrowserAnnotations = (): {
  annotations: BrowserAnnotation[];
  clear: () => void;
} => {
  const [annotations, setAnnotations] = useState<BrowserAnnotation[]>([]);

  useEffect(() => {
    const source = new EventSource(`${localApiBaseUrl}/events`);
    const handle = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as PicksEvent;
        // Only annotated picks matter here; a bare selection has nothing to tell the model.
        setAnnotations((parsed.picks ?? []).filter((pick) => pick.comment?.trim()));
      } catch {
        // A malformed event must not tear down the shared stream.
      }
    };
    source.addEventListener("browser.picks-changed", handle);
    return () => source.close();
  }, []);

  return { annotations, clear: () => setAnnotations([]) };
};

/**
 * Grabs the current page as a PNG through the plugin's browser bridge.
 *
 * The capture is painted straight off the JCEF component, so it no longer depends on the CEF
 * remote-debugging port being available. Returns undefined when the browser window is closed.
 */
export const captureBrowserScreenshot = async (): Promise<File | undefined> => {
  try {
    // `/browser` is served by the same plugin port as `/api`, just a different context.
    const origin = localApiBaseUrl.replace(/\/api$/, "");
    const response = await fetch(`${origin}/browser/control`, {
      body: JSON.stringify({ action: "screenshot" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { result?: { data?: string } };
    const encoded = payload.result?.data;
    if (!encoded) return undefined;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], "browser-annotation.png", { type: "image/png" });
  } catch {
    // A screenshot is a bonus; never block sending the prompt on it.
    return undefined;
  }
};

/** Renders the annotations as prompt text so the model sees selector + user intent together. */
export const annotationsAsPrompt = (annotations: BrowserAnnotation[]): string => {
  if (annotations.length === 0) return "";
  const lines = annotations.map((annotation, index) => {
    const label = annotation.text.trim().slice(0, 60);
    return [
      `${index + 1}. 选择器 \`${annotation.selector}\``,
      label ? `   元素文本：${label}` : "",
      `   用户要求：${annotation.comment?.trim() ?? ""}`,
    ].filter(Boolean).join("\n");
  });
  return [
    `【浏览器标注】页面 ${annotations[0]?.url ?? ""}`,
    ...lines,
  ].join("\n");
};

export function BrowserAnnotationChip({
  annotations,
  onClear,
}: {
  annotations: BrowserAnnotation[];
  onClear: () => void;
}) {
  if (annotations.length === 0) return null;

  return (
    <Popover>
      <div className="flex items-center gap-1.5">
        <PopoverTrigger asChild>
          <Button
            aria-label={`浏览器标注 ${annotations.length} 条`}
            className="h-6 gap-1.5 rounded-full bg-muted/60 px-2 text-[11px] font-normal"
            size="sm"
            type="button"
            variant="ghost"
          >
            <MessageSquareText className="size-3" />
            {annotations.length} 条浏览器标注
          </Button>
        </PopoverTrigger>
        <Button
          aria-label="清除浏览器标注"
          className="size-5"
          onClick={onClear}
          size="icon-sm"
          title="不随本次提问发送"
          type="button"
          variant="ghost"
        >
          <X className="size-3" />
        </Button>
      </div>
      <PopoverContent align="start" className="w-80 border-border/50 p-0" sideOffset={6}>
        <p className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
          发送时会连同页面截图一起交给模型
        </p>
        <div className="max-h-56 overflow-y-auto">
          {annotations.map((annotation, index) => (
            <div className="border-b border-border/30 px-3 py-2 last:border-b-0" key={annotation.id}>
              <p className="text-xs">
                <span className="mr-1 font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                {annotation.comment}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {annotation.selector}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
