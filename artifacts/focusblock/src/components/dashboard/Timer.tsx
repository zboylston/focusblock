import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { playAlertTone } from "@/lib/audio";
import { useCreateSession, getListSessionsQueryKey, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RatingModal } from "./RatingModal";

type TimerMode = "focus" | "break";
const FOCUS_SECONDS = 30 * 60;
const BREAK_SECONDS = 5 * 60;

interface TimerProps {
  activeTaskName: string;
  onTaskNameChange: (name: string) => void;
}

export function Timer({ activeTaskName, onTaskNameChange }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECONDS);
  const [isActive, setIsActive] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Target end timestamp drives the countdown so it stays accurate even when
  // the tab is backgrounded (where setInterval is throttled to ~1/min).
  const endTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const titleFlashRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef<string>(document.title);

  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const { toast } = useToast();

  const stopTitleFlash = useCallback(() => {
    if (titleFlashRef.current) {
      clearInterval(titleFlashRef.current);
      titleFlashRef.current = null;
    }
    document.title = originalTitle.current;
  }, []);

  const startTitleFlash = useCallback(() => {
    if (titleFlashRef.current) clearInterval(titleFlashRef.current);
    let flash = false;
    titleFlashRef.current = setInterval(() => {
      document.title = flash ? "Session Complete!" : originalTitle.current;
      flash = !flash;
    }, 1000);
  }, []);

  const handleTimerComplete = useCallback(async () => {
    setIsActive(false);
    endTimeRef.current = null;
    playAlertTone();
    startTitleFlash();

    if (mode === "focus") {
      try {
        const res = await createSession.mutateAsync({
          data: { taskName: activeTaskName.trim() || "Deep work", durationMinutes: 30 },
        });
        setCompletedSessionId(res.id);
        setShowRatingModal(true);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      } catch (err) {
        console.error("Failed to create session", err);
        stopTitleFlash();
        setTimeLeft(FOCUS_SECONDS);
        toast({
          title: "Couldn't save your session",
          description: "Something went wrong logging this focus block. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // Break finished — return to a fresh focus block.
      stopTitleFlash();
      setMode("focus");
      setTimeLeft(FOCUS_SECONDS);
    }
  }, [mode, activeTaskName, createSession, queryClient, startTitleFlash, stopTitleFlash, toast]);

  useEffect(() => {
    if (!isActive) return;
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + timeLeft * 1000;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.round((endTimeRef.current! - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        handleTimerComplete();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // timeLeft is intentionally read once at start; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, handleTimerComplete]);

  // Clean up any running intervals and restore the tab title on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
      document.title = originalTitle.current;
    };
  }, []);

  const toggleTimer = () => {
    if (!isActive && mode === "focus" && !activeTaskName.trim()) return;
    if (isActive) {
      // Pausing: freeze the remaining time by dropping the target timestamp.
      endTimeRef.current = null;
    }
    setIsActive((prev) => !prev);
  };

  const resetTimer = () => {
    setIsActive(false);
    endTimeRef.current = null;
    setTimeLeft(mode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const switchMode = (next: TimerMode) => {
    setIsActive(false);
    endTimeRef.current = null;
    setMode(next);
    setTimeLeft(next === "focus" ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const handleRatingComplete = () => {
    setShowRatingModal(false);
    stopTitleFlash();
    setMode("break");
    setTimeLeft(BREAK_SECONDS);
    endTimeRef.current = null;
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Keep the tab title in sync with the running timer (unless it's flashing).
  useEffect(() => {
    if (isActive) {
      document.title = `${timeString} - ${activeTaskName || "FocusBlock"}`;
    } else if (!showRatingModal && !titleFlashRef.current) {
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
              onClick={() => switchMode("focus")}
            >
              Focus
            </button>
            <button
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === "break" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => switchMode("break")}
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
