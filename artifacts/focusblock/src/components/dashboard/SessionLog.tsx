import { useListSessions, useGetTodayStats } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export function SessionLog() {
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const { data: stats, isLoading: statsLoading } = useGetTodayStats();

  if (sessionsLoading || statsLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-muted rounded-xl"></div>
        <div className="h-64 bg-muted rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card shadow-sm border-border/60">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-primary mb-1">{stats?.totalSessions || 0}</span>
            <span className="text-sm font-medium text-muted-foreground">Sessions Today</span>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-border/60">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-primary mb-1">{stats?.totalMinutes || 0}</span>
            <span className="text-sm font-medium text-muted-foreground">Minutes Focused</span>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Session Log</CardTitle>
        </CardHeader>
        <CardContent>
          {!sessions || sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sessions completed today yet.
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between py-3 px-2 border-b border-border/40 last:border-0 hover:bg-muted/20 rounded transition-colors">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{session.taskName}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(session.completedAt), "h:mm a")} · {session.durationMinutes}m
                    </span>
                  </div>
                  <div className="text-2xl" title={session.rating || "Unrated"}>
                    {session.rating || <span className="text-sm text-muted-foreground">...</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
