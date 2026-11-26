import { describe, expect, it } from "vitest";
import { db, pendingUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { body, expectJson, useClinicApp } from "./clinicHarness";
import { ids, users } from "./fixtures";
import { setTestObjectAcl } from "./providers";

describe("private session media", () => {
  const request = useClinicApp();
  const mediaRequest = "/api/storage/uploads/request-url";
  const attachment = (id: string) => `/api/clinic/appointments/${id}/media`;
  const list = (id: string) => `/api/clinic/portal/appointments/${id}/media`;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDyQAAAAASUVORK5CYII=", "base64");
  const metadata = { name: "fixture.png", size: bytes.length, contentType: "image/png" };

  async function prepare(user: string) {
    return expectJson<{ uploadURL: string; objectPath: string; storagePath: string }>(
      await request(mediaRequest, user, body("POST", metadata)),
    );
  }

  async function put(url: string, contentType = metadata.contentType) {
    const result = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
    expect(result.status).toBe(200);
  }

  it("uploads a staff file, shares it only with the care team and linked patient, then deletes its object and record", async () => {
    expect((await request(mediaRequest, undefined, body("POST", metadata))).status).toBe(401);
    expect((await request(mediaRequest, users.unrelated, body("POST", metadata))).status).toBe(403);
    const upload = await prepare(users.ownerA);
    expect(upload.storagePath).toBe(upload.objectPath.slice(1));
    await put(upload.uploadURL);
    const url = `/api/storage${upload.objectPath}`;
    const finalize = body("POST", { objectPath: upload.objectPath, mediaType: "image", caption: "Test image" });
    expect((await request(url, users.patientA)).status).toBe(403);
    expect((await request(attachment(ids.appointmentA), users.patientA, finalize)).status).toBe(403);
    expect((await request(attachment(ids.appointmentB), users.ownerA, finalize)).status).toBe(404);
    expect((await request("/api/clinic/data/session_media", users.ownerA, finalize)).status).toBe(403);
    const record = await expectJson<{ id: string }>(await request(attachment(ids.appointmentA), users.ownerA, finalize), 201);
    expect(record).toMatchObject({ appointment_id: ids.appointmentA, storage_path: upload.storagePath, uploaded_by: users.ownerA, caption: "Test image" });
    expect(await expectJson(await request(attachment(ids.appointmentA), users.ownerA, finalize))).toEqual(record);
    expect(await expectJson(await request(list(ids.appointmentA), users.patientA))).toContainEqual(record);
    for (const user of [users.ownerA, users.patientA, users.physioA]) {
      const download = await request(url, user);
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toBe("image/png");
      expect(download.headers.get("cache-control")).toContain("no-store");
      expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    }
    expect((await request(url)).status).toBe(401);

    // Finalized clinical media stays private even if provider metadata disagrees.
    setTestObjectAcl(upload.uploadURL, users.ownerA, "public");
    for (const user of [users.patientPeer, users.patientB, users.adminB]) {
      expect((await request(list(ids.appointmentA), user)).status).toBe(404);
      expect((await request(url, user)).status).toBe(403);
      expect((await request(url, user, body("DELETE"))).status).toBe(403);
    }
    expect((await request(url, users.patientA, body("DELETE"))).status).toBe(403);
    expect((await request(`/api/clinic/data/session_media/${record.id}`, users.ownerA, body("DELETE"))).status).toBe(403);
    expect((await request(url, users.ownerA, body("DELETE"))).status).toBe(204);
    expect((await request(url, users.ownerA)).status).toBe(403);
    expect((await request(url, users.patientA)).status).toBe(403);
    expect(await expectJson(await request(list(ids.appointmentA), users.patientA))).not.toContainEqual(record);
  });

  it("lets the linked patient upload and remove their own media without changing its ownership", async () => {
    const upload = await prepare(users.patientA);
    await put(upload.uploadURL);
    const data = body("POST", { objectPath: upload.objectPath, uploadedBy: users.ownerA });
    expect((await request(attachment(ids.appointmentPeer), users.patientA, data)).status).toBe(403);
    const record = await expectJson(await request(attachment(ids.appointmentA), users.patientA, data), 201);
    expect(record).toMatchObject({ uploaded_by: users.patientA, appointment_id: ids.appointmentA });
    const url = `/api/storage${upload.objectPath}`;
    expect((await request(url, users.ownerA)).status).toBe(200);
    expect((await request(url, users.patientA, body("DELETE"))).status).toBe(204);
    expect(await expectJson(await request(list(ids.appointmentA), users.patientA))).not.toContainEqual(record);
    expect((await request(attachment(ids.appointmentA), users.patientA, data)).status).toBe(409);
  });

  it("rejects files whose stored media type differs from the allowed types and rejects expired uploads", async () => {
    expect((await request(mediaRequest, users.patientA, body("POST", { ...metadata, contentType: "text/plain" }))).status).toBe(415);
    expect((await request(mediaRequest, users.patientA, body("POST", { ...metadata, size: 51 * 1024 * 1024 }))).status).toBe(413);
    const upload = await prepare(users.patientA);
    const data = body("POST", { objectPath: upload.objectPath });
    expect((await request(attachment(ids.appointmentA), users.patientA, data)).status).toBe(404);
    await put(upload.uploadURL, "text/plain");
    expect((await request(attachment(ids.appointmentA), users.ownerA, data)).status).toBe(403);
    expect((await request(attachment(ids.appointmentA), users.patientA, data)).status).toBe(415);
    expect((await request(attachment(ids.appointmentA), users.patientA, data)).status).toBe(404);

    const expired = await prepare(users.patientA);
    await put(expired.uploadURL);
    await db.update(pendingUploadsTable).set({ expiresAt: new Date(0) })
      .where(eq(pendingUploadsTable.storagePath, expired.storagePath));
    expect((await request(attachment(ids.appointmentA), users.patientA, body("POST", { objectPath: expired.objectPath }))).status).toBe(410);
    const after = await expectJson(await request(list(ids.appointmentA), users.patientA));
    expect(after).toMatchObject([{ id: ids.mediaA }]);
  });
});
