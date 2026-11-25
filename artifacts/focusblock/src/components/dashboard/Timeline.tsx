import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateTasks,
  useUpdateTask,
  useDeleteTask,
  useRenameTaskGroup,
  useAddBlock,
  useGetTodayStats,
  useGetOpenTasks,
  usePlaceTask,
  getTimeline,
  getGetTodayStatsQueryKey,
  getGetOpenTasksQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus, Trash2, Play, Pause, Link2, ExternalLink, X, AlignJustify, GripVertical } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { BudgetMeter } from "./BudgetMeter";
import { normalizeUrl, linkHost, parseStoredLinks } from "@/lib/url";
import { cn } from "@/lib/utils";

type Rating = "😩" | "😐" | "🙂" | "🔥";
const RATINGS: Rating[] = ["😩", "😐", "🙂", "🔥"];

function RatingDots({ rating }: { rating: string }) {
  const idx = RATINGS.indexOf(rating as Rating);
  if (idx === -1) return null;
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {RATINGS.map((_, i) => (
        <span
          key={i}
          className={cn(
            "inline-block w-1.5 h-1.5 rounded-full",
            i <= idx ? "bg-primary/70" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

export type FocusSession = { name: string; running: boolean };

type Horizon = Task["horizon"];

interface TimelineProps {
  onTaskSelect: (taskName: string) => void;
  onTaskStart: (taskName: string, date: string) => void;
  onCollapse: () => void;
  session: FocusSession | null;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onNowChange?: (name: string | null) => void;
}

type TaskGroup = {
  name: string;
  blocks: Task[];
  totalEstimated: number;
  completedCount: number;
  plays: number;
  description: string | null;
  link: string | null;
  links: string[];
  horizon: Horizon;
  position: number;
};

type DragPayload = { name: string; date: string };

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

// Eastern calendar day (YYYY-MM-DD) for an instant.
function easternDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
}

// The day a fully-completed group is logged under: the latest Eastern day any of
// its blocks was completed. Falls back to the planned date if (somehow) none has
// a timestamp. Mirrors the server's `log_day`, but resolved per-GROUP so a group
// is never split across day buckets (which would orphan chunkIndex-1 metadata).
function groupCompletionDay(g: TaskGroup): string {
  let latest = "";
  for (const b of g.blocks) {
    if (b.completed && b.completedAt) {
      const d = easternDateOf(b.completedAt);
      if (d > latest) latest = d;
    }
  }
  return latest || g.blocks[0].date;
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
      links: sorted[0].links?.length ? sorted[0].links : parseStoredLinks(sorted[0].link),
      link: (sorted[0].links?.length ? sorted[0].links : parseStoredLinks(sorted[0].link))[0] ?? null,
      horizon: sorted[0].horizon === "now" || sorted[0].horizon === "later" ? sorted[0].horizon : "next",
      position: sorted[0].position ?? 0,
    };
  });
}

function groupsFromTasks(tasks: Task[]): TaskGroup[] {
  const byGroup = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = `${task.date}\u0000${task.name}`;
    const existing = byGroup.get(key) ?? [];
    existing.push(task);
    byGroup.set(key, existing);
  }
  return [...byGroup.values()].map((blocks) => groupByName(blocks)[0]);
}

function groupKey(group: TaskGroup) {
  return `${group.blocks[0].date}\u0000${group.name}`;
}

function sameGroup(group: TaskGroup, name: string, date: string) {
  return group.name === name && group.blocks[0].date === date;
}

function bySequence(a: TaskGroup, b: TaskGroup) {
  if (a.position !== b.position) return a.position - b.position;
  return new Date(b.blocks[0].createdAt).getTime() - new Date(a.blocks[0].createdAt).getTime();
}

// Index in `list` after `payload` has been removed. `before` null appends.
function insertionIndex(list: TaskGroup[], payload: DragPayload, before: TaskGroup | null) {
  const without = list.filter((group) => !sameGroup(group, payload.name, payload.date));
  if (!before) return without.length;
  const index = without.findIndex((group) => sameGroup(group, before.name, before.blocks[0].date));
  return index === -1 ? without.length : index;
}

export function Timeline({ onTaskSelect, onTaskStart, onCollapse, session, onPauseSession, onResumeSession, onNowChange }: TimelineProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [blockCount, setBlockCount] = useState<number>(1);
  const [newNote, setNewNote] = useState("");
  const [newLinks, setNewLinks] = useState<string[]>([]);
  const [newLinkDraft, setNewLinkDraft] = useState("");
  const [showNoteField, setShowNoteField] = useState(false);
  const [showLinkField, setShowLinkField] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [overKey, setOverKey] = useState<string | null>(null);
  const dragRef = useRef<DragPayload | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useGetTodayStats();
  const openQuery = useGetOpenTasks();
  const placeTask = usePlaceTask();

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
  const addBlockMutation = useAddBlock();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOpenTasksQueryKey() });
  };

  const { nowGroup, nextGroups, laterGroups, daySections } = useMemo(() => {
    const timelineTasks = data?.pages.flatMap((p) => p.tasks) ?? [];
    const doneByDay = new Map<string, TaskGroup[]>();

    for (const group of groupsFromTasks(timelineTasks)) {
      if (group.completedCount < group.blocks.length) continue;
      const day = groupCompletionDay(group);
      const list = doneByDay.get(day) ?? [];
      list.push(group);
      doneByDay.set(day, list);
    }

    const sections: DaySection[] = [...doneByDay.keys()]
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => {
        const done = doneByDay.get(date)!;
        done.sort(
          (a, b) =>
            new Date(a.blocks[0].createdAt).getTime() - new Date(b.blocks[0].createdAt).getTime(),
        );
        const completedBlocks = done.reduce((n, g) => n + g.completedCount, 0);
        return { date, groups: done, completedBlocks, minutes: completedBlocks * 30 };
      });

    const open = groupsFromTasks(openQuery.data?.tasks ?? []);
    const nows = open.filter((group) => group.horizon === "now").sort(bySequence);
    const next = open.filter((group) => group.horizon === "next").sort(bySequence);
    const later = open.filter((group) => group.horizon === "later").sort(bySequence);

    return {
      nowGroup: nows[0] ?? null,
      // A second Now only happens if the sequence was written twice. Keep it
      // visible at the front of Next instead of dropping it.
      nextGroups: [...nows.slice(1), ...next],
      laterGroups: later,
      daySections: sections,
    };
  }, [data, openQuery.data]);

  useEffect(() => {
    if (!openQuery.isSuccess) return;
    onNowChange?.(nowGroup?.name ?? null);
  }, [openQuery.isSuccess, nowGroup?.name, onNowChange]);

  const addDraftLink = () => {
    const next = normalizeUrl(newLinkDraft);
    if (!next) return;
    setNewLinks((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setNewLinkDraft("");
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    const pendingLink = normalizeUrl(newLinkDraft);
    const links = pendingLink && !newLinks.includes(pendingLink) ? [...newLinks, pendingLink] : newLinks;
    try {
      await createTasks.mutateAsync({
        data: {
          name: newTaskName.trim(),
          chunks: blockCount,
          ...(newNote.trim() ? { description: newNote.trim() } : {}),
          ...(links.length > 0 ? { links } : {}),
        },
      });
      setNewTaskName("");
      setNewNote("");
      setNewLinks([]);
      setNewLinkDraft("");
      setShowNoteField(false);
      setShowLinkField(false);
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
    onTaskStart(group.name, group.blocks[0].date);
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

  const handleAddBlock = async (group: TaskGroup) => {
    try {
      await addBlockMutation.mutateAsync({ data: { name: group.name } });
      refresh();
    } catch (err) {
      console.error("Failed to add block", err);
    }
  };

  const handleRemoveBlock = async (group: TaskGroup) => {
    // Remove the last open (uncompleted) block, if any.
    const openBlocks = group.blocks.filter((b) => !b.completed);
    if (openBlocks.length === 0) return;
    const last = openBlocks[openBlocks.length - 1];
    try {
      await deleteTask.mutateAsync({ id: last.id });
      refresh();
    } catch (err) {
      console.error("Failed to remove block", err);
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
    data: { description?: string; links?: string[] },
  ) => {
    const first = group.blocks[0];
    try {
      await updateTask.mutateAsync({ id: first.id, data });
      refresh();
    } catch (err) {
      console.error("Failed to update task note", err);
    }
  };

  const findGroup = (payload: DragPayload) =>
    [nowGroup, ...nextGroups, ...laterGroups].find(
      (group): group is TaskGroup => !!group && sameGroup(group, payload.name, payload.date),
    );

  const moveGroup = async (group: TaskGroup, horizon: Horizon, index: number) => {
    try {
      await placeTask.mutateAsync({
        data: { name: group.name, date: group.blocks[0].date, horizon, index },
      });
      refresh();
    } catch (err) {
      console.error("Failed to place task", err);
      toast({
        title: "Couldn't update the order",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearDrag = () => {
    dragRef.current = null;
    setOverKey(null);
  };

  const markOver = (key: string) => {
    setOverKey((current) => (current === key ? current : key));
  };

  const readPayload = (event: React.DragEvent): DragPayload | null => {
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return dragRef.current;
    try {
      const parsed = JSON.parse(raw) as DragPayload;
      if (!parsed?.name || !parsed.date) return dragRef.current;
      return parsed;
    } catch {
      return dragRef.current;
    }
  };

  const onGripDragStart = (event: React.DragEvent, group: TaskGroup) => {
    const payload = { name: group.name, date: group.blocks[0].date };
    dragRef.current = payload;
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  const dropOnList = (horizon: "next" | "later", list: TaskGroup[], before: TaskGroup | null, payload: DragPayload) => {
    if (before && sameGroup(before, payload.name, payload.date)) return;
    const group = findGroup(payload);
    if (!group) return;
    if (horizon === "later") setLaterOpen(true);
    void moveGroup(group, horizon, insertionIndex(list, payload, before));
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

  const listLoading = (isLoading && !data) || (openQuery.isLoading && !openQuery.data);
  const isEmpty =
    !listLoading && !nowGroup && nextGroups.length === 0 && laterGroups.length === 0 && daySections.length === 0;

  const sectionLabel = (label: string) => (
    <div data-section-label className="flex items-center gap-4">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80 whitespace-nowrap">
        {label}
      </h2>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );

  const edgeFor = (horizon: "next" | "later", group: TaskGroup) => {
    const key = `${horizon}:${groupKey(group)}`;
    if (overKey === `${key}:before`) return "before" as const;
    if (overKey === `${key}:after`) return "after" as const;
    return null;
  };

  const rowDragOver = (event: React.DragEvent, horizon: "next" | "later", group: TaskGroup) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    markOver(`${horizon}:${groupKey(group)}:${after ? "after" : "before"}`);
  };

  const rowDrop = (event: React.DragEvent, horizon: "next" | "later", group: TaskGroup, list: TaskGroup[]) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readPayload(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    clearDrag();
    if (!payload) return;
    const index = list.findIndex((item) => sameGroup(item, group.name, group.blocks[0].date));
    const before = after ? (list[index + 1] ?? null) : group;
    dropOnList(horizon, list, before, payload);
  };

  const sharedGroupProps = {
    onToggleBlock: handleToggleBlock,
    onPlay: handlePlay,
    onCompleteAll: handleCompleteAll,
    onUpdateMeta: handleUpdateMeta,
    onRename: handleRename,
    onDelete: handleDeleteGroup,
    onSelect: onTaskSelect,
    onAddBlock: handleAddBlock,
    onRemoveBlock: handleRemoveBlock,
    session,
    onPauseSession,
    onResumeSession,
  };

  const dropOnNow = (event: React.DragEvent) => {
    event.preventDefault();
    const payload = readPayload(event);
    clearDrag();
    if (!payload) return;
    if (nowGroup && sameGroup(nowGroup, payload.name, payload.date)) return;
    const group = findGroup(payload);
    if (!group) return;
    void moveGroup(group, "now", 0);
  };

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
          <div className="flex items-center bg-card rounded-md overflow-hidden border border-border/60 h-11">
            <button
              type="button"
              className="px-3 h-full text-muted-foreground hover:bg-muted/40 transition-colors text-base leading-none"
              onClick={() => setBlockCount(Math.max(1, blockCount - 1))}
            >
              –
            </button>
            <div className="w-16 flex flex-col items-center justify-center gap-[3px]">
              <span className="text-sm font-medium tabular-nums leading-none">{blockCount}</span>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums leading-none">
                {blockCount * 30 < 60
                  ? `${blockCount * 30} min`
                  : Number.isInteger(blockCount / 2)
                    ? `${blockCount / 2} hr`
                    : `${Math.floor(blockCount / 2)}½ hr`}
              </span>
            </div>
            <button
              type="button"
              className="px-3 h-full text-muted-foreground hover:bg-muted/40 transition-colors text-base leading-none"
              onClick={() => setBlockCount(Math.min(16, blockCount + 1))}
            >
              +
            </button>
          </div>
          <Button type="submit" className="h-11" disabled={!newTaskName.trim() || createTasks.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </form>
        <div className="mt-2 flex items-center gap-1 text-muted-foreground/70">
          <button
            type="button"
            title="Note"
            onClick={() => setShowNoteField((open) => !open)}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-md hover:text-foreground hover:bg-muted/40 transition-colors ${showNoteField || newNote.trim() ? "text-foreground" : ""}`}
          >
            <AlignJustify className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Link"
            onClick={() => setShowLinkField((open) => !open)}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-md hover:text-foreground hover:bg-muted/40 transition-colors ${showLinkField || newLinks.length > 0 ? "text-foreground" : ""}`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {showNoteField && (
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note or plan…"
            rows={2}
            className="mt-2 resize-none bg-card border-border/60 text-sm leading-relaxed placeholder:text-muted-foreground/50"
          />
        )}
        {showLinkField && (
          <div className="mt-2 space-y-2">
            {newLinks.map((url) => (
              <div key={url} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                <a
                  href={normalizeUrl(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate flex-1 hover:text-primary transition-colors"
                >
                  {linkHost(url)}
                </a>
                <button
                  type="button"
                  title="Remove link"
                  onClick={() => setNewLinks((prev) => prev.filter((item) => item !== url))}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5">
              <Link2 className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
              <Input
                value={newLinkDraft}
                onChange={(e) => setNewLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDraftLink();
                  }
                }}
                placeholder="Paste a link…"
                className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        )}

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

      {listLoading ? (
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
          <div className="flex flex-col">
          <section
            className={cn(
              "flex flex-col gap-2 rounded-lg pb-8",
              overKey === "now" && "bg-primary/5",
            )}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              markOver("now");
            }}
            onDrop={dropOnNow}
          >
            {sectionLabel("Now")}
            {nowGroup ? (
              <TimelineGroup
                group={nowGroup}
                {...sharedGroupProps}
                drag={{
                  onDragStart: (event) => onGripDragStart(event, nowGroup),
                  onDragEnd: clearDrag,
                }}
              />
            ) : (
              <p className="px-1 text-sm text-muted-foreground">Nothing in focus</p>
            )}
          </section>
          <section
            className={cn("flex flex-col gap-2 rounded-lg", overKey === "next:end" && "bg-primary/5")}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              markOver("next:end");
            }}
            onDrop={(event) => {
              event.preventDefault();
              const payload = readPayload(event);
              clearDrag();
              if (!payload) return;
              dropOnList("next", nextGroups, null, payload);
            }}
          >
            {sectionLabel("Next")}
            {nextGroups.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Nothing queued</p>
            ) : (
              nextGroups.map((group) => (
                <TimelineGroup
                  key={group.blocks[0].id}
                  group={group}
                  {...sharedGroupProps}
                  drag={{
                    onDragStart: (event) => onGripDragStart(event, group),
                    onDragEnd: clearDrag,
                  }}
                  dropEdge={edgeFor("next", group)}
                  onDragOver={(event) => rowDragOver(event, "next", group)}
                  onDrop={(event) => rowDrop(event, "next", group, nextGroups)}
                />
              ))
            )}
          </section>
          <section
            className={cn(
              "flex flex-col gap-2 rounded-lg pt-8",
              overKey === "later:end" && "bg-primary/5",
            )}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              markOver("later:end");
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const payload = readPayload(event);
              clearDrag();
              if (!payload) return;
              dropOnList("later", laterGroups, null, payload);
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setLaterOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setLaterOpen((open) => !open);
                }
              }}
              className="flex items-center gap-4 text-left"
            >
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80 whitespace-nowrap">
                Later
              </h2>
              <div className="h-px flex-1 bg-border/60" />
              {laterGroups.length > 0 && (
                <span className="text-xs text-muted-foreground/70 whitespace-nowrap tabular-nums">
                  {laterGroups.length} later
                </span>
              )}
            </div>
              {laterOpen &&
                laterGroups.map((group) => (
                  <TimelineGroup
                    key={group.blocks[0].id}
                    group={group}
                    {...sharedGroupProps}
                    drag={{
                      onDragStart: (event) => onGripDragStart(event, group),
                      onDragEnd: clearDrag,
                    }}
                    dropEdge={edgeFor("later", group)}
                    onDragOver={(event) => rowDragOver(event, "later", group)}
                    onDrop={(event) => rowDrop(event, "later", group, laterGroups)}
                  />
                ))}
          </section>
          </div>

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
                <div className="flex flex-col gap-2">
                  {section.groups.map((group) => (
                    <TimelineGroup key={group.blocks[0].id} group={group} {...sharedGroupProps} />
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
  onUpdateMeta: (group: TaskGroup, data: { description?: string; links?: string[] }) => void;
  onRename: (group: TaskGroup, newName: string) => void;
  onDelete: (blocks: Task[]) => void;
  onSelect: (name: string) => void;
  onAddBlock: (group: TaskGroup) => void;
  onRemoveBlock: (group: TaskGroup) => void;
  session: FocusSession | null;
  onPauseSession: () => void;
  onResumeSession: () => void;
  drag?: {
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dropEdge?: "before" | "after" | null;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
}

function TimelineGroup({ group, onToggleBlock, onPlay, onCompleteAll, onUpdateMeta, onRename, onDelete, onSelect, onAddBlock, onRemoveBlock, session, onPauseSession, onResumeSession, drag, dropEdge, onDragOver, onDrop }: TimelineGroupProps) {
  const allDone = group.completedCount === group.blocks.length;
  const hasPending = !allDone;
  const overEstimate = group.completedCount > group.totalEstimated;
  const rowSession = session && hasPending && session.name === group.name ? session : null;

  const [expanded, setExpanded] = useState(false);
  const [draftNote, setDraftNote] = useState(group.description ?? "");
  // Shown the moment a click-away commits, before the refetch lands.
  const [savedNote, setSavedNote] = useState(group.description ?? "");
  const [links, setLinks] = useState<string[]>(group.links);
  const [draftLink, setDraftLink] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(group.name);
  const rowRef = useRef<HTMLDivElement>(null);
  const noteEditorRef = useRef<HTMLDivElement>(null);
  const draftNoteRef = useRef(draftNote);
  const draftLinkRef = useRef(draftLink);
  const noteCommittedRef = useRef(group.description ?? "");
  const linksRef = useRef(links);
  // The click that commits the note can land on the preview that replaces the
  // editor. Ignore that one click so the field doesn't pop straight back open.
  const suppressOpenRef = useRef(false);
  draftNoteRef.current = draftNote;
  draftLinkRef.current = draftLink;
  linksRef.current = links;

  const hasNote = Boolean(savedNote.trim());
  const hasLink = links.length > 0;
  const hasMeta = hasNote || hasLink;

  // Keep local drafts in sync if the group's data changes underneath us.
  // Skip while there is an uncommitted edit so a refetch can't wipe the field.
  useEffect(() => {
    const text = group.description ?? "";
    if (draftNoteRef.current.trim() !== noteCommittedRef.current) return;
    noteCommittedRef.current = text;
    draftNoteRef.current = text;
    setDraftNote(text);
    setSavedNote(text);
  }, [group.description]);
  const linksKey = group.links.join("\n");
  useEffect(() => {
    linksRef.current = group.links;
    setLinks(group.links);
  }, [linksKey]);
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
    const field = noteEditorRef.current?.querySelector("textarea");
    const next = (field?.value ?? draftNoteRef.current).trim();
    draftNoteRef.current = next;
    setDraftNote(next);
    setSavedNote(next);
    if (next === noteCommittedRef.current) return;
    noteCommittedRef.current = next;
    onUpdateMeta(group, { description: next });
  };

  const saveLink = () => {
    const nextUrl = normalizeUrl(draftLinkRef.current);
    draftLinkRef.current = "";
    setDraftLink("");
    if (!nextUrl || linksRef.current.includes(nextUrl)) return;
    const next = [...linksRef.current, nextUrl];
    linksRef.current = next;
    setLinks(next);
    onUpdateMeta(group, { links: next });
  };

  const saveNoteRef = useRef(saveNote);
  const saveLinkRef = useRef(saveLink);
  saveNoteRef.current = saveNote;
  saveLinkRef.current = saveLink;

  // Blur doesn't fire when the click lands on a non-focusable part of the page,
  // so commit the note as soon as the pointer leaves the editor.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // Clicks on this row belong to the row. Clicks anywhere else commit and close.
      if (rowRef.current?.contains(target)) return;
      const root = noteEditorRef.current;
      if (root && root.contains(target)) return;
      saveNoteRef.current();
      saveLinkRef.current();
      const el = target instanceof Element ? target : target.parentElement;
      // The note button handles its own toggle. Anywhere else commits and closes.
      if (el?.closest("[data-note-toggle]")) return;
      suppressOpenRef.current = true;
      setExpanded(false);
      setTimeout(() => {
        suppressOpenRef.current = false;
      }, 0);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [expanded]);

  const toggleNote = () => {
    if (suppressOpenRef.current) return;
    if (expanded) {
      saveNote();
      saveLink();
    }
    setExpanded((open) => !open);
  };

  const draggedRef = useRef(false);

  const handleRowClick = (event: React.MouseEvent) => {
    if (draggedRef.current) return;
    if (editingTitle) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-play]")) return;
    // A second click on the title renames. The first click still opens the note.
    if (event.detail > 1) {
      if (target.closest("[data-task-title]")) beginEditTitle();
      return;
    }
    toggleNote();
  };

  const removeLink = (url: string) => {
    const next = linksRef.current.filter((item) => item !== url);
    linksRef.current = next;
    setLinks(next);
    onUpdateMeta(group, { links: next });
  };

  // Completed blocks become the day's "log" lines (time · rating · note).
  const completedBlocks = group.blocks
    .filter((b) => b.completed && b.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  return (
    <div
      ref={rowRef}
      draggable={Boolean(drag)}
      onDragStart={(event) => {
        if (!drag) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, textarea")) {
          event.preventDefault();
          return;
        }
        draggedRef.current = true;
        drag.onDragStart(event);
      }}
      onDragEnd={() => {
        if (!drag) return;
        drag.onDragEnd();
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      className={cn(
        "group cursor-pointer rounded-lg bg-card/70 px-3 py-3 transition-colors hover:bg-card",
        drag && "cursor-grab active:cursor-grabbing",
        allDone && "opacity-70",
        rowSession && "bg-primary/5 hover:bg-primary/10",
        dropEdge === "before" && "border-t-2 border-primary",
        dropEdge === "after" && "border-b-2 border-primary",
      )}
      onClick={handleRowClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-3">
        {drag && (
          <span
            data-no-play
            className="mt-1.5 inline-flex w-4 h-4 flex-shrink-0 items-center justify-center text-muted-foreground/25"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        {/* Block dots with − / + stepper — only when there's something still to do */}
        {hasPending && (
          <div data-no-play className="flex items-center gap-1 flex-shrink-0 mt-1.5">
            {group.blocks.length > 1 ? (
              <button
                type="button"
                title="Remove a block"
                onClick={() => onRemoveBlock(group)}
                className="w-4 h-4 inline-flex items-center justify-center rounded text-muted-foreground/70 hover:text-foreground transition-colors focus:outline-none opacity-0 group-hover:opacity-100"
              >
                <Minus className="w-3 h-3" strokeWidth={2.5} />
              </button>
            ) : (
              <span className="w-4 h-4 flex-shrink-0" aria-hidden />
            )}
            <div className="flex flex-wrap gap-1.5" style={{ maxWidth: "7rem" }}>
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
              <button
                type="button"
                title="Add a block"
                onClick={() => onAddBlock(group)}
                className="w-4 h-4 rounded-[3px] border border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50 transition-colors hover:text-primary hover:border-primary/50 focus:outline-none opacity-0 group-hover:opacity-100"
              >
                <Plus className="w-2.5 h-2.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {allDone && (
          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-primary text-[10px] font-bold">✓</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 min-h-7">
            {editingTitle ? (
              <Input
                data-no-play
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
                className="h-7 flex-1 px-2 py-0 text-sm font-medium"
              />
            ) : (
              <span
                data-task-title
                className={cn(
                  "min-w-0 font-medium truncate",
                  allDone ? "text-muted-foreground" : rowSession ? "text-primary" : "text-foreground",
                )}
              >
                {group.name}
              </span>
            )}

            <div
              data-no-play
              className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${
                expanded || rowSession ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              }`}
            >
              <button
                type="button"
                data-note-toggle
                title={expanded ? "Hide note" : "Note"}
                onClick={toggleNote}
                className={`w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-primary/10 transition-colors ${
                  expanded ? "text-primary" : "text-muted-foreground hover:text-primary"
                }`}
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
              {hasPending && (
                <button
                  type="button"
                  title={
                    rowSession?.running
                      ? "Pause focus block"
                      : rowSession
                        ? "Resume focus block"
                        : session
                          ? "Switch focus block"
                          : "Start focus block"
                  }
                  onClick={() => {
                    if (rowSession?.running) onPauseSession();
                    else if (rowSession) onResumeSession();
                    else onPlay(group);
                  }}
                  className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors hover:bg-primary/10 ${
                    rowSession?.running ? "text-primary" : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {rowSession?.running ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                </button>
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

          <div className="mt-0.5">
            <span className="text-xs text-muted-foreground font-mono">
              {group.completedCount} / {group.totalEstimated} blocks
              {overEstimate && (
                <span className="ml-1 text-amber-500">+{group.completedCount - group.totalEstimated} over</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Faint note preview (collapsed). Links open the URL; the note opens the editor. */}
      {hasMeta && !expanded && (
        <div
          data-no-play
          className={`mt-1.5 flex flex-col gap-1 text-xs ${hasPending ? "pl-[2.1rem]" : "pl-8"}`}
        >
          {hasNote && (
            <button
              type="button"
              onClick={toggleNote}
              className="truncate text-left text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              {savedNote}
            </button>
          )}
          {links.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {links.map((url) => (
                <a
                  key={url}
                  href={normalizeUrl(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex max-w-full items-center gap-1 text-primary/70 hover:text-primary transition-colors"
                >
                  <Link2 className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{linkHost(url)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expanded note + link editor */}
      {expanded && (
        <div
          ref={noteEditorRef}
          data-no-play
          className={`mt-2 space-y-2.5 ${hasPending ? "pl-[2.1rem]" : "pl-8"} pr-1`}
        >
          <Textarea
            value={draftNote}
            onChange={(e) => {
              draftNoteRef.current = e.target.value;
              setDraftNote(e.target.value);
            }}
            onBlur={saveNote}
            placeholder="Add a note or plan for this task…"
            rows={3}
            className="resize-none bg-card border-border/60 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
          />

          {links.map((url) => (
            <a
              key={url}
              href={normalizeUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <img
                src={`https://icons.duckduckgo.com/ip3/${linkHost(url)}.ico`}
                alt=""
                className="w-4 h-4 rounded-sm flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground truncate">{linkHost(url)}</span>
                <span className="text-[11px] text-muted-foreground truncate">{url}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 group-hover/link:text-primary transition-colors" />
              <button
                type="button"
                title="Remove link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeLink(url);
                }}
                className="text-muted-foreground/40 hover:text-destructive transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </a>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 focus-within:border-primary/40 transition-colors">
            <Link2 className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
            <Input
              value={draftLink}
              onChange={(e) => {
                draftLinkRef.current = e.target.value;
                setDraftLink(e.target.value);
              }}
              onBlur={saveLink}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  draftLinkRef.current = "";
                  setDraftLink("");
                }
              }}
              placeholder="Paste a link…"
              className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
          </div>
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
              {block.rating && <RatingDots rating={block.rating} />}
              {block.notes && <span className="leading-relaxed">{block.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
