import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import {
  ListTasksQueryParams,
  CreateTasksBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { getEasternDateString } from "../lib/time";

const router = Router();

// Resolves the planner date. Defaults to the current Eastern calendar day.
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

// GET /tasks
router.get("/tasks", async (req, res) => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const dateStr = resolveDateString(parsed.data.date);

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.date, dateStr))
    .orderBy(asc(tasksTable.createdAt), asc(tasksTable.chunkIndex));

  res.json(
    tasks.map((t) => ({
      ...t,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

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

  res.status(201).json(
    created.map((t) => ({
      ...t,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    }))
  );
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

  res.json({
    ...updated,
    completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
  });
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
