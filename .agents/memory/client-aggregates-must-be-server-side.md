---
name: Client aggregates over paginated data must be server-side
description: Why totals/counts spanning all records cannot be summed from infinite-query client pages
---

Any total/count that must reflect ALL records (e.g. "remaining planned blocks across all open tasks") must be computed by a server aggregate endpoint, NOT by summing what the client currently holds.

**Why:** The timeline uses `useInfiniteQuery` paginated by day (`PAGE_DAYS`, default 7). Open tasks float to the top regardless of date, but they are only present in `data.pages` if their day is within the loaded window. Summing loaded pages silently under-reports anything older than the first page (e.g. a task carried over >7 days), producing a falsely optimistic number.

**How to apply:** Add the aggregate to a stats endpoint (the day-budget total lives on `GET /tasks/stats/today` as `openPlannedBlocks`). Aggregate per `(name, date)` group in SQL — `MAX(total_chunks)`, `COUNT(*) FILTER (WHERE completed)`, `COUNT(*)`, and `MAX(horizon) FILTER (WHERE chunk_index = 1)` — filter to open groups that are not parked (`completed_count < block_count` and `horizon <> 'later'`) and `SUM(GREATEST(0, total_chunks - completed_count))` so over-estimated groups never go negative (mirrors the frontend per-group clamp). Later is not today's plan. The client reads the single field instead of recomputing from pages. The open Now / Next / Later list itself is `GET /tasks/open` (every incomplete group, any day), not the paginated timeline.
