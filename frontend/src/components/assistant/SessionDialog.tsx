import { useMemo, useState } from "react";
import { Check, MessageSquarePlus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sessionName } from "@/components/assistant/shared";
import type { SessionInfo } from "@/lib/opencode";

export function SessionDialog({
  open,
  sessions,
  selectedSessionID,
  onOpenChange,
  onSelect,
  onCreate,
  onDelete,
  deletingSessionID,
}: {
  onCreate: () => void;
  onDelete: (session: SessionInfo) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (sessionID: string) => void;
  deletingSessionID?: string;
  open: boolean;
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
          <DialogTitle className="text-base">会话历史</DialogTitle>
          <DialogDescription>当前项目的 OpenCode 会话</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话" value={search} />
        </div>
        <div className="max-h-[min(55vh,28rem)] overflow-y-auto">
          {filteredSessions.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">还没有会话</p> : (
            <div className="flex flex-col gap-1">
              {filteredSessions.map((session) => (
                <div className={["group flex min-w-0 items-center gap-1 rounded-md text-sm transition-colors", session.id === selectedSessionID ? "bg-secondary text-foreground" : "hover:bg-muted"].join(" ")} key={session.id}>
                  <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={() => onSelect(session.id)} type="button">
                    <MessageSquarePlus className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{sessionName(session)}</span>
                    {session.id === selectedSessionID && <Check className="size-4 shrink-0" />}
                  </button>
                  <Button
                    aria-label={`删除会话 ${sessionName(session)}`}
                    className="mr-1 size-7 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    disabled={deletingSessionID === session.id}
                    onClick={() => setPendingDelete(session)}
                    size="icon"
                    title="删除会话"
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
        <Button className="w-full" onClick={onCreate} type="button" variant="outline"><MessageSquarePlus className="size-4" />新建会话</Button>
      </DialogContent>
      <Dialog onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDelete(undefined); }} open={Boolean(pendingDelete)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] gap-3 p-4 sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base">删除这个会话？</DialogTitle><DialogDescription>{pendingDelete ? sessionName(pendingDelete) : "当前会话"}，删除后无法恢复。</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(undefined)} size="sm" type="button" variant="ghost">取消</Button>
            <Button disabled={!pendingDelete || deletingSessionID === pendingDelete.id} onClick={() => { if (pendingDelete) onDelete(pendingDelete); setPendingDelete(undefined); }} size="sm" type="button" variant="destructive"><Trash2 className="size-3.5" />删除会话</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
