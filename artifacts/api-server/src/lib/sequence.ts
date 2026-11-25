import { db, tasksTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";

// One lock for the whole open sequence. Position is global across task names,
// so the per-name advisory lock does not serialize "append to Next" or a move.
// Routes that also take a name lock must acquire this one first.
const SEQUENCE_LOCK_KEY = "focusblock-sequence";

export type Horizon = "now" | "next" | "later";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Head = {
  id: number;
  name: string;
  date: string;
  horizon: Horizon;
  position: number;
  createdAt: number;
};

export function normalizeHorizon(value: string | null | undefined): Horizon {
  if (value === "now" || value === "next" || value === "later") return value;
  return "next";
}

function compareHeads(a: Head, b: Head): number {
  if (a.position !== b.position) return a.position - b.position;
  return b.createdAt - a.createdAt;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export async function lockSequence(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SEQUENCE_LOCK_KEY}))`);
}

// First block of every group that still has open work. Order metadata lives there.
export async function listOpenHeads(tx: Tx): Promise<Head[]> {
  const rows = await tx
    .select()
    .from(tasksTable)
    .where(
      sql`(${tasksTable.name}, ${tasksTable.date}) IN (
        SELECT name, date FROM tasks
        GROUP BY name, date
        HAVING COUNT(*) FILTER (WHERE NOT completed) > 0
      )`,
    )
    .orderBy(asc(tasksTable.name), asc(tasksTable.date), asc(tasksTable.chunkIndex));

  const heads: Head[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.date}\u0000${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    heads.push({
      id: row.id,
      name: row.name,
      date: row.date,
      horizon: normalizeHorizon(row.horizon),
      position: row.position,
      createdAt: row.createdAt.getTime(),
    });
  }
  return heads;
}

async function writeHead(tx: Tx, head: Head, horizon: Horizon, position: number) {
  if (head.horizon === horizon && head.position === position) return;
  await tx.update(tasksTable).set({ horizon, position }).where(eq(tasksTable.id, head.id));
  head.horizon = horizon;
  head.position = position;
}

async function writeList(tx: Tx, heads: Head[], horizon: Horizon) {
  for (let index = 0; index < heads.length; index++) {
    await writeHead(tx, heads[index], horizon, index);
  }
}

function splitWithout(heads: Head[], targetId: number) {
  const rest = heads.filter((head) => head.id !== targetId);
  return {
    now: rest.filter((head) => head.horizon === "now").sort(compareHeads),
    next: rest.filter((head) => head.horizon === "next").sort(compareHeads),
    later: rest.filter((head) => head.horizon === "later").sort(compareHeads),
  };
}

// `index` is the destination slot after the group has been lifted out of the
// sequence. Now ignores index: any other Now is inserted at the top of Next.
export async function placeOpenGroup(
  tx: Tx,
  input: { name: string; date: string; horizon: Horizon; index: number },
) {
  await lockSequence(tx);
  const heads = await listOpenHeads(tx);
  const target = heads.find((head) => head.name === input.name && head.date === input.date);
  if (!target) return null;

  const { now, next, later } = splitWithout(heads, target.id);

  if (input.horizon === "now") {
    await writeHead(tx, target, "now", 0);
    await writeList(tx, [...now, ...next], "next");
    await writeList(tx, later, "later");
  } else if (input.horizon === "next") {
    next.splice(clamp(input.index, 0, next.length), 0, target);
    await writeList(tx, next, "next");
    await writeList(tx, later, "later");
  } else {
    later.splice(clamp(input.index, 0, later.length), 0, target);
    await writeList(tx, next, "next");
    await writeList(tx, later, "later");
  }

  const [row] = await tx.select().from(tasksTable).where(eq(tasksTable.id, target.id));
  return row ?? null;
}

export async function nextAppendPosition(tx: Tx, horizon: Horizon): Promise<number> {
  const heads = await listOpenHeads(tx);
  let max = -1;
  for (const head of heads) {
    if (head.horizon === horizon) max = Math.max(max, head.position);
  }
  return max + 1;
}

// Date, when present, must match that open group. Without a date, prefer today's
// open group, then an existing Now, then the front of Next, then Later.
export async function focusOpenGroup(
  tx: Tx,
  input: { name: string; date?: string },
  today: string,
) {
  const heads = await listOpenHeads(tx);
  const matches = heads.filter((head) => head.name === input.name);
  let target: Head | undefined;
  if (input.date) {
    target = matches.find((head) => head.date === input.date);
    if (!target) return null;
  } else {
    const bySequence = (horizon: Horizon) =>
      matches.filter((head) => head.horizon === horizon).sort(compareHeads);
    target =
      matches.find((head) => head.date === today) ??
      bySequence("now")[0] ??
      bySequence("next")[0] ??
      bySequence("later")[0];
    if (!target) return null;
  }

  return placeOpenGroup(tx, {
    name: target.name,
    date: target.date,
    horizon: "now",
    index: 0,
  });
}
