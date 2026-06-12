---
name: Task block write locking
description: Why all append paths to a task group must share one advisory-lock domain in FocusBlock
---

# Task-group block writes must share one advisory-lock domain

Any route that appends a block to a task group (computing `nextChunkIndex` as `max(existing chunkIndex)+1`) is a read-then-insert and MUST run inside a transaction that first takes `pg_advisory_xact_lock(hashtext(name))`. All such routes for the same task `name` must use the identical lock key so they serialize against each other.

**Why:** There is no DB uniqueness constraint on `(name, date, chunkIndex)`. `complete-focus` (append branch) and `add-block` independently compute the next index; if they don't share the lock, a concurrent pair can read the same max and insert duplicate chunk indices, corrupting ordering and the completed/estimated counts. A `FOR UPDATE SKIP LOCKED` claim only protects the *update* path (claiming an existing open row) — it does NOT protect the *insert* path, so it is not a substitute for the advisory lock.

**How to apply:** When adding/editing routes that insert into the tasks table by group, wrap the read+insert in `db.transaction` and take `pg_advisory_xact_lock(hashtext(name))` first (see `complete-focus`, `add-block`, and the note-create path in `artifacts/api-server/src/routes/tasks.ts`). Once serialized under the lock, a plain ordered claim is race-free — no SKIP LOCKED needed. Note `POST /tasks` (initial group create) does not take the lock; it's only safe because add-block requires an existing group in practice.
