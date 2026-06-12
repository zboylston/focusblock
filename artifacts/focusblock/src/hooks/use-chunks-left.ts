import { useState, useEffect } from "react";

// Work blocks remaining until 5 PM Eastern. A block is 30 min focus + 5 min
// break = 35 min. Shared by the header counter and the day-budget meter so they
// never drift. Recomputes every minute.
export function useChunksLeft(): number {
  const [chunksLeft, setChunksLeft] = useState<number>(0);

  useEffect(() => {
    const calculate = () => {
      const now = new Date();

      // Shift "now" into Eastern wall-clock time so both the current time and
      // the 5 PM target live in the same frame; their difference is then the
      // real time remaining. America/New_York handles DST automatically.
      const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const target = new Date(eastern);
      target.setHours(17, 0, 0, 0); // 5 PM Eastern

      const diffMs = target.getTime() - eastern.getTime();
      setChunksLeft(diffMs <= 0 ? 0 : Math.floor(diffMs / (1000 * 60 * 35)));
    };

    calculate();
    const interval = setInterval(calculate, 60000);
    return () => clearInterval(interval);
  }, []);

  return chunksLeft;
}
