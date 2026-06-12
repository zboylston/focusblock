import { useChunksLeft } from "@/hooks/use-chunks-left";

type BudgetMeterProps = {
  // Remaining planned focus blocks across all open tasks.
  plannedRemaining: number;
};

// Quietly compares the focus blocks you still plan to do against the work
// blocks left before 5 PM — a single hairline so you can read the day at a
// glance without it shouting.
export function BudgetMeter({ plannedRemaining }: BudgetMeterProps) {
  const capacity = useChunksLeft();
  const diff = capacity - plannedRemaining;
  const over = diff < 0;

  // Scale to whichever is larger so an over-budget plan visibly spills past the
  // capacity marker.
  const scale = Math.max(capacity, plannedRemaining, 1);
  const plannedPct = (plannedRemaining / scale) * 100;
  const capacityPct = (capacity / scale) * 100;

  return (
    <div className="mt-4">
      <div className="relative h-1 rounded-full bg-border/40 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            over ? "bg-destructive/70" : "bg-primary/60"
          }`}
          style={{ width: `${plannedPct}%` }}
        />
        {capacity > 0 && capacity < scale && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/25"
            style={{ left: `${capacityPct}%` }}
          />
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground/80">
        <span className="tabular-nums">{plannedRemaining}</span> planned ·{" "}
        <span className="tabular-nums">{capacity}</span> left until 5 PM EST ·{" "}
        <span className={over ? "text-destructive" : "text-primary"}>
          {plannedRemaining === 0
            ? "nothing planned"
            : over
              ? `${Math.abs(diff)} over`
              : `${diff} to spare`}
        </span>
      </p>
    </div>
  );
}
