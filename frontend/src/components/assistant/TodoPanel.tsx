import { Check, ChevronRight, Circle, FilePenLine, ListTodo, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { DiffFileList } from "@/components/assistant/SessionDiffSummary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionFileDiff, TodoInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";
import { useAssistantOverlayDismiss } from "@/lib/assistantOverlays";

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const priorityLabel = (): Record<string, string> => ({
  high: t("s_b096b3f5ac"),
  low: t("s_b9ee259b7f"),
  medium: t("s_0869071c92"),
});

/** A function, not a constant: a module-level t() freezes the string to the load-time locale. */
const statusLabel = (): Record<string, string> => ({
  cancelled: t("s_a5ffdc95ee"),
  completed: t("s_e99b48a29b"),
  in_progress: t("s_6f1972e48e"),
  pending: t("s_59a9eb4e65"),
});

const isFinished = (todo: TodoInfo): boolean =>
  todo.status === "completed" || todo.status === "cancelled";

function TodoDetails({ active, todos }: { active: boolean; todos: TodoInfo[] }) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
      {todos.map((todo, index) => {
        const completed = todo.status === "completed";
        const running = todo.status === "in_progress" && active;
        const cancelled = todo.status === "cancelled";
        const Icon = completed ? Check : running ? LoaderCircle : Circle;
        return (
          <div className="flex items-start gap-2 rounded-md px-1.5 py-1.5 text-xs" key={todo.id ?? `${todo.content}-${index}`}>
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${running ? "animate-spin text-primary" : completed ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span className={completed || cancelled ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>
              {todo.content}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {statusLabel()[todo.status] ?? todo.status}
              {todo.priority && ` · ${priorityLabel()[todo.priority] ?? todo.priority}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TodoPanel({
  active = true,
  diffs = [],
  todos,
}: {
  active?: boolean;
  diffs?: SessionFileDiff[];
  todos: TodoInfo[];
}) {
  const [open, setOpen] = useState(false);
  useAssistantOverlayDismiss(() => setOpen(false));
  const unfinished = todos.filter((todo) => !isFinished(todo));
  const hasTodos = active && unfinished.length > 0;
  const hasDiffs = active && diffs.length > 0;
  if (!hasTodos && !hasDiffs) return null;

  const activeTodo = unfinished.find((todo) => todo.status === "in_progress") ?? unfinished[0];
  const activeIndex = activeTodo ? Math.max(0, todos.indexOf(activeTodo)) : 0;
  const running = activeTodo?.status === "in_progress";
  const additions = diffs.reduce((total, diff) => total + diff.additions, 0);
  const deletions = diffs.reduce((total, diff) => total + diff.deletions, 0);

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("run.viewProgress")}
            className="pointer-events-auto mx-auto flex h-8 max-w-full items-center gap-2 rounded-full bg-popover px-3 text-xs text-popover-foreground shadow-sm ring-1 ring-border/50 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            type="button"
          >
            {hasTodos
              ? running
                ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
                : <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
              : <FilePenLine className="size-3.5 shrink-0 text-muted-foreground" />}
            {hasTodos && activeTodo && (
              <>
                <span className="shrink-0 font-medium">
                  {running
                    ? t("s_137e09917b", { p0: activeIndex + 1, p1: todos.length })
                    : t("todo.stoppedAt", { current: activeIndex + 1, total: todos.length })}
                </span>
                <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border" />
                <span className="min-w-0 truncate text-muted-foreground">{activeTodo.content}</span>
              </>
            )}
            {hasDiffs && (
              <span className={hasTodos ? "shrink-0 font-mono text-[10px] text-muted-foreground" : "shrink-0 font-medium"}>
                {hasTodos ? `+${additions} -${deletions}` : t("run.filesChanged", { count: diffs.length })}
              </span>
            )}
            <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="pointer-events-auto w-[min(32rem,calc(100vw-2rem))] border-0 p-3 shadow-lg ring-1 ring-border/50"
          side="top"
          sideOffset={8}
        >
          {hasTodos && hasDiffs ? (
            <Tabs className="min-h-0" defaultValue="todo">
              <TabsList className="h-8 w-full" variant="line">
                <TabsTrigger className="text-xs" value="todo"><ListTodo className="size-3.5" />{t("run.todoTab")}</TabsTrigger>
                <TabsTrigger className="text-xs" value="files"><FilePenLine className="size-3.5" />{t("run.filesTab")}</TabsTrigger>
              </TabsList>
              <TabsContent className="mt-2" value="todo"><TodoDetails active={active} todos={todos} /></TabsContent>
              <TabsContent className="mt-2 max-h-64 overflow-y-auto" value="files"><DiffFileList diffs={diffs} initialFileCount={6} /></TabsContent>
            </Tabs>
          ) : hasTodos ? (
            <TodoDetails active={active} todos={todos} />
          ) : (
            <div className="max-h-64 overflow-y-auto"><DiffFileList diffs={diffs} initialFileCount={6} /></div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
