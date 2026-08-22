import { pgTable, text, uuid, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { appointmentsTable } from "./appointments";

export const sessionPlansTable = pgTable("session_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  clientId: uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  exercises: text("exercises"),
  tips: text("tips"),
  scheduling: text("scheduling"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionPlanSchema = createInsertSchema(sessionPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionPlan = z.infer<typeof insertSessionPlanSchema>;
export type SessionPlan = typeof sessionPlansTable.$inferSelect;
