import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { playAlertTone, stopAlertTone, primeAudio } from "@/lib/audio";
import { requestNotificationPermission, showNotification } from "@/lib/notifications";
import { linkHost, normalizeUrl } from "@/lib/url";
import {
  useCompleteFocus,
  useGetTaskNote,
  useUpdateTaskNote,
  useGetTaskGroup,
  useAddBlock,
  useUpdateTask,
  getGetTaskNoteQueryKey,
  getGetTaskGroupQueryKey,
  getGetTodayStatsQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RatingModal } from "./RatingModal";

type TimerMode = "focus" | "break";
const FOCUS_SECONDS = 30 * 60;
const BREAK_SECONDS = 5 * 60;

interface TimerProps {
  activeTaskName: string;
  onTaskNameChange: (name: string) => void;
  startToken: number;
}

export function Timer({ activeTaskName, onTaskNameChange, startToken }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECONDS);
  const [isActive, setIsActive] = useState(false);
  const [completedTaskId, setCompletedTaskId] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  // Bumped on every fresh (re)start so the countdown effect reliably tears down
  // and rebuilds its interval, even when the timer was already running.
  const [runId, setRunId] = useState(0);

  // Target end timestamp drives the countdown so it stays accurate even when
  // the tab is backgrounded (where setInterval is throttled to ~1/min).
  const endTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const titleFlashRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef<string>(document.title);

  const queryClient = useQueryClient();
  const completeFocus = useCompleteFocus();
  const updateTaskNote = useUpdateTaskNote();
  const addBlock = useAddBlock();
  const updateTask = useUpdateTask();
  const { toast } = useToast();

  // The active task's note (the same task-group `description` shown in the
  // timeline). The Timer only knows the name, so look the note up by name.
  const [noteDraft, setNoteDraft] = useState("");
  // Last value loaded from / saved to the server, to skip no-op saves.
  const loadedNoteRef = useRef("");
  // True while the textarea is focused, so a background refetch (e.g. on window
  // focus or post-save invalidation) can't overwrite in-progress edits.
  const isEditingNoteRef = useRef(false);

  // Debounce the name so typing a fresh task title char-by-char doesn't fire a
  // lookup per keystroke. Clicking a planner task / running a session keeps the
  // name stable, so the note resolves immediately in those (common) cases.
  const trimmedName = activeTaskName.trim();
  const [noteName, setNoteName] = useState(trimmedName);
  useEffect(() => {
    const t = setTimeout(() => setNoteName(trimmedName), 350);
    return () => clearTimeout(t);
  }, [trimmedName]);

  const noteQuery = useGetTaskNote(
    { name: noteName },
    {
      query: {
        queryKey: getGetTaskNoteQueryKey({ name: noteName }),
        enabled: noteName.length > 0,
      },
    },
  );

  // The active task's full group context (blocks, estimate vs. actual, link),
  // resolved by name like the note. Drives the on-card task panel and add-block.
  const groupQuery = useGetTaskGroup(
    { name: noteName },
    {
      query: {
        queryKey: getGetTaskGroupQueryKey({ name: noteName }),
        enabled: noteName.length > 0,
      },
    },
  );
  const group = groupQuery.data;
  const hasGroup = !!group && group.blocks.length > 0;

  // Refresh everything that reflects block state after a block change.
  const refreshTaskState = useCallback(
    (name: string) => {
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTaskGroupQueryKey({ name }) });
    },
    [queryClient],
  );

  // Toggle a block done/undone straight from the timer card.
  const toggleBlock = useCallback(
    async (block: Task) => {
      try {
        await updateTask.mutateAsync({
          id: block.id,
          data: { completed: !block.completed },
        });
        refreshTaskState(block.name);
      } catch (err) {
        console.error("Failed to toggle block", err);
        toast({
          title: "Couldn't update that block",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
    [updateTask, refreshTaskState, toast],
  );

  // Append one extra (open) block to the current task without raising the
  // estimate, so finishing it shows up as overage.
  const addExtraBlock = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await addBlock.mutateAsync({ data: { name: trimmed } });
        refreshTaskState(trimmed);
      } catch (err) {
        console.error("Failed to add block", err);
        toast({
          title: "Couldn't add a block",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
    [addBlock, refreshTaskState, toast],
  );

  // Sync the draft when the resolved note changes (task switched or refetched).
  const noteData = noteQuery.data;
  useEffect(() => {
    if (!noteData) return;
    // Never clobber what the user is actively typing.
    if (isEditingNoteRef.current) return;
    const text = noteData.description ?? "";
    loadedNoteRef.current = text;
    setNoteDraft(text);
  }, [noteData]);

  // Clear the draft immediately when there's no active task to attach a note to.
  useEffect(() => {
    if (noteName.length === 0) {
      loadedNoteRef.current = "";
      setNoteDraft("");
    }
  }, [noteName]);

  const saveNote = useCallback(async () => {
    const name = activeTaskName.trim();
    if (!name) return;
    if (noteDraft.trim() === loadedNoteRef.current.trim()) return;
    try {
      const result = await updateTaskNote.mutateAsync({
        data: { name, description: noteDraft },
      });
      loadedNoteRef.current = result.description ?? "";
      queryClient.invalidateQueries({ queryKey: getGetTaskNoteQueryKey({ name }) });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
    } catch (err) {
      console.error("Failed to save note", err);
      toast({
        title: "Couldn't save your note",
        description: "Something went wrong saving this note. Please try again.",
        variant: "destructive",
      });
    }
  }, [activeTaskName, noteDraft, updateTaskNote, queryClient, toast]);

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
    showNotification(
      mode === "focus" ? "Focus session complete!" : "Break's over",
      mode === "focus"
        ? "Nice work — time to log it and take a break."
        : "Ready for another focus block?",
    );
    startTitleFlash();

    if (mode === "focus") {
      try {
        const task = await completeFocus.mutateAsync({
          data: { name: activeTaskName.trim() || "Deep work" },
        });
        setCompletedTaskId(task.id);
        setShowRatingModal(true);
        refreshTaskState(task.name);
      } catch (err) {
        console.error("Failed to complete focus block", err);
        stopAlertTone();
        stopTitleFlash();
        setTimeLeft(FOCUS_SECONDS);
        toast({
          title: "Couldn't save your block",
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
  }, [mode, activeTaskName, completeFocus, queryClient, startTitleFlash, stopTitleFlash, toast]);

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
  }, [isActive, runId, handleTimerComplete]);

  // Clean up any running intervals and restore the tab title on unmount.
  useEffect(() => {
    return () => {
      stopAlertTone();
      if (timerRef.current) clearInterval(timerRef.current);
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
      document.title = originalTitle.current;
    };
  }, []);

  // Hitting "play" on a planner task bumps startToken — start a fresh focus
  // block for it immediately. (startToken 0 is the initial mount, so skip it.)
  const prevStartToken = useRef(startToken);
  useEffect(() => {
    if (startToken === prevStartToken.current) return;
    prevStartToken.current = startToken;
    stopAlertTone();
    stopTitleFlash();
    setShowRatingModal(false);
    setMode("focus");
    setTimeLeft(FOCUS_SECONDS);
    // Set a valid fresh end time synchronously so any still-running interval
    // computes ~30:00 (not a bogus value from a nulled ref) until the effect
    // rebuilds. runId bump guarantees that rebuild even if isActive is unchanged.
    endTimeRef.current = Date.now() + FOCUS_SECONDS * 1000;
    primeAudio();
    requestNotificationPermission();
    setIsActive(true);
    setRunId((n) => n + 1);
  }, [startToken, stopTitleFlash]);

  const toggleTimer = () => {
    stopAlertTone();
    if (!isActive && mode === "focus" && !activeTaskName.trim()) return;
    if (isActive) {
      // Pausing: freeze the remaining time by dropping the target timestamp.
      endTimeRef.current = null;
    } else {
      // Unlock the AudioContext on the user gesture so the end-of-session
      // alert can play even when no interaction occurs at completion time.
      primeAudio();
      // Ask for notification permission so we can alert even if the tab is
      // backgrounded when the timer finishes.
      requestNotificationPermission();
    }
    setIsActive((prev) => !prev);
  };

  const resetTimer = () => {
    stopAlertTone();
    setIsActive(false);
    endTimeRef.current = null;
    setTimeLeft(mode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const switchMode = (next: TimerMode) => {
    stopAlertTone();
    setIsActive(false);
    endTimeRef.current = null;
    setMode(next);
    setTimeLeft(next === "focus" ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const handleRatingComplete = () => {
    stopAlertTone();
    setShowRatingModal(false);
    stopTitleFlash();
    // Clear the focus label so the finished task's title doesn't linger.
    onTaskNameChange("");
    setMode("break");
    setTimeLeft(BREAK_SECONDS);
    endTimeRef.current = null;
  };

  // "Add another block" from the completion card: append an extra block and stay
  // on this task with a fresh focus timer (skip the break) so the user can keep
  // running it. The just-completed block is tracked as overage.
  const handleKeepGoing = async () => {
    stopAlertTone();
    stopTitleFlash();
    setShowRatingModal(false);
    await addExtraBlock(activeTaskName);
    setMode("focus");
    setTimeLeft(FOCUS_SECONDS);
    setIsActive(false);
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
              isActive ? (
                <div className="text-center text-xl font-bold text-primary h-12 flex items-center justify-center truncate px-1">
                  {activeTaskName || "Deep work"}
                </div>
              ) : (
                <Input
                  placeholder="What are you focusing on?"
                  value={activeTaskName}
                  onChange={(e) => onTaskNameChange(e.target.value)}
                  className="text-center bg-transparent border-t-0 border-x-0 border-b-2 border-border/50 focus-visible:border-primary focus-visible:ring-0 rounded-none px-0 text-base text-foreground placeholder:text-muted-foreground/50 h-12"
                />
              )
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

          {mode === "focus" && trimmedName && hasGroup && group && (
            <div className="w-full max-w-xs mt-10 pt-6 border-t border-border/40 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {group.blocks.map((block) => (
                    <button
                      key={block.id}
                      onClick={() => toggleBlock(block)}
                      title={block.completed ? "Mark block open" : "Mark block done"}
                      className={`w-4 h-4 rounded-[3px] border-2 transition-all hover:scale-110 focus:outline-none ${
                        block.completed
                          ? "bg-primary border-primary"
                          : "bg-transparent border-muted-foreground/40 hover:border-primary/60"
                      }`}
                    />
                  ))}
                  <button
                    onClick={() => addExtraBlock(activeTaskName)}
                    disabled={addBlock.isPending}
                    title="Add block"
                    className="w-4 h-4 rounded-[3px] border border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50 transition-colors hover:text-primary hover:border-primary/50 focus:outline-none disabled:opacity-40"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {group.completedCount} / {group.totalEstimated} blocks
                  {group.completedCount > group.totalEstimated && (
                    <span className="ml-1 text-amber-500">
                      +{group.completedCount - group.totalEstimated} over
                    </span>
                  )}
                </span>
              </div>

              {group.link && (
                <a
                  href={normalizeUrl(group.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 hover:border-primary/40 transition-colors group/link"
                >
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${linkHost(group.link)}.ico`}
                    alt=""
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {linkHost(group.link)}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                </a>
              )}

            </div>
          )}

          {mode === "focus" && trimmedName && (
            <div className="w-full max-w-xs mt-6 pt-6 border-t border-border/40">
              <label
                htmlFor="focus-note"
                className="block text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 mb-2"
              >
                Notes
              </label>
              <Textarea
                id="focus-note"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onFocus={() => {
                  isEditingNoteRef.current = true;
                }}
                onBlur={() => {
                  isEditingNoteRef.current = false;
                  void saveNote();
                }}
                placeholder="Jot what you're working on…"
                rows={3}
                className="resize-none border-border/50 bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {showRatingModal && completedTaskId && (
        <RatingModal
          taskId={completedTaskId}
          onComplete={handleRatingComplete}
          onAddBlock={handleKeepGoing}
        />
      )}
    </>
  );
}
