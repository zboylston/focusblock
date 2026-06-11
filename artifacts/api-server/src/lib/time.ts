// All "today" boundaries in FocusBlock are anchored to US Eastern time, since
// the product is built around a 5 PM EST cutoff. Computing the day server-side
// in America/New_York keeps the Session Log, stats, and Daily Planner aligned
// to the user's working day regardless of the server's own timezone.

const EASTERN_TZ = "America/New_York";

// Offset (wall-clock minus UTC) in milliseconds for a given instant.
function easternOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) {
    map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - at.getTime();
}

// Returns the calendar date (YYYY-MM-DD) in Eastern time for the given instant.
export function getEasternDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EASTERN_TZ }).format(at);
}

// The UTC instant of Eastern midnight for a given YYYY-MM-DD calendar date.
function easternDayStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const wallAsUTC = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // Sample noon of that day to read the correct DST offset, then back it out.
  const offset = easternOffsetMs(new Date(`${dateStr}T12:00:00Z`));
  return new Date(wallAsUTC - offset);
}

// Half-open [start, end) instant range covering an Eastern calendar day.
// Using the next day's start as the exclusive end is DST-safe (days can be
// 23 or 25 hours long).
export function getEasternDayRange(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ?? getEasternDateString();
  const start = easternDayStart(base);
  const next = new Date(start.getTime() + 26 * 60 * 60 * 1000);
  const end = easternDayStart(getEasternDateString(next));
  return { start, end };
}
