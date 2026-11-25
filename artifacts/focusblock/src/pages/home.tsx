import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusTask, getGetOpenTasksQueryKey, getGetTodayStatsQueryKey } from "@workspace/api-client-react";
import { Timer, Timeline, Header } from "@/components/dashboard";

export type FocusSession = { name: string; running: boolean };
export type SessionControl = { id: number; action: "pause" | "resume" };

export default function Home() {
  const [activeTaskName, setActiveTaskName] = useState("");
  const [startToken, setStartToken] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [session, setSession] = useState<FocusSession | null>(null);
  const [sessionControl, setSessionControl] = useState<SessionControl | null>(null);
  const [nowName, setNowName] = useState<string | null>(null);
  const pendingFocus = useRef<{ name: string; date: string } | null>(null);
  const seededFor = useRef<string | null>(null);
  const nowNameRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const focusTask = useFocusTask();

  const handleTaskStart = (name: string, date: string) => {
    pendingFocus.current = { name, date };
    setActiveTaskName(name);
    setStartToken((t) => t + 1);
  };

  const handleNowChange = useCallback((name: string | null) => {
    setNowName(name);
  }, []);

  const handleFocusStart = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const pending = pendingFocus.current;
      pendingFocus.current = null;
      const date = pending && pending.name === trimmed ? pending.date : undefined;
      focusTask.mutate(
        { data: { name: trimmed, ...(date ? { date } : {}) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["timeline"] });
            queryClient.invalidateQueries({ queryKey: getGetTodayStatsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetOpenTasksQueryKey() });
          },
        },
      );
    },
    [focusTask, queryClient],
  );

  useEffect(() => {
    const previous = nowNameRef.current;
    nowNameRef.current = nowName;
    if (previous && !nowName && !session) {
      setActiveTaskName((current) => (current === previous ? "" : current));
    }
    if (!nowName || seededFor.current === nowName) return;
    seededFor.current = nowName;
    setActiveTaskName((current) => (current.trim() ? current : nowName));
  }, [nowName, session]);

  const handleSessionChange = useCallback((next: FocusSession | null) => {
    setSession((prev) => {
      if (prev === null && next === null) return prev;
      if (prev && next && prev.name === next.name && prev.running === next.running) return prev;
      return next;
    });
  }, []);

  const controlSession = (action: SessionControl["action"]) => {
    setSessionControl({ id: Date.now(), action });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 md:px-12 md:py-8 flex flex-col md:flex-row gap-10 items-start">
        <div
          className={`w-full transition-[flex-basis,max-width] duration-500 ease-out ${
            expanded ? "md:basis-[64%] md:max-w-[64%]" : "md:basis-[42%] md:max-w-[42%]"
          }`}
        >
          <div className="md:sticky md:top-24">
            <Timer
              activeTaskName={activeTaskName}
              onTaskNameChange={setActiveTaskName}
              startToken={startToken}
              expanded={expanded}
              onExpandedChange={setExpanded}
              onSessionChange={handleSessionChange}
              sessionControl={sessionControl}
              onFocusStart={handleFocusStart}
            />
          </div>
        </div>
        <div className="w-full flex-1 min-w-0">
          <Timeline
            onTaskSelect={setActiveTaskName}
            onTaskStart={handleTaskStart}
            onCollapse={() => setExpanded(false)}
            session={session}
            onPauseSession={() => controlSession("pause")}
            onResumeSession={() => controlSession("resume")}
            onNowChange={handleNowChange}
          />
        </div>
      </main>
    </div>
  );
}
