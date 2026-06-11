import { useRateSession, getListSessionsQueryKey, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface RatingModalProps {
  sessionId: number;
  onComplete: () => void;
}

export function RatingModal({ sessionId, onComplete }: RatingModalProps) {
  const rateSession = useRateSession();
  const queryClient = useQueryClient();

  const handleRate = async (rating: "😩" | "😐" | "🙂" | "🔥") => {
    try {
      await rateSession.mutateAsync({
        id: sessionId,
        data: { rating }
      });
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      onComplete();
    } catch (err) {
      console.error("Failed to rate session", err);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onComplete()}>
      <DialogContent className="sm:max-w-md text-center p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold mb-2">Session Complete!</DialogTitle>
          <DialogDescription className="text-base">
            How was your focus during this chunk?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-4 mt-6">
          <button onClick={() => handleRate("😩")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">😩</button>
          <button onClick={() => handleRate("😐")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">😐</button>
          <button onClick={() => handleRate("🙂")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">🙂</button>
          <button onClick={() => handleRate("🔥")} className="text-5xl hover:scale-110 transition-transform active:scale-95 bg-muted/30 rounded-2xl p-4 hover:bg-muted/60">🔥</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
