import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export function Header() {
  const [chunksLeft, setChunksLeft] = useState<number>(0);

  useEffect(() => {
    const calculateChunksLeft = () => {
      const now = new Date();

      // Shift "now" into Eastern wall-clock time so both the current time and
      // the 5 PM target live in the same frame; their difference is then the
      // real time remaining. America/New_York handles DST automatically.
      const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const target = new Date(eastern);
      target.setHours(17, 0, 0, 0); // 5 PM Eastern

      const diffMs = target.getTime() - eastern.getTime();

      if (diffMs <= 0) {
        setChunksLeft(0);
      } else {
        // A chunk is 30 mins focus + 5 mins break = 35 mins.
        setChunksLeft(Math.floor(diffMs / (1000 * 60 * 35)));
      }
    };

    calculateChunksLeft();
    const interval = setInterval(calculateChunksLeft, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
          <Clock className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">FocusBlock</h1>
      </div>
      <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary/80 animate-pulse"></div>
        {chunksLeft} chunks left until 5 PM EST
      </div>
    </header>
  );
}
