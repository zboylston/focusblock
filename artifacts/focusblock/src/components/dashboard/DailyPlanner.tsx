import { useState } from "react";
import { useListTasks, useCreateTasks, useUpdateTask, useDeleteTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

interface DailyPlannerProps {
  onTaskSelect: (taskName: string) => void;
}

export function DailyPlanner({ onTaskSelect }: DailyPlannerProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [chunkCount, setChunkCount] = useState<number>(1);
  
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useListTasks();
  
  const createTasks = useCreateTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    try {
      await createTasks.mutateAsync({
        data: { name: newTaskName, chunks: chunkCount }
      });
      setNewTaskName("");
      setChunkCount(1);
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (err) {
      console.error("Failed to create tasks", err);
    }
  };

  const handleToggleComplete = async (taskId: number, currentCompleted: boolean) => {
    try {
      await updateTask.mutateAsync({
        id: taskId,
        data: { completed: !currentCompleted }
      });
      // Optimistic update could go here
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (err) {
      console.error("Failed to toggle task", err);
    }
  };

  const handleDelete = async (taskId: number) => {
    try {
      await deleteTask.mutateAsync({ id: taskId });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

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
              onClick={() => setChunkCount(Math.max(1, chunkCount - 1))}
            >-</button>
            <div className="w-8 text-center text-sm font-medium">{chunkCount}</div>
            <button 
              type="button"
              className="px-3 py-2 text-muted-foreground hover:bg-background transition-colors"
              onClick={() => setChunkCount(Math.min(16, chunkCount + 1))}
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
            <div className="h-12 bg-muted/50 rounded-lg animate-pulse"></div>
            <div className="h-12 bg-muted/50 rounded-lg animate-pulse"></div>
            <div className="h-12 bg-muted/50 rounded-lg animate-pulse"></div>
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground mb-1">Your planner is empty</p>
            <p className="text-sm">Add a task above to start planning your day. Break big tasks into 30-minute chunks.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className={`group flex items-center p-4 transition-colors hover:bg-muted/20 ${task.completed ? 'opacity-60 bg-muted/10' : ''}`}
              >
                <button
                  onClick={() => handleToggleComplete(task.id, task.completed)}
                  className="flex-shrink-0 mr-4 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  ) : (
                    <Circle className="w-6 h-6" />
                  )}
                </button>
                
                <div 
                  className="flex-1 flex flex-col cursor-pointer" 
                  onClick={() => !task.completed && onTaskSelect(task.name)}
                >
                  <span className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.name}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono mt-0.5">
                    Chunk {task.chunkIndex} of {task.totalChunks}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
                  onClick={() => handleDelete(task.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
