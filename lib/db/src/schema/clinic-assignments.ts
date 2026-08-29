import { pgTable, text, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { clientsTable } from "./clients";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicAssignmentsTable = pgTable("clinic_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  physiotherapistUserId: text("physiotherapist_user_id"),
  assignedBy: text("assigned_by").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("clinic_assignments_client_unique").on(table.clinicId, table.clientId),
  index("clinic_assignments_physio_idx").on(table.physiotherapistUserId),
]);

export const insertClinicAssignmentSchema = createInsertSchema(clinicAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicAssignment = z.infer<typeof insertClinicAssignmentSchema>;
export type ClinicAssignment = typeof clinicAssignmentsTable.$inferSelect;