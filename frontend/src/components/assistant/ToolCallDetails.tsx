import { FileCode2, FolderOpen, FolderTree, Navigation, SearchCode, Terminal, TriangleAlert } from "lucide-react";
import { Columns3 } from "lucide-react";
import type { BundledLanguage } from "shiki";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { ideaApi } from "@/lib/idea";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const normalizedInput = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const textValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return t("s_bdf9c08ea4", { p0: value.length });
  return t("s_539cb3b0a6");
};

const firstValue = (input: Record<string, unknown>, keys: string[]): unknown =>
  keys.map((key) => input[key]).find((value) => value !== undefined && value !== "");

const recordArray = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
  : [];

interface StructuredFile {
  file: string;
  patch?: string;
  additions?: number;
  deletions?: number;
  status?: string;
}

const structuredFiles = (value: unknown): StructuredFile[] => {
  const record = asRecord(normalizedInput(value));
  const files = record?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((item) => {
    const file = asRecord(item);
    if (!file || typeof file.file !== "string" || !file.file.trim()) return [];
    return [{
      additions: typeof file.additions === "number" ? file.additions : undefined,
      deletions: typeof file.deletions === "number" ? file.deletions : undefined,
      file: file.file,
      patch: typeof file.patch === "string" ? file.patch : undefined,
      status: typeof file.status === "string" ? file.status : undefined,
    }];
  });
};

const statusLabel = (status?: string): string => {
  if (status === "added") return t("s_2cd9e6ce81");
  if (status === "deleted") return t("s_3755f56f2f");
  if (status === "renamed") return t("s_1cd80fd7a8");
  return t("s_c920e429e2");
};

function StructuredFileOutput({ files }: { files: StructuredFile[] }) {
  return (
    <div className="grid gap-1.5">
      {files.map((file) => (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-background/45 px-2 py-1.5" key={`${file.file}-${file.status ?? "modified"}`}>
          <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.file}>{file.file}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{statusLabel(file.status)}</span>
          {typeof file.additions === "number" && <span className="shrink-0 text-[10px] text-emerald-600">+{file.additions}</span>}
          {typeof file.deletions === "number" && <span className="shrink-0 text-[10px] text-red-600">-{file.deletions}</span>}
          {file.patch && (
            <Button
              aria-label={t("s_f6bb61b30c", { p0: file.file })}
              className="size-6 shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                void ideaApi.openDiff({ file: file.file, patch: file.patch!, title: t("s_df290a3a52", { p0: file.file }) });
              }}
              size="icon-sm"
              title={t("s_60e02e7ad8")}
              type="button"
              variant="ghost"
            >
              <Columns3 className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: unknown }) {
  if (value === undefined || value === "") return null;
  return (
    <div className="grid min-w-0 grid-cols-[auto_4.5rem_minmax(0,1fr)] items-start gap-2 text-xs">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-[11px] text-foreground">{textValue(value)}</span>
    </div>
  );
}

export function ToolCallInput({ name, input }: { name: string; input: unknown }) {
  const normalized = normalizedInput(input);
  const record = asRecord(normalized);
  if (!record) {
    return normalized ? <CodeBlock className="border-0 bg-transparent p-0 text-xs" code={String(normalized)} language={"text" as BundledLanguage} /> : null;
  }

  const kind = name.toLowerCase();
  const file = firstValue(record, ["filePath", "path", "filename", "file"]);
  const cwd = firstValue(record, ["cwd", "workdir", "workingDirectory", "directory"]);
  const command = firstValue(record, ["command", "cmd", "script"]);
  const pattern = firstValue(record, ["pattern", "query", "include"]);
  const offset = firstValue(record, ["offset", "startLine", "lineStart"]);
  const limit = firstValue(record, ["limit", "maxResults", "lineEnd"]);

  if (["bash", "shell", "exec", "run"].includes(kind)) {
    return (
      <div className="grid gap-2">
        <CodeBlock className="border-0 bg-transparent p-0 text-xs" code={String(command ?? "")} language="bash" />
        <div className="grid gap-1.5">
          <DetailRow icon={<FolderOpen className="size-3" />} label={t("s_42dfc81f99")} value={cwd} />
          <DetailRow label={t("s_ff06c243d7")} value={firstValue(record, ["timeout", "timeoutMs"])} />
        </div>
      </div>
    );
  }

  if (["read", "write", "edit", "apply_patch", "patch"].includes(kind)) {
    const content = firstValue(record, ["content", "newString", "patch", "diff"]);
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5">
          <DetailRow icon={<FileCode2 className="size-3" />} label={t("s_49deaf7da2")} value={file} />
          <DetailRow label={t("s_d3c44ab36d")} value={offset} />
          <DetailRow label={t("s_579f280b5d")} value={limit} />
        </div>
        {content !== undefined && (
          <CodeBlock className="max-h-52 overflow-auto border-0 bg-transparent p-0 text-xs" code={String(content)} language={(kind === "apply_patch" || kind === "patch" ? "diff" : "text") as BundledLanguage} />
        )}
      </div>
    );
  }

  if (["grep", "glob", "list", "search"].includes(kind)) {
    return (
      <div className="grid gap-1.5">
        <DetailRow icon={<Terminal className="size-3" />} label={kind === "grep" || kind === "search" ? t("s_f04090805c") : t("s_c7127bb6ee")} value={pattern} />
        <DetailRow icon={<FolderOpen className="size-3" />} label={t("s_785b52eb97")} value={file ?? cwd} />
        <DetailRow label={t("s_0517c1f9e4")} value={limit} />
      </div>
    );
  }

  if (kind === "task") {
    return (
      <div className="grid gap-1.5">
        <DetailRow label={t("s_26670dda42")} value={firstValue(record, ["description", "prompt", "command"])} />
        <DetailRow label={t("s_bbae54d5ce")} value={firstValue(record, ["subagent_type", "agent", "agentId"])} />
      </div>
    );
  }

  if (kind.startsWith("idea_")) {
    return (
      <div className="grid gap-1.5">
        <DetailRow icon={<FileCode2 className="size-3" />} label={t("s_49deaf7da2")} value={file ?? (kind === "idea_project_context" ? t("s_96cb64ae60") : t("s_da166942c7"))} />
        <DetailRow label={t("s_f3ea6d345e")} value={firstValue(record, ["action", "mode"])} />
        <DetailRow label={t("s_2a2b777ae4")} value={firstValue(record, ["line", "startLine"])} />
        <DetailRow label={t("s_ad3ee64830")} value={firstValue(record, ["column", "startColumn"])} />
        <DetailRow label={t("s_d7d7ce790b")} value={firstValue(record, ["id", "configurationID"])} />
        <DetailRow label={t("s_3172b317f9")} value={record.tasks} />
        <DetailRow label={t("s_67d2d7970f")} value={record.url} />
        <DetailRow label={t("s_5da56aba3c")} value={record.selector} />
        <DetailRow label={t("s_f70319a6ee")} value={record.minSeverity} />
        <DetailRow label={t("s_ad6fba1257")} value={record.contextLines} />
      </div>
    );
  }

  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== "");
  return (
    <div className={cn("grid gap-1.5", entries.length > 8 && "max-h-52 overflow-y-auto pr-1")}>
      {entries.map(([key, value]) => <DetailRow key={key} label={key} value={value} />)}
    </div>
  );
}

function OutputText({ value, language = "text" }: { language?: BundledLanguage | "text"; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <CodeBlock
      className="max-h-64 overflow-auto border-0 bg-transparent p-0 text-xs"
      code={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      language={language as BundledLanguage}
    />
  );
}

export function ToolCallOutput({ name, output }: { name: string; output: unknown }) {
  const normalized = normalizedInput(output);
  if (normalized === undefined || normalized === null || normalized === "") return null;
  const record = asRecord(normalized);
  const kind = name.toLowerCase();
  const files = structuredFiles(normalized);

  if (files.length > 0) return <StructuredFileOutput files={files} />;

  if (record && kind === "idea_project_context") {
    const modules = recordArray(record.modules);
    const openFiles = Array.isArray(record.openFiles) ? record.openFiles : [];
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5">
          <DetailRow icon={<FolderTree className="size-3" />} label={t("s_22336e6b89")} value={record.projectName} />
          <DetailRow label="SDK" value={record.sdkVersion ?? record.sdk} />
          <DetailRow label={t("s_c42a02c69c")} value={record.currentFile} />
          <DetailRow label={t("s_38820b3dc3")} value={t("s_671f3b57d5", { p0: openFiles.length })} />
        </div>
        {modules.length > 0 && <div className="grid max-h-52 gap-1 overflow-y-auto pr-1">{modules.map((module) => (
          <div className="rounded-sm bg-background/50 px-2 py-1.5" key={String(module.name)}>
            <p className="text-xs font-medium">{String(module.name)}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{Array.isArray(module.sourceRoots) ? module.sourceRoots.map(textValue).join(" · ") : textValue(module.sourceRoots)}</p>
          </div>
        ))}</div>}
      </div>
    );
  }

  if (record && kind === "idea_editor_context") {
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5">
          <DetailRow icon={<FileCode2 className="size-3" />} label={t("s_49deaf7da2")} value={record.path} />
          <DetailRow label={t("s_cd99b225a0")} value={record.language} />
          <DetailRow label={t("s_88c34452cc")} value={record.line ? `${record.line}:${record.column ?? 1}` : undefined} />
          <DetailRow label={t("s_d572cd4ba2")} value={record.selectionStartLine ? `${record.selectionStartLine}-${record.selectionEndLine ?? record.selectionStartLine}` : undefined} />
        </div>
        {typeof record.selectedText === "string" && record.selectedText && <div><p className="mb-1 text-[11px] text-muted-foreground">{t("s_669db68c8e")}</p><OutputText value={record.selectedText} /></div>}
        {typeof record.context === "string" && record.context && <OutputText value={record.context} />}
      </div>
    );
  }

  if (record && kind === "idea_diagnostics") {
    const diagnostics = recordArray(record.diagnostics);
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5"><DetailRow icon={<TriangleAlert className="size-3" />} label={t("s_49deaf7da2")} value={record.path} /><DetailRow label={t("s_98943466db")} value={record.analysisComplete === true ? t("s_e99b48a29b") : t("s_2c2a1493ca")} /></div>
        {diagnostics.length === 0 ? <p className="text-xs text-muted-foreground">{t("s_2557c04f68")}</p> : (
          <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">{diagnostics.map((diagnostic, index) => (
            <div className="rounded-sm bg-background/50 px-2 py-1.5" key={`${diagnostic.line}-${diagnostic.column}-${index}`}>
              <div className="flex items-center gap-2"><span className={cn("text-[10px] font-medium", String(diagnostic.severity).includes("ERROR") ? "text-red-600" : "text-amber-600")}>{textValue(diagnostic.severity)}</span><span className="font-mono text-[10px] text-muted-foreground">{textValue(diagnostic.line)}:{textValue(diagnostic.column)}</span></div>
              <p className="mt-0.5 text-xs leading-5">{textValue(diagnostic.description)}</p>
            </div>
          ))}</div>
        )}
      </div>
    );
  }

  if (record && kind === "idea_symbol") {
    const results = recordArray(record.results);
    const definition = asRecord(record.definition);
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5"><DetailRow icon={<SearchCode className="size-3" />} label={t("s_e2cf6fbb19")} value={record.symbol} /><DetailRow label={t("s_591abd3325")} value={definition ? `${textValue(definition.path)}:${textValue(definition.line)}` : undefined} /><DetailRow label={t("s_0a2c91cec6")} value={t("s_2916bae498", { p0: results.length })} /></div>
        {results.length > 0 && <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">{results.map((result, index) => (
          <div className="rounded-sm bg-background/50 px-2 py-1.5" key={`${result.path}-${result.line}-${index}`}>
            <p className="truncate font-mono text-[11px]">{textValue(result.path)}:{textValue(result.line)}</p>
            {typeof result.preview === "string" && result.preview && <p className="mt-0.5 truncate text-xs text-muted-foreground">{textValue(result.preview)}</p>}
          </div>
        ))}</div>}
      </div>
    );
  }

  if (record && ["idea_navigate", "idea_refresh_project"].includes(kind)) {
    return <div className="flex items-start gap-2 text-xs"><Navigation className="mt-0.5 size-3.5 text-muted-foreground" /><span>{textValue(record.message ?? record.success)}</span></div>;
  }

  if (["bash", "shell", "exec", "run"].includes(kind)) {
    if (!record) return <OutputText value={normalized} />;
    const stdout = firstValue(record, ["stdout", "output", "content", "text"]);
    const stderr = firstValue(record, ["stderr", "error"]);
    return (
      <div className="grid gap-2">
        <div className="grid gap-1.5">
          <DetailRow label={t("s_8c892358ec")} value={firstValue(record, ["exitCode", "code", "status"])} />
          <DetailRow label={t("s_a9704e1997")} value={firstValue(record, ["duration", "durationMs", "elapsed"])} />
        </div>
        <OutputText value={stdout} />
        {stderr !== undefined && <div className="rounded-md bg-destructive/8 px-2 py-1.5 text-destructive"><OutputText value={stderr} /></div>}
      </div>
    );
  }

  if (["read", "write", "edit", "apply_patch", "patch"].includes(kind)) {
    const content = record ? firstValue(record, ["content", "text", "output", "data", "patch", "diff"]) : normalized;
    const status = record ? firstValue(record, ["status", "message", "success"]) : undefined;
    return (
      <div className="grid gap-2">
        {status !== undefined && <DetailRow label={t("s_62e951a692")} value={status} />}
        <OutputText language={kind === "apply_patch" || kind === "patch" ? "diff" : "text"} value={content} />
      </div>
    );
  }

  if (["grep", "glob", "list", "search"].includes(kind)) {
    const items = Array.isArray(normalized)
      ? normalized
      : record && Array.isArray(record.matches) ? record.matches
        : record && Array.isArray(record.files) ? record.files
          : record && Array.isArray(record.results) ? record.results
            : undefined;
    if (!items) return <OutputText value={record ? firstValue(record, ["output", "content", "text"]) ?? normalized : normalized} />;
    return (
      <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">
        {items.map((item, index) => (
          <div className="break-words rounded-sm bg-background/50 px-2 py-1 font-mono text-[11px]" key={`${textValue(item)}-${index}`}>
            {typeof item === "string" ? item : JSON.stringify(item)}
          </div>
        ))}
      </div>
    );
  }

  if (!record) return <OutputText value={normalized} />;
  if (kind === "read") {
    return <OutputText language="text" value={firstValue(record, ["content", "text", "output", "data"]) ?? normalized} />;
  }
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== "");
  return (
    <div className="grid gap-1.5">
      {entries.map(([key, value]) => <DetailRow key={key} label={key} value={value} />)}
    </div>
  );
}
