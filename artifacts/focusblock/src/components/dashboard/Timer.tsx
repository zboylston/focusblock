import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Coffee, Focus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { playAlertTone } from "@/lib/audio";
import { useCreateSession, getListSessionsQueryKey, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RatingModal } from "./RatingModal";

type TimerMode = "focus" | "break";
const FOCUS_MINUTES = 30;
const BREAK_MINUTES = 5;

interface TimerProps {
  activeTaskName: string;
  onTaskNameChange: (name: string) => void;
}

export function Timer({ activeTaskName, onTaskNameChange }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(FOCUS_MINUTES * 60);
  const [isActive, setIsActive] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const titleFlashRef = useRef<NodeJS.Timeout | null>(null);
  const originalTitle = useRef<string>(document.title);

  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  const handleTimerComplete = useCallback(async () => {
    setIsActive(false);
    playAlertTone();

    // Start title flash
    let flash = false;
    titleFlashRef.current = setInterval(() => {
      document.title = flash ? "Session Complete!" : originalTitle.current;
      flash = !flash;
    }, 1000);

    if (mode === "focus") {
      try {
        const res = await createSession.mutateAsync({
          data: { taskName: activeTaskName || "Deep work", durationMinutes: FOCUS_MINUTES }
        });
        setCompletedSessionId(res.id);
        setShowRatingModal(true);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      } catch (err) {
        console.error("Failed to create session", err);
      }
    } else {
      // Break complete
      setMode("focus");
      setTimeLeft(FOCUS_MINUTES * 60);
      stopTitleFlash();
    }
  }, [mode, activeTaskName, createSession, queryClient]);

  const stopTitleFlash = () => {
    if (titleFlashRef.current) clearInterval(titleFlashRef.current);
    document.title = originalTitle.current;
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      handleTimerComplete();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft, handleTimerComplete]);

  const toggleTimer = () => {
    if (!isActive && mode === "focus" && !activeTaskName.trim()) {
      // Could show toast here, but for now just focus or do nothing
      return;
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === "focus" ? FOCUS_MINUTES * 60 : BREAK_MINUTES * 60);
  };

  const handleRatingComplete = () => {
    setShowRatingModal(false);
    stopTitleFlash();
    setMode("break");
    setTimeLeft(BREAK_MINUTES * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Update doc title with timer if active
  useEffect(() => {
    if (isActive) {
      document.title = `${timeString} - ${activeTaskName || "FocusBlock"}`;
    } else if (!showRatingModal) {
      document.title = originalTitle.current;
    }
  }, [timeString, isActive, activeTaskName, showRatingModal]);

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden bg-card">
        <CardContent className="p-8 flex flex-col items-center justify-center relative">
          <div className="flex gap-2 bg-muted/50 p-1 rounded-full mb-8">
            <button
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === "focus" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setMode("focus"); setTimeLeft(FOCUS_MINUTES * 60); setIsActive(false); }}
            >
              Focus
            </button>
            <button
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === "break" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setMode("break"); setTimeLeft(BREAK_MINUTES * 60); setIsActive(false); }}
            >
              Break
            </button>
          </div>

          <div className="w-full max-w-xs mb-8">
            {mode === "focus" ? (
              <Input
                placeholder="What are you focusing on?"
                value={activeTaskName}
                onChange={(e) => onTaskNameChange(e.target.value)}
                className="text-center bg-transparent border-t-0 border-x-0 border-b-2 border-border/50 focus-visible:border-primary focus-visible:ring-0 rounded-none px-0 text-lg placeholder:text-muted-foreground/60 h-12"
                disabled={isActive}
              />
            ) : (
              <div className="text-center text-lg text-muted-foreground h-12 flex items-center justify-center">
                Take a breather
              </div>
            )}
          </div>

          <div className="text-7xl md:text-8xl font-mono font-bold tracking-tighter text-foreground mb-10 tabular-nums">
            {timeString}
          </div>

          <div className="flex items-center gap-4">
            <Button
              size="lg"
              variant={isActive ? "secondary" : "default"}
              className="w-32 h-14 text-base rounded-full"
              onClick={toggleTimer}
              disabled={mode === "focus" && !activeTaskName.trim()}
            >
              {isActive ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
              {isActive ? "Pause" : "Start"}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="w-14 h-14 rounded-full"
              onClick={resetTimer}
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {showRatingModal && completedSessionId && (
        <RatingModal
          sessionId={completedSessionId}
          onComplete={handleRatingComplete}
        />
      )}
    </>
  );
}
