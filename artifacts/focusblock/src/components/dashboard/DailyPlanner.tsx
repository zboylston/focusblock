import { useState } from "react";
import { useListTasks, useCreateTasks, useUpdateTask, useDeleteTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface DailyPlannerProps {
  onTaskSelect: (taskName: string) => void;
}

type Task = {
  id: number;
  name: string;
  chunkIndex: number;
  totalChunks: number;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  date: string;
};

type TaskGroup = {
  name: string;
  blocks: Task[];
  totalEstimated: number;
  completedCount: number;
};

function groupTasks(tasks: Task[]): TaskGroup[] {
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
    };
  });
}

export function DailyPlanner({ onTaskSelect }: DailyPlannerProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [blockCount, setBlockCount] = useState<number>(1);

  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useListTasks();

  const createTasks = useCreateTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    try {
      await createTasks.mutateAsync({ data: { name: newTaskName, chunks: blockCount } });
      setNewTaskName("");
      setBlockCount(1);
      invalidate();
    } catch (err) {
      console.error("Failed to create tasks", err);
    }
  };

  const handleToggleBlock = async (block: Task) => {
    try {
      await updateTask.mutateAsync({ id: block.id, data: { completed: !block.completed } });
      invalidate();
    } catch (err) {
      console.error("Failed to toggle block", err);
    }
  };

  const handleDeleteGroup = async (blocks: Task[]) => {
    try {
      await Promise.all(blocks.map((b) => deleteTask.mutateAsync({ id: b.id })));
      invalidate();
    } catch (err) {
      console.error("Failed to delete task group", err);
    }
  };

  const groups = tasks ? groupTasks(tasks as Task[]) : [];

  return (
    <Card className="h-full shadow-sm border-border/60 flex flex-col bg-card">
      <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          Daily Planner
        </CardTitle>
        <form onSubmit={handleAddTask} className="mt-4 flex gap-2">
          <Input
            placeholder="Add a new task..."
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center bg-muted rounded-md overflow-hidden border border-border/50">
            <button
              type="button"
              className="px-3 py-2 text-muted-foreground hover:bg-background transition-colors"
              onClick={() => setBlockCount(Math.max(1, blockCount - 1))}
            >-</button>
            <div className="w-8 text-center text-sm font-medium">{blockCount}</div>
            <button
              type="button"
              className="px-3 py-2 text-muted-foreground hover:bg-background transition-colors"
              onClick={() => setBlockCount(Math.min(16, blockCount + 1))}
            >+</button>
          </div>
          <Button type="submit" disabled={!newTaskName.trim() || createTasks.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </form>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
          </div>
        ) : groups.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground mb-1">Your planner is empty</p>
            <p className="text-sm">Add a task above to start planning your day. Break big tasks into 30-minute work blocks.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {groups.map((group) => {
              const allDone = group.completedCount === group.blocks.length;
              const nextIncomplete = group.blocks.find((b) => !b.completed);
              const overEstimate = group.completedCount > group.totalEstimated;

              return (
                <div
                  key={group.name}
                  className={`group flex items-center gap-3 p-4 transition-colors hover:bg-muted/20 ${allDone ? "opacity-60" : ""}`}
                >
                  {/* Block dots */}
                  <div className="flex flex-wrap gap-1.5 flex-shrink-0" style={{ maxWidth: "7rem" }}>
                    {group.blocks.map((block) => (
                      <button
                        key={block.id}
                        title={block.completed ? `Block ${block.chunkIndex} — done` : `Block ${block.chunkIndex} — click to mark done`}
                        onClick={() => handleToggleBlock(block)}
                        className={`w-4 h-4 rounded-full border-2 transition-all hover:scale-110 focus:outline-none ${
                          block.completed
                            ? "bg-primary border-primary"
                            : "bg-transparent border-muted-foreground/40 hover:border-primary/60"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Task name + count */}
                  <div
                    className="flex-1 flex flex-col cursor-pointer min-w-0"
                    onClick={() => nextIncomplete && onTaskSelect(group.name)}
                  >
                    <span className={`font-medium truncate ${allDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {group.name}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono mt-0.5">
                      {group.completedCount} / {group.totalEstimated} blocks
                      {overEstimate && (
                        <span className="ml-1 text-amber-500">+{group.completedCount - group.totalEstimated} over</span>
                      )}
                    </span>
                  </div>

                  {/* Delete group */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 -mr-2"
                    onClick={() => handleDeleteGroup(group.blocks)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
