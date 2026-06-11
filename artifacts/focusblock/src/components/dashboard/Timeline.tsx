import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateTasks,
  useUpdateTask,
  useDeleteTask,
  useGetTodayStats,
  getTimeline,
  getGetTodayStatsQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Play, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TimelineProps {
  onTaskSelect: (taskName: string) => void;
  onTaskStart: (taskName: string) => void;
}

type TaskGroup = {
  name: string;
  blocks: Task[];
  totalEstimated: number;
  completedCount: number;
  plays: number;
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
    };
  });
}

export function Timeline({ onTaskSelect, onTaskStart }: TimelineProps) {
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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
  };

  const sections: DaySection[] = useMemo(() => {
    const allTasks = data?.pages.flatMap((p) => p.tasks) ?? [];
    const byDate = new Map<string, Task[]>();
    for (const t of allTasks) {
      const existing = byDate.get(t.date) ?? [];
      existing.push(t);
      byDate.set(t.date, existing);
    }
    return Array.from(byDate.entries()).map(([date, tasks]) => {
      const completedBlocks = tasks.filter((t) => t.completed).length;
      const groups = groupByName(tasks);
      // Open groups first, fully-done groups after.
      groups.sort((a, b) => {
        const aDone = a.completedCount === a.blocks.length ? 1 : 0;
        const bDone = b.completedCount === b.blocks.length ? 1 : 0;
        return aDone - bDone;
      });
      return {
        date,
        groups,
        completedBlocks,
        minutes: completedBlocks * 30,
      };
    });
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

  const handleDeleteGroup = async (blocks: Task[]) => {
    try {
      await Promise.all(blocks.map((b) => deleteTask.mutateAsync({ id: b.id })));
      refresh();
    } catch (err) {
      console.error("Failed to delete task group", err);
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

  const isEmpty = !isLoading && sections.length === 0;

  return (
    <section className="flex flex-col gap-8">
      {/* Add a new block */}
      <div>
        <form onSubmit={handleAddTask} className="flex gap-2">
          <Input
            placeholder="What's next?"
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
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
          {sections.map((section) => (
            <div key={section.date} className="flex flex-col gap-5">
              {/* Date divider */}
              <div className="flex items-center gap-4">
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80 whitespace-nowrap">
                  {dayLabel(section.date)}
                </h2>
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-xs text-muted-foreground/70 whitespace-nowrap tabular-nums">
                  {section.completedBlocks > 0 ? (
                    <>
                      {section.completedBlocks} {section.completedBlocks === 1 ? "block" : "blocks"} · {section.minutes} min
                    </>
                  ) : (
                    "No focus logged"
                  )}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {section.groups.map((group) => (
                  <TimelineGroup
                    key={group.name}
                    group={group}
                    onToggleBlock={handleToggleBlock}
                    onPlay={handlePlay}
                    onDelete={handleDeleteGroup}
                    onSelect={onTaskSelect}
                  />
                ))}
              </div>
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
  onDelete: (blocks: Task[]) => void;
  onSelect: (name: string) => void;
}

function TimelineGroup({ group, onToggleBlock, onPlay, onDelete, onSelect }: TimelineGroupProps) {
  const allDone = group.completedCount === group.blocks.length;
  const hasPending = !allDone;
  const overEstimate = group.completedCount > group.totalEstimated;

  // Completed blocks become the day's "log" lines (time · rating · note).
  const completedBlocks = group.blocks
    .filter((b) => b.completed && b.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  return (
    <div className={`group rounded-lg px-3 py-3 transition-colors hover:bg-muted/30 ${allDone ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        {/* Block dots — only when there's something still to do */}
        {hasPending && (
          <div className="flex flex-wrap gap-1.5 flex-shrink-0" style={{ maxWidth: "7rem" }}>
            {group.blocks.map((block) => (
              <button
                key={block.id}
                title={block.completed ? `Block ${block.chunkIndex} — done` : `Block ${block.chunkIndex} — mark done`}
                onClick={() => onToggleBlock(block)}
                className={`w-4 h-4 rounded-full border-2 transition-all hover:scale-110 focus:outline-none ${
                  block.completed
                    ? "bg-primary border-primary"
                    : "bg-transparent border-muted-foreground/40 hover:border-primary/60"
                }`}
              />
            ))}
          </div>
        )}

        {allDone && (
          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-primary" />
          </div>
        )}

        <div
          className={`flex-1 min-w-0 ${hasPending ? "cursor-pointer" : ""}`}
          onClick={() => hasPending && onSelect(group.name)}
        >
          <span className={`font-medium truncate block ${allDone ? "text-muted-foreground" : "text-foreground"}`}>
            {group.name}
          </span>
          <span className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
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
        </div>

        {hasPending && (
          <Button
            variant="ghost"
            size="icon"
            title="Start a 30-min focus block for this task"
            className="flex-shrink-0 text-primary hover:text-primary hover:bg-primary/10"
            onClick={() => onPlay(group)}
          >
            <Play className="w-4 h-4 fill-current" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 -mr-1"
          onClick={() => onDelete(group.blocks)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

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
