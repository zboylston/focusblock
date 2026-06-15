---
name: Timeline log-day bucketing
description: Why the FocusBlock timeline buckets completed work per-GROUP (not per-block) by completion day.
---

The timeline logs work on the day it was COMPLETED, not created. A block's "log day" = Eastern day of `completedAt`, falling back to planned `date` while open. Server computes it in SQL for pagination; client mirrors it.

**Rule:** bucket fully-completed *groups* by their completion day — never bucket individual blocks across day sections.

**Why:** group metadata (`description`/`link`/`plays`) and the note live only on the chunkIndex-1 block, and group actions (rename/delete/note) assume the whole `(name, date)` group is present. Bucketing per-block splits a partially-done carried-over group: completed blocks land on the completion day, open blocks on the planned day, orphaning chunkIndex-1 metadata from the open remainder and making actions operate on a partial subset.

**How to apply:** client groups whole by `(date, name)` first; pending groups float to top (inline completions), only fully-done groups go under day dividers, keyed by the latest completion day of their blocks. If you ever change the timeline grouping or the day-section logic, keep groups intact.
