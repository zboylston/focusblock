import { useState } from "react";
import { useUpdateTask, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface RatingModalProps {
  taskId: number;
  onComplete: () => void;
}

export function RatingModal({ taskId, onComplete }: RatingModalProps) {
  const [notes, setNotes] = useState("");
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const handleRate = async (rating: "😩" | "😐" | "🙂" | "🔥") => {
    try {
      await updateTask.mutateAsync({
        id: taskId,
        data: { rating, ...(notes.trim() && { notes: notes.trim() }) },
      });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      onComplete();
    } catch (err) {
      console.error("Failed to rate block", err);
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

        <Textarea
          className="mt-5 resize-none text-sm"
          rows={3}
          placeholder="What did you work on? (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="grid grid-cols-4 gap-4 mt-4">
          <button onClick={() => handleRate("😩")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">😩</button>
          <button onClick={() => handleRate("😐")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">😐</button>
          <button onClick={() => handleRate("🙂")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">🙂</button>
          <button onClick={() => handleRate("🔥")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">🔥</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
