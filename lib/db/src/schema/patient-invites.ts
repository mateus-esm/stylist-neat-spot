import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const patientInvitesTable = pgTable("patient_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The Clerk userId of the admin who sent the invite */
  adminUserId: text("admin_user_id").notNull(),
  /** FK to clients.id — the client being invited */
  clientId: uuid("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  /** Email address the invite was sent to */
  email: text("email").notNull().unique(),
  /** Whether this invite has been consumed (patient linked) */
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPatientInviteSchema = createInsertSchema(
  patientInvitesTable,
).omit({ id: true, createdAt: true });
export type InsertPatientInvite = z.infer<typeof insertPatientInviteSchema>;
export type PatientInvite = typeof patientInvitesTable.$inferSelect;
