import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  chunkIndex: integer("chunk_index").notNull().default(1),
  totalChunks: integer("total_chunks").notNull().default(1),
  completed: boolean("completed").notNull().default(false),
  plays: integer("plays").notNull().default(0),
  // Task-group metadata (planner note + reference link). Stored on the first
  // block (chunkIndex 1) of a group, like `plays`.
  description: text("description"),
  link: text("link"),
  // Completion metadata. A block becomes "done" either when its focus timer
  // finishes or when it is checked off manually; rating/notes are optional and
  // only attached via the rating step after a timer completion.
  rating: text("rating"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
