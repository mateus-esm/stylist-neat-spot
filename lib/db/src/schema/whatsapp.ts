import { pgTable, text, uuid, timestamp, boolean, jsonb, unique, index, integer } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { clientsTable } from "./clients";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappEventTypes = [
  "invite",
  "appointment_confirmation",
  "appointment_reminder",
  "reschedule",
] as const;
export type WhatsappEventType = typeof whatsappEventTypes[number];

export const whatsappSettingsTable = pgTable("whatsapp_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }).unique(),
  enabled: boolean("enabled").notNull().default(false),
  reminderHours: jsonb("reminder_hours").$type<number[]>().notNull().default([24, 2]),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const whatsappTemplatesTable = pgTable("whatsapp_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  eventType: text("event_type").notNull(),
  label: text("label").notNull(),
  body: text("body").notNull(),
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("whatsapp_templates_clinic_key_unique").on(table.clinicId, table.key),
  index("whatsapp_templates_clinic_idx").on(table.clinicId),
]);

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
  templateKey: text("template_key"),
  templateVersion: integer("template_version"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: text("lock_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("whatsapp_outbox_clinic_idempotency_unique").on(table.clinicId, table.idempotencyKey),
  index("whatsapp_outbox_status_idx").on(table.status),
  index("whatsapp_outbox_eligible_idx").on(table.status, table.nextAttemptAt),
]);

export const whatsappDeliveryEventsTable = pgTable("whatsapp_delivery_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  outboxId: uuid("outbox_id").references(() => whatsappOutboxTable.id, { onDelete: "set null" }),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull(),
  providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("whatsapp_delivery_provider_event_unique").on(table.clinicId, table.providerMessageId, table.status),
  index("whatsapp_delivery_outbox_idx").on(table.outboxId),
]);

export const insertWhatsappSettingsSchema = createInsertSchema(whatsappSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappTemplateSchema = createInsertSchema(whatsappTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappConsentSchema = createInsertSchema(whatsappConsentsTable).omit({ id: true, updatedAt: true });
export const insertWhatsappOutboxSchema = createInsertSchema(whatsappOutboxTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappDeliveryEventSchema = createInsertSchema(whatsappDeliveryEventsTable).omit({ id: true, createdAt: true });
export type InsertWhatsappSettings = z.infer<typeof insertWhatsappSettingsSchema>;
export type InsertWhatsappTemplate = z.infer<typeof insertWhatsappTemplateSchema>;
export type InsertWhatsappConsent = z.infer<typeof insertWhatsappConsentSchema>;
export type InsertWhatsappOutbox = z.infer<typeof insertWhatsappOutboxSchema>;
export type InsertWhatsappDeliveryEvent = z.infer<typeof insertWhatsappDeliveryEventSchema>;
export type WhatsappSettings = typeof whatsappSettingsTable.$inferSelect;
export type WhatsappTemplate = typeof whatsappTemplatesTable.$inferSelect;
export type WhatsappConsent = typeof whatsappConsentsTable.$inferSelect;
export type WhatsappOutbox = typeof whatsappOutboxTable.$inferSelect;
export type WhatsappDeliveryEvent = typeof whatsappDeliveryEventsTable.$inferSelect;