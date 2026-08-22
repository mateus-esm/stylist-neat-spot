import { pgTable, text, uuid, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const patientPackagesTable = pgTable("patient_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  clientId: uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  totalSessions: integer("total_sessions").notNull().default(1),
  completedSessions: integer("completed_sessions").notNull().default(0),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("pendente"),
  status: text("status").notNull().default("ativo"),
  service: text("service"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPatientPackageSchema = createInsertSchema(patientPackagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatientPackage = z.infer<typeof insertPatientPackageSchema>;
export type PatientPackage = typeof patientPackagesTable.$inferSelect;
