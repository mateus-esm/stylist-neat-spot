import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";

export const sessionMediaTable = pgTable("session_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  mediaType: text("media_type").notNull().default("image"),
  caption: text("caption"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionMediaSchema = createInsertSchema(sessionMediaTable).omit({ id: true, createdAt: true });
export type InsertSessionMedia = z.infer<typeof insertSessionMediaSchema>;
export type SessionMedia = typeof sessionMediaTable.$inferSelect;
