import { useChunksLeft } from "@/hooks/use-chunks-left";

type BudgetMeterProps = {
  // Remaining planned focus blocks across all open tasks.
  plannedRemaining: number;
};

// Compares the focus blocks you still plan to do against the work blocks left
// before 5 PM, so you can see at a glance whether the day is over- or
// under-budgeted.
export function BudgetMeter({ plannedRemaining }: BudgetMeterProps) {
  const capacity = useChunksLeft();
  const diff = capacity - plannedRemaining;
  const over = diff < 0;

  // Scale the bar to whichever is larger so an over-budget plan visibly spills
  // past the capacity marker.
  const scale = Math.max(capacity, plannedRemaining, 1);
  const plannedPct = (plannedRemaining / scale) * 100;
  const capacityPct = (capacity / scale) * 100;

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
          Day budget
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${
            over ? "text-destructive" : "text-primary"
          }`}
        >
          {plannedRemaining === 0
            ? "Nothing planned"
            : over
              ? `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "block" : "blocks"} over`
              : `${diff} ${diff === 1 ? "block" : "blocks"} to spare`}
        </span>
      </div>

      {/* Comparison bar: filled = planned work, hairline marker = capacity */}
      <div className="relative mt-2.5 h-2 rounded-full bg-border/50 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            over ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${plannedPct}%` }}
        />
        {capacity > 0 && capacity < scale && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${capacityPct}%` }}
          />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground tabular-nums">{plannedRemaining}</span>{" "}
          planned
        </span>
        <span>
          <span className="font-semibold text-foreground tabular-nums">{capacity}</span> left in day
        </span>
      </div>
    </div>
  );
}
