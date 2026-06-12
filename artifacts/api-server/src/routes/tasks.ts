import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, and, asc, desc, lt, inArray, sql } from "drizzle-orm";
import {
  CreateTasksBody,
  CompleteFocusBody,
  GetTaskNoteQueryParams,
  UpdateTaskNoteBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { getEasternDateString } from "../lib/time";

const router = Router();

// Resolves a calendar date. Defaults to the current Eastern calendar day.
// An explicitly supplied date is treated as a calendar day (YYYY-MM-DD) — the
// Zod schema coerces it to a UTC-midnight Date, so we read it back in UTC to
// preserve the day the caller intended.
function resolveDateString(value?: string | Date): string {
  if (!value) {
    return getEasternDateString();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

// Shapes a DB row into the API contract (timestamps as ISO strings).
function serializeTask(t: typeof tasksTable.$inferSelect) {
  return {
    ...t,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

// POST /tasks
router.post("/tasks", async (req, res) => {
  const parsed = CreateTasksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { name, chunks, date } = parsed.data;
  const dateStr = resolveDateString(date);

  const insertValues = Array.from({ length: chunks }, (_, i) => ({
    name,
    date: dateStr,
    chunkIndex: i + 1,
    totalChunks: chunks,
    completed: false,
  }));

  const created = await db.insert(tasksTable).values(insertValues).returning();

  res.status(201).json(created.map(serializeTask));
});

// GET /tasks/timeline — paginated by distinct day, newest first.
// Registered before /tasks/:id so the literal path takes precedence.
router.get("/tasks/timeline", async (req, res) => {
  // Query params arrive as strings; validate the calendar-day cursor directly
  // rather than via the generated z.date() schema (which rejects strings).
  const beforeRaw = typeof req.query.before === "string" ? req.query.before : undefined;
  if (beforeRaw !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(beforeRaw)) {
    res.status(400).json({ error: "Invalid 'before' (expected YYYY-MM-DD)" });
    return;
  }

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(31, Math.max(1, Math.trunc(limitRaw)))
    : 7;
  const before = beforeRaw;

  const dayFilter = before ? lt(tasksTable.date, before) : undefined;

  const dayRows = await db
    .selectDistinct({ date: tasksTable.date })
    .from(tasksTable)
    .where(dayFilter)
    .orderBy(desc(tasksTable.date))
    .limit(limit);

  const days = dayRows.map((d) => d.date);

  if (days.length === 0) {
    res.json({ tasks: [], nextCursor: null, hasMore: false });
    return;
  }

  const oldest = days[days.length - 1];

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(inArray(tasksTable.date, days))
    .orderBy(
      desc(tasksTable.date),
      asc(tasksTable.createdAt),
      asc(tasksTable.chunkIndex),
    );

  const [older] = await db
    .select({ date: tasksTable.date })
    .from(tasksTable)
    .where(lt(tasksTable.date, oldest))
    .limit(1);

  const hasMore = Boolean(older);
  res.json({
    tasks: tasks.map(serializeTask),
    nextCursor: hasMore ? oldest : null,
    hasMore,
  });
});

// GET /tasks/stats/today — completed blocks and minutes for the Eastern today.
router.get("/tasks/stats/today", async (_req, res) => {
  const today = getEasternDateString();

  const rows = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.date, today), eq(tasksTable.completed, true)));

  const totalBlocks = rows.length;

  // Remaining planned blocks across ALL open task groups (any day), so the day
  // budget reflects every pending block — not just the days the client has
  // paged in. Aggregate per (name, date) group, mirroring the frontend's
  // per-group clamp so over-estimated groups never subtract from the total.
  const openPlannedRows = await db.execute(sql`
    SELECT COALESCE(SUM(GREATEST(0, total_chunks - completed_count)), 0)::int AS open_planned
    FROM (
      SELECT
        MAX(total_chunks) AS total_chunks,
        COUNT(*) FILTER (WHERE completed) AS completed_count,
        COUNT(*) AS block_count
      FROM tasks
      GROUP BY name, date
    ) g
    WHERE g.completed_count < g.block_count
  `);
  const openPlannedBlocks = Number(
    (openPlannedRows.rows[0] as { open_planned: number } | undefined)?.open_planned ?? 0,
  );

  res.json({ totalBlocks, totalMinutes: totalBlocks * 30, openPlannedBlocks });
});

// POST /tasks/complete-focus — mark the next open block for a name done.
// If none is open, create a fresh completed block for today. This is the single
// completion path a finished focus timer uses.
router.post("/tasks/complete-focus", async (req, res) => {
  const parsed = CompleteFocusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const name = parsed.data.name;
  const today = getEasternDateString();

  // Atomically claim the lowest open block for this name+day. FOR UPDATE SKIP
  // LOCKED ensures two concurrent completions never claim the same row (which
  // would otherwise lose a completion event under rapid taps).
  const [claimed] = await db
    .update(tasksTable)
    .set({ completed: true, completedAt: new Date() })
    .where(
      eq(
        tasksTable.id,
        sql`(select ${tasksTable.id} from ${tasksTable} where ${tasksTable.date} = ${today} and ${tasksTable.name} = ${name} and ${tasksTable.completed} = false order by ${tasksTable.chunkIndex} asc limit 1 for update skip locked)`,
      ),
    )
    .returning();

  if (claimed) {
    res.json(serializeTask(claimed));
    return;
  }

  // No open block — this was an unplanned focus run (or an extra block beyond
  // the estimate). Append a completed block to the group for today.
  const existing = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.date, today), eq(tasksTable.name, name)));

  const nextChunkIndex =
    existing.reduce((max, t) => Math.max(max, t.chunkIndex), 0) + 1;
  const totalChunks = existing.reduce(
    (max, t) => Math.max(max, t.totalChunks),
    nextChunkIndex,
  );

  const [created] = await db
    .insert(tasksTable)
    .values({
      name,
      date: today,
      chunkIndex: nextChunkIndex,
      totalChunks,
      completed: true,
      completedAt: new Date(),
    })
    .returning();

  res.json(serializeTask(created));
});

// GET /tasks/note?name=... — task-group note (description) by name, resolved
// from the MOST RECENT group (any day) so a carried-over task still surfaces its
// existing note. Registered before /tasks/:id so the literal segment wins.
router.get("/tasks/note", async (req, res) => {
  const parsed = GetTaskNoteQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }

  const [first] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.name, parsed.data.name))
    .orderBy(desc(tasksTable.date), asc(tasksTable.chunkIndex))
    .limit(1);

  res.json({ taskId: first?.id ?? null, description: first?.description ?? null });
});

// PUT /tasks/note — upsert the task-group note by name. The note lives on the
// group's first block (chunkIndex 1), like description/link/plays elsewhere. We
// edit the most recent group (any day) in place; only when no group exists at
// all do we create a fresh block (today) to hold the note.
router.put("/tasks/note", async (req, res) => {
  const parsed = UpdateTaskNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { name } = parsed.data;
  // Empty/whitespace clears the note (stored as null), matching PATCH /tasks/:id.
  const description = parsed.data.description.trim() || null;
  const today = getEasternDateString();

  // Serialize concurrent upserts for the same name so the create path can't
  // insert two competing "first blocks" (read-then-insert race). The advisory
  // lock is released automatically when the transaction ends.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${name}))`);

    const [first] = await tx
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.name, name))
      .orderBy(desc(tasksTable.date), asc(tasksTable.chunkIndex))
      .limit(1);

    if (first) {
      const [updated] = await tx
        .update(tasksTable)
        .set({ description })
        .where(eq(tasksTable.id, first.id))
        .returning();
      return { taskId: updated.id, description: updated.description ?? null };
    }

    // No group anywhere. Only materialize an open block when there's real note
    // content, so empty saves don't litter the planner with placeholder blocks.
    if (description === null) {
      return { taskId: null, description: null };
    }

    const [created] = await tx
      .insert(tasksTable)
      .values({
        name,
        date: today,
        chunkIndex: 1,
        totalChunks: 1,
        completed: false,
        description,
      })
      .returning();
    return { taskId: created.id, description: created.description ?? null };
  });

  res.json(result);
});

// PATCH /tasks/:id
router.patch("/tasks/:id", async (req, res) => {
  const paramsParsed = UpdateTaskParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateTaskBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (bodyParsed.data.completed !== undefined) {
    updates.completed = bodyParsed.data.completed;
    updates.completedAt = bodyParsed.data.completed ? new Date() : null;
  }
  if (bodyParsed.data.name !== undefined) {
    updates.name = bodyParsed.data.name;
  }
  if (bodyParsed.data.rating !== undefined) {
    updates.rating = bodyParsed.data.rating;
  }
  if (bodyParsed.data.notes !== undefined) {
    updates.notes = bodyParsed.data.notes;
  }
  // Empty string clears the task-group note/link (stored as null).
  if (bodyParsed.data.description !== undefined) {
    updates.description = bodyParsed.data.description.trim() || null;
  }
  if (bodyParsed.data.link !== undefined) {
    updates.link = bodyParsed.data.link.trim() || null;
  }
  if (bodyParsed.data.plays !== undefined) {
    updates.plays = bodyParsed.data.plays;
  }
  // Atomic increment avoids lost updates from concurrent/rapid play taps.
  if (bodyParsed.data.incrementPlays !== undefined) {
    updates.plays = sql`${tasksTable.plays} + ${bodyParsed.data.incrementPlays}`;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(serializeTask(updated));
});

// DELETE /tasks/:id
router.delete("/tasks/:id", async (req, res) => {
  const paramsParsed = DeleteTaskParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, paramsParsed.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.status(204).send();
});

export default router;
