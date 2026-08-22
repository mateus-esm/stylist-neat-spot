import { pgTable, text, uuid, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packageTemplatesTable = pgTable("package_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  defaultSessions: integer("default_sessions").notNull().default(10),
  defaultPrice: numeric("default_price").notNull().default("0"),
  defaultService: text("default_service"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPackageTemplateSchema = createInsertSchema(packageTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPackageTemplate = z.infer<typeof insertPackageTemplateSchema>;
export type PackageTemplate = typeof packageTemplatesTable.$inferSelect;
