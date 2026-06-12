import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateTasks,
  useUpdateTask,
  useDeleteTask,
  useRenameTaskGroup,
  useGetTodayStats,
  getTimeline,
  getGetTodayStatsQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Play, Check, AlignLeft, Link2, ExternalLink, X, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { BudgetMeter } from "./BudgetMeter";
import { normalizeUrl, linkHost } from "@/lib/url";

interface TimelineProps {
  onTaskSelect: (taskName: string) => void;
  onTaskStart: (taskName: string) => void;
  onCollapse: () => void;
}

type TaskGroup = {
  name: string;
  blocks: Task[];
  totalEstimated: number;
  completedCount: number;
  plays: number;
  description: string | null;
  link: string | null;
};

type DaySection = {
  date: string;
  groups: TaskGroup[];
  completedBlocks: number;
  minutes: number;
};

const PAGE_DAYS = 7;

// Eastern "today" so day labels line up with the server's day boundaries.
function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function shiftDay(dateStr: string, days: number): string {
  const d = parseISO(dateStr);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

function dayLabel(dateStr: string): string {
  const today = easternToday();
  if (dateStr === today) return "Today";
  if (dateStr === shiftDay(today, -1)) return "Yesterday";
  return format(parseISO(dateStr), "EEE, MMM d");
}

// Group a day's tasks by name, preserving insertion (creation) order.
function groupByName(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const existing = map.get(task.name) ?? [];
    existing.push(task);
    map.set(task.name, existing);
  }
  return Array.from(map.entries()).map(([name, blocks]) => {
    const sorted = [...blocks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    return {
      name,
      blocks: sorted,
      totalEstimated: sorted[0].totalChunks,
      completedCount: sorted.filter((b) => b.completed).length,
      plays: sorted[0].plays,
      description: sorted[0].description ?? null,
      link: sorted[0].link ?? null,
    };
  });
}

export function Timeline({ onTaskSelect, onTaskStart, onCollapse }: TimelineProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [blockCount, setBlockCount] = useState<number>(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useGetTodayStats();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["timeline"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getTimeline(pageParam ? { before: pageParam, limit: PAGE_DAYS } : { limit: PAGE_DAYS }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  });

  const createTasks = useCreateTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const renameTaskGroup = useRenameTaskGroup();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
  };

  const { openGroups, daySections } = useMemo(() => {
    const allTasks = data?.pages.flatMap((p) => p.tasks) ?? [];
    const byDate = new Map<string, Task[]>();
    for (const t of allTasks) {
      const existing = byDate.get(t.date) ?? [];
      existing.push(t);
      byDate.set(t.date, existing);
    }

    const collectedOpen: TaskGroup[] = [];
    const sections: DaySection[] = [];

    for (const [date, tasks] of byDate.entries()) {
      const completedBlocks = tasks.filter((t) => t.completed).length;
      const groups = groupByName(tasks);

      const pending = groups.filter((g) => g.completedCount < g.blocks.length);
      const done = groups.filter((g) => g.completedCount === g.blocks.length);

      collectedOpen.push(...pending);

      // Done groups under the day divider in chronological order.
      done.sort((a, b) =>
        new Date(a.blocks[0].createdAt).getTime() - new Date(b.blocks[0].createdAt).getTime()
      );

      if (completedBlocks > 0) {
        sections.push({ date, groups: done, completedBlocks, minutes: completedBlocks * 30 });
      }
    }

    // Open tasks float above all day dividers, newest-added first.
    collectedOpen.sort((a, b) =>
      new Date(b.blocks[0].createdAt).getTime() - new Date(a.blocks[0].createdAt).getTime()
    );

    return { openGroups: collectedOpen, daySections: sections };
  }, [data]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    try {
      await createTasks.mutateAsync({ data: { name: newTaskName.trim(), chunks: blockCount } });
      setNewTaskName("");
      setBlockCount(1);
      refresh();
    } catch (err) {
      console.error("Failed to create tasks", err);
    }
  };

  const handleToggleBlock = async (block: Task) => {
    try {
      await updateTask.mutateAsync({ id: block.id, data: { completed: !block.completed } });
      refresh();
    } catch (err) {
      console.error("Failed to toggle block", err);
    }
  };

  const handlePlay = async (group: TaskGroup) => {
    onTaskStart(group.name);
    try {
      await updateTask.mutateAsync({ id: group.blocks[0].id, data: { incrementPlays: 1 } });
      refresh();
    } catch (err) {
      console.error("Failed to record play", err);
      toast({
        title: "Couldn't record this play",
        description: "Your timer started, but the play count wasn't saved.",
        variant: "destructive",
      });
    }
  };

  const handleCompleteAll = async (group: TaskGroup) => {
    const openBlocks = group.blocks.filter((b) => !b.completed);
    try {
      await Promise.all(openBlocks.map((b) => updateTask.mutateAsync({ id: b.id, data: { completed: true } })));
      refresh();
    } catch (err) {
      console.error("Failed to complete group", err);
    }
  };

  const handleDeleteGroup = async (blocks: Task[]) => {
    try {
      await Promise.all(blocks.map((b) => deleteTask.mutateAsync({ id: b.id })));
      refresh();
    } catch (err) {
      console.error("Failed to delete task group", err);
    }
  };

  // Rename every block of a (name, date) group in one atomic server call.
  const handleRename = async (group: TaskGroup, newName: string) => {
    const next = newName.trim();
    if (!next || next === group.name) return;
    try {
      await renameTaskGroup.mutateAsync({
        data: { name: group.name, date: group.blocks[0].date, newName: next },
      });
      refresh();
    } catch (err) {
      console.error("Failed to rename task", err);
      toast({
        title: "Couldn't rename this task",
        description: "A task with that name may already exist on this day.",
        variant: "destructive",
      });
    }
  };

  // Note/link live on the first block (chunkIndex 1) of a group, like plays.
  const handleUpdateMeta = async (
    group: TaskGroup,
    data: { description?: string; link?: string },
  ) => {
    const first = group.blocks[0];
    try {
      await updateTask.mutateAsync({ id: first.id, data });
      refresh();
    } catch (err) {
      console.error("Failed to update task note", err);
    }
  };

  // Infinite scroll: load older days when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmpty = !isLoading && openGroups.length === 0 && daySections.length === 0;

  return (
    <section className="flex flex-col gap-8">
      {/* Add a new block */}
      <div>
        <form onSubmit={handleAddTask} className="flex gap-2">
          <Input
            placeholder="What's next?"
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onFocus={onCollapse}
            className="flex-1 h-11 bg-card border-border/60"
          />
          <div className="flex items-center bg-card rounded-md overflow-hidden border border-border/60">
            <button
              type="button"
              className="px-3 h-11 text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setBlockCount(Math.max(1, blockCount - 1))}
            >
              –
            </button>
            <div className="w-8 text-center text-sm font-medium tabular-nums">{blockCount}</div>
            <button
              type="button"
              className="px-3 h-11 text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setBlockCount(Math.min(16, blockCount + 1))}
            >
              +
            </button>
          </div>
          <Button type="submit" className="h-11" disabled={!newTaskName.trim() || createTasks.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </form>

        {/* Today summary */}
        <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">{stats?.totalBlocks ?? 0}</span> blocks today
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">{stats?.totalMinutes ?? 0}</span> min focused
          </span>
        </div>

        {/* Planned work vs. time left in the day */}
        <BudgetMeter plannedRemaining={stats?.openPlannedBlocks ?? 0} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-16 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-16 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-16 bg-muted/40 rounded-lg animate-pulse" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center text-center py-20 text-muted-foreground">
          <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="font-medium text-foreground mb-1">Nothing here yet</p>
          <p className="text-sm max-w-xs">Add something above, or just start the timer — your focus blocks land here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Open tasks — float above all date dividers, newest first */}
          {openGroups.length > 0 && (
            <div className="flex flex-col gap-1">
              {openGroups.map((group) => (
                <TimelineGroup
                  key={group.blocks[0].id}
                  group={group}
                  onToggleBlock={handleToggleBlock}
                  onPlay={handlePlay}
                  onCompleteAll={handleCompleteAll}
                  onUpdateMeta={handleUpdateMeta}
                  onRename={handleRename}
                  onDelete={handleDeleteGroup}
                  onSelect={onTaskSelect}
                />
              ))}
            </div>
          )}

          {/* Completed blocks organised by day */}
          {daySections.map((section) => (
            <div key={section.date} className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80 whitespace-nowrap">
                  {dayLabel(section.date)}
                </h2>
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-xs text-muted-foreground/70 whitespace-nowrap tabular-nums">
                  {section.completedBlocks} {section.completedBlocks === 1 ? "block" : "blocks"} · {section.minutes} min
                </span>
              </div>

              {section.groups.length > 0 && (
                <div className="flex flex-col gap-1">
                  {section.groups.map((group) => (
                    <TimelineGroup
                      key={group.blocks[0].id}
                      group={group}
                      onToggleBlock={handleToggleBlock}
                      onPlay={handlePlay}
                      onCompleteAll={handleCompleteAll}
                      onUpdateMeta={handleUpdateMeta}
                      onRename={handleRename}
                      onDelete={handleDeleteGroup}
                      onSelect={onTaskSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          <div ref={sentinelRef} className="h-6 flex items-center justify-center">
            {isFetchingNextPage && (
              <span className="text-xs text-muted-foreground">Loading earlier days…</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface TimelineGroupProps {
  group: TaskGroup;
  onToggleBlock: (block: Task) => void;
  onPlay: (group: TaskGroup) => void;
  onCompleteAll: (group: TaskGroup) => void;
  onUpdateMeta: (group: TaskGroup, data: { description?: string; link?: string }) => void;
  onRename: (group: TaskGroup, newName: string) => void;
  onDelete: (blocks: Task[]) => void;
  onSelect: (name: string) => void;
}

function TimelineGroup({ group, onToggleBlock, onPlay, onCompleteAll, onUpdateMeta, onRename, onDelete, onSelect }: TimelineGroupProps) {
  const allDone = group.completedCount === group.blocks.length;
  const hasPending = !allDone;
  const overEstimate = group.completedCount > group.totalEstimated;

  const hasNote = Boolean(group.description);
  const hasLink = Boolean(group.link);
  const hasMeta = hasNote || hasLink;

  const [expanded, setExpanded] = useState(false);
  const [draftNote, setDraftNote] = useState(group.description ?? "");
  const [editingLink, setEditingLink] = useState(false);
  const [draftLink, setDraftLink] = useState(group.link ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(group.name);

  // Keep local drafts in sync if the group's data changes underneath us.
  useEffect(() => {
    setDraftNote(group.description ?? "");
  }, [group.description]);
  useEffect(() => {
    setDraftLink(group.link ?? "");
  }, [group.link]);
  useEffect(() => {
    setDraftTitle(group.name);
  }, [group.name]);

  // Enter fires commitTitle and then the unmount fires onBlur → guard so the
  // rename only goes out once.
  const titleCommittedRef = useRef(false);

  const beginEditTitle = () => {
    titleCommittedRef.current = false;
    setDraftTitle(group.name);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    if (titleCommittedRef.current) return;
    titleCommittedRef.current = true;
    setEditingTitle(false);
    const next = draftTitle.trim();
    if (!next || next === group.name) {
      setDraftTitle(group.name);
      return;
    }
    onRename(group, next);
  };

  const cancelTitle = () => {
    titleCommittedRef.current = true;
    setEditingTitle(false);
    setDraftTitle(group.name);
  };

  const saveNote = () => {
    const next = draftNote.trim();
    if (next !== (group.description ?? "")) {
      onUpdateMeta(group, { description: next });
    }
  };

  const saveLink = () => {
    const next = draftLink.trim() ? normalizeUrl(draftLink) : "";
    setEditingLink(false);
    if (next !== (group.link ?? "")) {
      onUpdateMeta(group, { link: next });
    }
  };

  const removeLink = () => {
    setDraftLink("");
    setEditingLink(false);
    onUpdateMeta(group, { link: "" });
  };

  // Completed blocks become the day's "log" lines (time · rating · note).
  const completedBlocks = group.blocks
    .filter((b) => b.completed && b.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  return (
    <div className={`group rounded-lg px-3 py-3 transition-colors hover:bg-muted/30 ${allDone ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Block dots — only when there's something still to do */}
        {hasPending && (
          <div className="flex flex-wrap gap-1.5 flex-shrink-0 mt-1" style={{ maxWidth: "7rem" }}>
            {group.blocks.map((block) => (
              <button
                key={block.id}
                title={block.completed ? `Block ${block.chunkIndex} — done` : `Block ${block.chunkIndex} — mark done`}
                onClick={() => onToggleBlock(block)}
                className={`w-4 h-4 rounded-[3px] border-2 transition-all hover:scale-110 focus:outline-none ${
                  block.completed
                    ? "bg-primary border-primary"
                    : "bg-transparent border-muted-foreground/40 hover:border-primary/60"
                }`}
              />
            ))}
          </div>
        )}

        {allDone && (
          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-3 h-3 text-primary" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <Input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitle();
                }
              }}
              className="h-7 px-2 py-0 text-sm font-medium"
            />
          ) : (
            <span
              className={`font-medium break-words ${hasPending ? "cursor-pointer" : ""} ${allDone ? "text-muted-foreground" : "text-foreground"}`}
              onClick={() => hasPending && onSelect(group.name)}
            >
              {group.name}
            </span>
          )}

          {/* Meta line: counts on the left, hover actions on the right —
              keeping the actions here means they never steal title width */}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
              <span>
                {group.completedCount} / {group.totalEstimated} blocks
                {overEstimate && (
                  <span className="ml-1 text-amber-500">+{group.completedCount - group.totalEstimated} over</span>
                )}
              </span>
              {group.plays > 0 && (
                <span className="flex items-center gap-0.5 text-primary/80">
                  <Play className="w-3 h-3 fill-current" />
                  {group.plays}
                </span>
              )}
            </span>

            <div
              className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${
                expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              }`}
            >
              <button
                type="button"
                title="Rename task"
                onClick={beginEditTitle}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={hasMeta ? "Show note & link" : "Add a note or link"}
                onClick={() => setExpanded((v) => !v)}
                className={`w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-primary/10 transition-colors ${
                  expanded ? "text-primary" : "text-muted-foreground hover:text-primary"
                }`}
              >
                {hasMeta ? <AlignLeft className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
              {hasPending && (
                <>
                  <button
                    type="button"
                    title="Mark all done"
                    onClick={() => onCompleteAll(group)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Start a 30-min focus block for this task"
                    onClick={() => onPlay(group)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                </>
              )}
              <button
                type="button"
                title="Delete task"
                onClick={() => onDelete(group.blocks)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Faint note preview (collapsed) — click to expand for full context */}
      {hasMeta && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`mt-1.5 flex items-center gap-2 text-left text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors w-full ${
            hasPending ? "pl-[2.1rem]" : "pl-8"
          }`}
        >
          {hasNote ? (
            <span className="truncate">{group.description}</span>
          ) : (
            <span className="flex items-center gap-1.5 truncate text-primary/70">
              <Link2 className="w-3 h-3 flex-shrink-0" />
              {linkHost(group.link!)}
            </span>
          )}
        </button>
      )}

      {/* Expanded note + link editor */}
      {expanded && (
        <div className={`mt-2 space-y-2.5 ${hasPending ? "pl-[2.1rem]" : "pl-8"} pr-1`}>
          <Textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Add a note or plan for this task…"
            rows={3}
            className="resize-none bg-card border-border/60 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
          />

          {/* Link capture */}
          {group.link && !editingLink ? (
            <a
              href={normalizeUrl(group.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <img
                src={`https://icons.duckduckgo.com/ip3/${linkHost(group.link)}.ico`}
                alt=""
                className="w-4 h-4 rounded-sm flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground truncate">{linkHost(group.link)}</span>
                <span className="text-[11px] text-muted-foreground truncate">{group.link}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 group-hover/link:text-primary transition-colors" />
              <button
                type="button"
                title="Edit link"
                onClick={(e) => {
                  e.preventDefault();
                  setDraftLink(group.link ?? "");
                  setEditingLink(true);
                }}
                className="text-muted-foreground/40 hover:text-primary transition-colors flex-shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Remove link"
                onClick={(e) => {
                  e.preventDefault();
                  removeLink();
                }}
                className="text-muted-foreground/40 hover:text-destructive transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </a>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 focus-within:border-primary/40 transition-colors">
              <Link2 className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
              <Input
                autoFocus={editingLink}
                value={draftLink}
                onChange={(e) => setDraftLink(e.target.value)}
                onBlur={saveLink}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraftLink(group.link ?? "");
                    setEditingLink(false);
                  }
                }}
                placeholder="Paste a link…"
                className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
            </div>
          )}
        </div>
      )}

      {/* Completion log lines */}
      {completedBlocks.length > 0 && (
        <div className={`mt-2 space-y-1 ${hasPending ? "pl-[2.1rem]" : "pl-8"}`}>
          {completedBlocks.map((block) => (
            <div key={block.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums whitespace-nowrap">
                {format(new Date(block.completedAt!), "h:mm a")}
              </span>
              {block.rating && <span className="leading-none">{block.rating}</span>}
              {block.notes && <span className="leading-relaxed">{block.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
