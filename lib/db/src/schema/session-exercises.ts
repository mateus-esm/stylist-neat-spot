import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";

export const sessionExercisesTable = pgTable("session_exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sets: integer("sets"),
  reps: text("reps"),
  load: text("load"),
  restSeconds: integer("rest_seconds"),
  notes: text("notes"),
  videoUrl: text("video_url"),
  orderIndex: integer("order_index").notNull().default(0),
  performance: text("performance"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionExerciseSchema = createInsertSchema(sessionExercisesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionExercise = z.infer<typeof insertSessionExerciseSchema>;
export type SessionExercise = typeof sessionExercisesTable.$inferSelect;
