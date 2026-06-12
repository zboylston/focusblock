import { useState } from "react";
import { useUpdateTask, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Coffee } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Rating = "😩" | "😐" | "🙂" | "🔥";
const RATINGS: Rating[] = ["😩", "😐", "🙂", "🔥"];

interface RatingModalProps {
  taskId: number;
  onComplete: () => void;
  onAddBlock: () => void;
}

export function RatingModal({ taskId, onComplete, onAddBlock }: RatingModalProps) {
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<Rating | null>(null);
  const [saving, setSaving] = useState(false);
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  // Persist whatever rating/notes the user entered for the just-completed block,
  // then run the chosen next action (take a break vs. keep going).
  const saveAnd = async (next: () => void) => {
    if (saving) return;
    setSaving(true);
    try {
      if (rating || notes.trim()) {
        await updateTask.mutateAsync({
          id: taskId,
          data: {
            ...(rating && { rating }),
            ...(notes.trim() && { notes: notes.trim() }),
          },
        });
        queryClient.invalidateQueries({ queryKey: ["timeline"] });
        queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      }
      next();
    } catch (err) {
      console.error("Failed to save block", err);
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onComplete()}>
      <DialogContent className="sm:max-w-md text-center p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold mb-2">Block complete</DialogTitle>
          <DialogDescription className="text-base">
            How was your focus during this block?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 mt-4">
          {RATINGS.map((r) => (
            <button
              key={r}
              onClick={() => setRating((prev) => (prev === r ? null : r))}
              className={`text-5xl transition-all active:scale-95 rounded-2xl p-4 ${
                rating === r
                  ? "bg-primary/15 ring-2 ring-primary scale-105"
                  : "bg-muted/30 hover:bg-muted/60 hover:scale-110"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <Textarea
          className="mt-4 resize-none text-sm"
          rows={3}
          placeholder="What did you work on? (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="mt-5 flex flex-col gap-2">
          <Button
            className="w-full h-11 gap-2"
            disabled={saving}
            onClick={() => saveAnd(onComplete)}
          >
            <Coffee className="w-4 h-4" />
            Take a break
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 gap-2 text-muted-foreground hover:text-foreground"
            disabled={saving}
            onClick={() => saveAnd(onAddBlock)}
          >
            <Plus className="w-4 h-4" />
            Add another block
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
