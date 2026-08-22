import {
  pgTable,
  text,
  uuid,
  timestamp,
  bigint,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Pending upload records created by POST /storage/uploads/request-url.
 *
 * Each row binds an immutable storage path to the Clerk userId that requested
 * the presigned upload URL, with an expiration and a consumed marker. The
 * finalize endpoint may only turn a pending upload into a durable
 * session_media row if the caller owns the pending upload, it is unexpired,
 * and it has not already been consumed. This prevents one user from claiming
 * another user's (or an arbitrary pre-existing) object.
 */
export const pendingUploadsTable = pgTable("pending_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Immutable normalised storage path (no leading slash), e.g. "objects/uploads/uuid". Unique. */
  storagePath: text("storage_path").notNull().unique(),
  /** Clerk userId of the user who requested the upload URL. */
  uploaderUserId: text("uploader_user_id").notNull(),
  /** Declared content type at request time (validated media type). */
  contentType: text("content_type").notNull(),
  /** Declared size in bytes at request time. */
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  /** When this pending upload expires and can no longer be finalized. */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** When this pending upload was consumed by the finalize endpoint (null = unconsumed). */
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  /** The session_media.id created when consumed (audit link). */
  consumedMediaId: uuid("consumed_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPendingUploadSchema = createInsertSchema(
  pendingUploadsTable,
).omit({ id: true, createdAt: true });
export type InsertPendingUpload = z.infer<typeof insertPendingUploadSchema>;
export type PendingUpload = typeof pendingUploadsTable.$inferSelect;
