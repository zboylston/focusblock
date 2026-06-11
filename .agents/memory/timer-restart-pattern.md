---
name: Countdown timer restart pattern
description: How to reliably (re)start a setInterval-based countdown timer in React when it may already be running
---

# Restarting a running countdown timer

When a countdown timer drives its interval from a `useEffect` keyed on `isActive`
(plus the completion callback), triggering a *fresh restart while it is already
running* is fragile:

- If `isActive` is already `true` and you mutate `endTimeRef.current = null`
  expecting the effect to recompute it, the old interval keeps running and reads
  the nulled ref → `(null - Date.now())` coerces to a bogus value → the timer
  fires completion immediately instead of restarting.

**Rule:** to restart reliably,
1. Set `endTimeRef.current` to a *valid fresh* end timestamp synchronously
   (`Date.now() + DURATION*1000`) — never leave it null while an interval may tick.
2. Bump a dedicated `runId` state and include it in the interval effect's deps so
   the effect tears down and rebuilds the interval even when `isActive` is unchanged.

**Why:** React only re-runs an effect when its deps change. Relying on
`isActive`/callback-identity changes to coincide with a restart is unreliable —
they may not change (same task replayed), leaving a stale interval running.

**How to apply:** any "play/restart" entry point (e.g. FocusBlock's planner play
button via a `startToken` prop) should do both steps. See
`artifacts/focusblock/src/components/dashboard/Timer.tsx`.
