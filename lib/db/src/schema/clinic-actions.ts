import { pgTable, text, uuid, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { appointmentsTable } from "./appointments";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicActionsTable = pgTable("clinic_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("clinic_actions_appointment_idempotency_unique").on(table.appointmentId, table.idempotencyKey),
  index("clinic_actions_clinic_idx").on(table.clinicId),
]);

export const insertClinicActionSchema = createInsertSchema(clinicActionsTable).omit({ id: true, createdAt: true });
export type InsertClinicAction = z.infer<typeof insertClinicActionSchema>;
export type ClinicAction = typeof clinicActionsTable.$inferSelect;