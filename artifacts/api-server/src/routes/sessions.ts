import { Router } from "express";
import { db, sessionsTable } from "@workspace/db";
import { desc, eq, gte, lte, and, sql } from "drizzle-orm";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  RateSessionParams,
  RateSessionBody,
} from "@workspace/api-zod";

const router = Router();

function getTodayRange(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// GET /sessions
router.get("/sessions", async (req, res) => {
  const parsed = ListSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { start, end } = getTodayRange(parsed.data.date);

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        gte(sessionsTable.completedAt, start),
        lte(sessionsTable.completedAt, end)
      )
    )
    .orderBy(desc(sessionsTable.completedAt));

  res.json(
    sessions.map((s) => ({
      ...s,
      completedAt: s.completedAt.toISOString(),
    }))
  );
});

// POST /sessions
router.post("/sessions", async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [session] = await db
    .insert(sessionsTable)
    .values({
      taskName: parsed.data.taskName,
      durationMinutes: parsed.data.durationMinutes ?? 30,
    })
    .returning();

  res.status(201).json({
    ...session,
    completedAt: session.completedAt.toISOString(),
  });
});

// PATCH /sessions/:id (rate)
router.patch("/sessions/:id", async (req, res) => {
  const paramsParsed = RateSessionParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = RateSessionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({ rating: bodyParsed.data.rating })
    .where(eq(sessionsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    ...updated,
    completedAt: updated.completedAt.toISOString(),
  });
});

// GET /sessions/stats/today
router.get("/sessions/stats/today", async (req, res) => {
  const { start, end } = getTodayRange();

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        gte(sessionsTable.completedAt, start),
        lte(sessionsTable.completedAt, end)
      )
    );

  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const ratingsBreakdown = {
    distracted: sessions.filter((s) => s.rating === "😩").length,
    okay: sessions.filter((s) => s.rating === "😐").length,
    good: sessions.filter((s) => s.rating === "🙂").length,
    great: sessions.filter((s) => s.rating === "🔥").length,
  };

  res.json({ totalSessions, totalMinutes, ratingsBreakdown });
});

export default router;
