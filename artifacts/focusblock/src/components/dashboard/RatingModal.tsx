import { useState } from "react";
import { useUpdateTask, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Coffee } from "lucide-react";
import { stopAlertTone } from "@/lib/audio";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Rating = "😩" | "😐" | "🙂" | "🔥";
const RATINGS: Rating[] = ["😩", "😐", "🙂", "🔥"];
const RATING_LABELS: Record<Rating, string> = {
  "😩": "rough",
  "😐": "okay",
  "🙂": "good",
  "🔥": "great",
};

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

  const ratingIndex = rating ? RATINGS.indexOf(rating) : -1;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onComplete()}>
      <DialogContent className="sm:max-w-md text-center p-8" onPointerDown={stopAlertTone}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold mb-2">Block complete</DialogTitle>
          <DialogDescription className="text-base">
            How was your focus during this block?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 mt-6">
          <div className="flex items-center gap-3">
            {RATINGS.map((r, i) => (
              <button
                key={r}
                onClick={() => setRating((prev) => (prev === r ? null : r))}
                title={RATING_LABELS[r]}
                aria-label={RATING_LABELS[r]}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all focus:outline-none",
                  ratingIndex >= i
                    ? "bg-primary border-primary"
                    : "bg-transparent border-border/50 hover:border-primary/50",
                  rating === r && "scale-110",
                )}
              />
            ))}
          </div>
          {rating && (
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {RATING_LABELS[rating]}
            </span>
          )}
        </div>

        <Textarea
          className="mt-6 resize-none text-sm"
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
