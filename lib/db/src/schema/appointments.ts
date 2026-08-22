import { pgTable, text, uuid, integer, numeric, date, time, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const appointmentsTable = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  clientId: uuid("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  clientName: text("client_name").notNull(),
  appointmentDate: date("appointment_date", { mode: "string" }).notNull(),
  appointmentTime: time("appointment_time").notNull(),
  service: text("service").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("agendado"),
  durationMin: integer("duration_min").default(30),
  paymentStatus: text("payment_status").notNull().default("pago"),
  photoUrl: text("photo_url"),
  satisfaction: integer("satisfaction"),
  observations: text("observations"),
  // packageId references patient_packages.id — declared as plain uuid to avoid circular import
  packageId: uuid("package_id"),
  packageSessionIndex: integer("package_session_index"),
  packageTotal: integer("package_total"),
  painScale: integer("pain_scale"),
  evolutionNotes: text("evolution_notes"),
  mediaUrl: text("media_url"),
  patientNotes: text("patient_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
