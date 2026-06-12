---
name: Task notes resolved by name use most-recent group, not today
description: Why focus-card/by-name note lookups span all days and the orval query-options queryKey gotcha
---

When a UI surface knows only a task NAME (not a block id) and must show/edit "the task's note" (the per-group `description`), resolve it from the MOST RECENT group for that name across ALL days (`ORDER BY date DESC, chunkIndex ASC LIMIT 1`), not today-only.

**Why:** Notes are stored per `(name, date)` group on the group's first block. A today-only lookup returns null for carried-over tasks that still show a note in the timeline, which violates "show the existing note if it exists." Editing must target that same most-recent group so the focus card and timeline stay in sync; only create a fresh (today) block when NO group exists at all for the name.

**How to apply:** The by-name upsert (`PUT /tasks/note`) must wrap find-or-create in a transaction with `pg_advisory_xact_lock(hashtext(name))` to serialize concurrent saves and avoid the read-then-insert duplicate-first-block race. Note: `complete-focus` does NOT share this lock domain, so a PUT-vs-complete-focus race for a brand-new name is a known, accepted residual risk for the single-user case.

**Orval gotcha:** When passing a `query: {...}` options override to a generated `useGet*` hook (e.g. to set `enabled`), you MUST also pass an explicit `queryKey` (use the generated `getGet*QueryKey(...)`). Orval's generated option type makes `queryKey` required once you supply custom options; omitting it is a type error.
