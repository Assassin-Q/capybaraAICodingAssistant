import { useMemo, useState } from "react";
import { Check, MessageSquarePlus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sessionName } from "@/components/assistant/shared";
import type { SessionInfo } from "@/lib/opencode";
import { t } from "@/lib/i18n";

export function SessionDialog({
  open,
  sessions,
  selectedSessionID,
  onOpenChange,
  onSelect,
  onCreate,
  onDelete,
  deletingSessionID,
  pendingApprovalSessionIDs = [],
}: {
  onCreate: () => void;
  onDelete: (session: SessionInfo) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (sessionID: string) => void;
  deletingSessionID?: string;
  open: boolean;
  /** Sessions with an approval request still waiting for an answer. */
  pendingApprovalSessionIDs?: string[];
  selectedSessionID: string;
  sessions: SessionInfo[];
}) {
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SessionInfo>();
  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? sessions.filter((session) => sessionName(session).toLowerCase().includes(query)) : sessions;
  }, [search, sessions]);

  return (
    <Dialog onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDelete(undefined); onOpenChange(nextOpen); }} open={open}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("s_b7e8848103")}</DialogTitle>
          <DialogDescription>{t("s_1a9da7c516")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" onChange={(event) => setSearch(event.target.value)} placeholder={t("s_11b93c0d82")} value={search} />
        </div>
        <div className="max-h-[min(55vh,28rem)] overflow-y-auto">
          {filteredSessions.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("s_3c453f9a2e")}</p> : (
            <div className="flex flex-col gap-1">
              {filteredSessions.map((session) => (
                <div className={["group flex min-w-0 items-center gap-1 rounded-md text-sm transition-colors", session.id === selectedSessionID ? "bg-secondary text-foreground" : "hover:bg-muted"].join(" ")} key={session.id}>
                  <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={() => onSelect(session.id)} type="button">
                    <MessageSquarePlus className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{sessionName(session)}</span>
                    {/* A blocked run is invisible once you switch away, so it is flagged here. */}
                    {pendingApprovalSessionIDs.includes(session.id) && (
                      <span
                        className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                        title={t("s_ab4e3407ac")}
                      >
                        {t("s_29607f9c8b")}
                      </span>
                    )}
                    {session.id === selectedSessionID && <Check className="size-4 shrink-0" />}
                  </button>
                  <Button
                    aria-label={t("s_89a1b514a2", { p0: sessionName(session) })}
                    className="mr-1 size-7 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    disabled={deletingSessionID === session.id}
                    onClick={() => setPendingDelete(session)}
                    size="icon"
                    title={t("s_19cf29f826")}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button className="w-full" onClick={onCreate} type="button" variant="outline"><MessageSquarePlus className="size-4" />{t("s_3da224c43d")}</Button>
      </DialogContent>
      <Dialog onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDelete(undefined); }} open={Boolean(pendingDelete)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base">{t("s_0ff706bf52")}</DialogTitle><DialogDescription>{pendingDelete ? sessionName(pendingDelete) : t("s_ea680f8349")}{t("s_e126157f94")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(undefined)} size="sm" type="button" variant="ghost">{t("s_4d0b4688c7")}</Button>
            <Button disabled={!pendingDelete || deletingSessionID === pendingDelete.id} onClick={() => { if (pendingDelete) onDelete(pendingDelete); setPendingDelete(undefined); }} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />{t("s_19cf29f826")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
