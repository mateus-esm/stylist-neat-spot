/**
 * Object Storage routes — Clerk auth + DB-backed authorization.
 *
 * POST /storage/uploads/request-url
 *   Requires Clerk auth. Validates content-type (media only) and size (max 50 MB).
 *   Sets object ACL metadata with owner = userId, visibility = private.
 *
 * GET  /storage/public-objects/*filePath
 *   Unconditionally public — no auth or ACL checks.
 *
 * GET  /storage/objects/*path
 *   READ authorization: must be uploader, owning admin (appointment.user_id),
 *   or the linked patient (client.auth_user_id matches).
 *
 * DELETE /storage/objects/*path
 *   DELETE authorization: patient may only delete media THEY uploaded
 *   (session_media.uploaded_by = userId); owning admin may delete all their
 *   appointment media (appointment.user_id = userId); uploader is always allowed.
 */
import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  db,
  sessionMediaTable,
  appointmentsTable,
  clientsTable,
  userRolesTable,
  pendingUploadsTable,
} from "@workspace/db";
import {
  ObjectNotFoundError,
  ObjectStorageService,
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
} from "../lib/objectStorage";
import {
  setObjectAclPolicy,
  canAccessObject,
  ObjectPermission,
} from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ---------------------------------------------------------------------------
// Constants (MAX_UPLOAD_BYTES and ALLOWED_MEDIA_TYPES imported from objectStorage)
// ---------------------------------------------------------------------------

/** How long a requested upload URL / pending upload remains finalizable. */
const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RequestUploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().int().min(1),
  contentType: z.string().min(1),
});

/** Strip leading slash → stored as "objects/uploads/uuid" in DB. */
function storagePathFromObjectPath(objectPath: string): string {
  return objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
}

/** Restore leading slash for GCS service call. */
function objectPathFromStoragePath(storagePath: string): string {
  return storagePath.startsWith("/") ? storagePath : `/${storagePath}`;
}

/**
 * Find the session_media row by trying both the path with and without a
 * leading slash, since callers may use either form.
 */
async function findMediaRow(
  rawPath: string,
): Promise<(typeof sessionMediaTable.$inferSelect) | null> {
  // Try path as received
  const [row1] = await db
    .select()
    .from(sessionMediaTable)
    .where(eq(sessionMediaTable.storagePath, rawPath))
    .limit(1);
  if (row1) return row1;

  // Try the normalised DB form (no leading slash)
  const normalised = storagePathFromObjectPath(
    objectPathFromStoragePath(rawPath),
  );
  if (normalised !== rawPath) {
    const [row2] = await db
      .select()
      .from(sessionMediaTable)
      .where(eq(sessionMediaTable.storagePath, normalised))
      .limit(1);
    if (row2) return row2;
  }
  return null;
}

/**
 * READ authorisation: uploader | admin who owns the appointment | linked patient.
 */
async function canReadMedia(
  userId: string,
  rawPath: string,
): Promise<boolean> {
  const media = await findMediaRow(rawPath);
  if (!media) return false;

  // Uploader always may read
  if (media.uploadedBy === userId) return true;

  const [appt] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, media.appointmentId))
    .limit(1);
  if (!appt) return false;

  // Admin who owns the appointment
  if (appt.userId === userId) return true;

  // Patient whose linked client matches
  if (appt.clientId) {
    const [client] = await db
      .select({ authUserId: clientsTable.authUserId })
      .from(clientsTable)
      .where(
        and(
          eq(clientsTable.id, appt.clientId),
          eq(clientsTable.authUserId, userId),
        ),
      )
      .limit(1);
    if (client) return true;
  }

  return false;
}

/**
 * DELETE authorisation: uploader | admin who owns the appointment.
 * Patients may NOT delete media unless they uploaded it (uploaded_by = userId).
 */
async function canDeleteMedia(
  userId: string,
  rawPath: string,
): Promise<boolean> {
  const media = await findMediaRow(rawPath);
  if (!media) return false;

  // Uploader (admin or patient) may always delete their own upload
  if (media.uploadedBy === userId) return true;

  // Admin who owns the appointment may delete any media on it
  const [appt] = await db
    .select({ userId: appointmentsTable.userId })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, media.appointmentId))
    .limit(1);
  if (appt && appt.userId === userId) return true;

  return false;
}

// ---------------------------------------------------------------------------
// POST /storage/uploads/request-url
// ---------------------------------------------------------------------------
router.post(
  "/storage/uploads/request-url",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Only registered clinic users may upload
    const [roleRow] = await db
      .select()
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, userId))
      .limit(1);
    if (!roleRow) {
      res.status(403).json({ error: "No clinic role assigned" });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    const { name, size, contentType } = parsed.data;

    // Validate size
    if (size > MAX_UPLOAD_BYTES) {
      res.status(413).json({
        error: `File too large. Maximum allowed size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
      });
      return;
    }

    // Validate content type
    const baseType = contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MEDIA_TYPES.has(baseType)) {
      res.status(415).json({
        error: `Unsupported media type: ${baseType}. Only image, video, and audio files are allowed.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);
      const storagePath = storagePathFromObjectPath(objectPath);

      // Attempt to pre-set ACL; the object may not exist until after upload.
      // This object was just minted for THIS user, so setting the owner is safe.
      try {
        const objectFile =
          await objectStorageService.getObjectEntityFile(objectPath);
        await setObjectAclPolicy(objectFile, {
          owner: userId,
          visibility: "private",
        });
      } catch {
        req.log.warn(
          { objectPath },
          "Could not pre-set ACL; will rely on DB authorization",
        );
      }

      // Record a DB-backed pending upload binding this immutable storage path
      // to the requesting user, with an expiration and unconsumed state. Only
      // the finalize endpoint may consume it (see clinic media finalizer).
      const expiresAt = new Date(Date.now() + PENDING_UPLOAD_TTL_MS);
      await db.insert(pendingUploadsTable).values({
        storagePath,
        uploaderUserId: userId,
        contentType: baseType,
        sizeBytes: size,
        expiresAt,
      });

      res.json({
        uploadURL,
        objectPath,
        storagePath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /storage/public-objects/*filePath
// ---------------------------------------------------------------------------
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const response = await objectStorageService.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /storage/objects/*path — read authorisation
// ---------------------------------------------------------------------------
router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      // DB-based read authorization
      const allowed = await canReadMedia(userId, objectPath);
      if (!allowed) {
        // GCS ACL owner fallback for objects not yet in session_media
        try {
          const objectFile =
            await objectStorageService.getObjectEntityFile(objectPath);
          const aclAllowed = await canAccessObject({
            userId,
            objectFile,
            requestedPermission: ObjectPermission.READ,
          });
          if (!aclAllowed) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        } catch {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /storage/objects/*path — delete authorisation (stricter than read)
// ---------------------------------------------------------------------------
router.delete(
  "/storage/objects/*path",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      // DB-based delete authorization (stricter than read)
      const allowed = await canDeleteMedia(userId, objectPath);
      if (!allowed) {
        // GCS ACL WRITE owner fallback
        try {
          const objectFile =
            await objectStorageService.getObjectEntityFile(objectPath);
          const aclAllowed = await canAccessObject({
            userId,
            objectFile,
            requestedPermission: ObjectPermission.WRITE,
          });
          if (!aclAllowed) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        } catch {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      // Delete from GCS
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);
      await objectFile.delete();

      // Remove session_media DB row (both path forms attempted)
      const storagePath = storagePathFromObjectPath(objectPath);
      const deletedRows = await db
        .delete(sessionMediaTable)
        .where(eq(sessionMediaTable.storagePath, storagePath))
        .returning();
      if (deletedRows.length === 0) {
        await db
          .delete(sessionMediaTable)
          .where(eq(sessionMediaTable.storagePath, objectPath))
          .returning();
      }

      req.log.info({ objectPath, userId }, "Storage object deleted");
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found for deletion");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error deleting object");
      res.status(500).json({ error: "Failed to delete object" });
    }
  },
);

export default router;
