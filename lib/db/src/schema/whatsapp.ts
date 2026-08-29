import { pgTable, text, uuid, timestamp, boolean, jsonb, unique, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { clientsTable } from "./clients";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappConsentsTable = pgTable("whatsapp_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  phone: text("phone"),
  optedIn: boolean("opted_in").notNull().default(false),
  optedInAt: timestamp("opted_in_at", { withTimezone: true }),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [unique("whatsapp_consents_clinic_client_unique").on(table.clinicId, table.clientId)]);

export const whatsappOutboxTable = pgTable("whatsapp_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  phone: text("phone"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  fallbackText: text("fallback_text").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: text("attempts").notNull().default("0"),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("whatsapp_outbox_clinic_idempotency_unique").on(table.clinicId, table.idempotencyKey),
  index("whatsapp_outbox_status_idx").on(table.status),
]);

export const insertWhatsappConsentSchema = createInsertSchema(whatsappConsentsTable).omit({ id: true, updatedAt: true });
export const insertWhatsappOutboxSchema = createInsertSchema(whatsappOutboxTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWhatsappConsent = z.infer<typeof insertWhatsappConsentSchema>;
export type InsertWhatsappOutbox = z.infer<typeof insertWhatsappOutboxSchema>;
export type WhatsappConsent = typeof whatsappConsentsTable.$inferSelect;
export type WhatsappOutbox = typeof whatsappOutboxTable.$inferSelect;