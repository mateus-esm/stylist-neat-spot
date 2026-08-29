import { pgTable, text, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicMembersTable = pgTable("clinic_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  email: text("email"),
  role: text("role").notNull().default("physiotherapist"),
  status: text("status").notNull().default("active"),
  invitedBy: text("invited_by"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("clinic_members_clinic_user_unique").on(table.clinicId, table.userId),
  index("clinic_members_clinic_idx").on(table.clinicId),
]);

export const insertClinicMemberSchema = createInsertSchema(clinicMembersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicMember = z.infer<typeof insertClinicMemberSchema>;
export type ClinicMember = typeof clinicMembersTable.$inferSelect;