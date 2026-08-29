import { pgTable, text, uuid, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicAuditEventsTable = pgTable("clinic_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("clinic_audit_clinic_created_idx").on(table.clinicId, table.createdAt),
]);

export const insertClinicAuditEventSchema = createInsertSchema(clinicAuditEventsTable).omit({ id: true, createdAt: true });
export type InsertClinicAuditEvent = z.infer<typeof insertClinicAuditEventSchema>;
export type ClinicAuditEvent = typeof clinicAuditEventsTable.$inferSelect;