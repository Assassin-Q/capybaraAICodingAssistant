import { Check, ChevronUp, Circle, ListTodo, LoaderCircle } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TodoInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";

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

export function TodoPanel({ active = true, todos }: { active?: boolean; todos: TodoInfo[] }) {
  const unfinished = todos.filter((todo) => !isFinished(todo));
  if (todos.length === 0 || unfinished.length === 0) return null;

  const activeTodo = todos.find((todo) => todo.status === "in_progress") ?? unfinished[0];
  const activeIndex = Math.max(0, todos.indexOf(activeTodo));

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label={t("s_9c31a29913")}
            className="pointer-events-auto mx-auto flex h-8 max-w-full items-center gap-2 rounded-full bg-popover px-3 text-xs text-popover-foreground shadow-sm ring-1 ring-border/50 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            type="button"
          >
            {activeTodo.status === "in_progress"
              ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
              : <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="shrink-0 font-medium">{t("s_137e09917b", { p0: activeIndex + 1, p1: todos.length })}</span>
            <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border" />
            <span className="min-w-0 truncate text-muted-foreground">{activeTodo.content}</span>
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="pointer-events-auto w-[min(28rem,calc(100vw-2rem))] border-0 p-3 shadow-lg ring-1 ring-border/50"
          side="top"
          sideOffset={8}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {todos.map((todo, index) => {
              const completed = todo.status === "completed";
              // Models routinely end a turn without calling todowrite again, leaving an item
              // marked in_progress forever. Once the run is over that spinner is simply false, so
              // the item is shown as unfinished instead of as work still happening.
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
