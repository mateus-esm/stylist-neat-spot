import { pgTable, text, uuid, timestamp, unique, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicInvitationsTable = pgTable("clinic_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("physiotherapist"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: text("accepted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("clinic_invitations_clinic_email_pending_unique").on(table.clinicId, table.email),
  index("clinic_invitations_clinic_idx").on(table.clinicId),
]);

export const insertClinicInvitationSchema = createInsertSchema(clinicInvitationsTable).omit({ id: true, createdAt: true });
export type InsertClinicInvitation = z.infer<typeof insertClinicInvitationSchema>;
export type ClinicInvitation = typeof clinicInvitationsTable.$inferSelect;