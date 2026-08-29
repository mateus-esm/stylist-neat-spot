import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { db, pool, clinicActionsTable, whatsappOutboxTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { cleanClinicFixtures, ids, seedClinicFixtures, users } from "./fixtures";

const integration = Boolean(process.env.CLINIC_TEST_DATABASE_URL);
const suite = describe.skipIf(!integration);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const originalWhatsmiauUrl = process.env.WHATSMIAU_BASE_URL;

async function request(path: string, userId?: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-user-id": userId } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function json(response: Response) {
  return response.json() as Promise<any>;
}

suite("authenticated clinic isolation", () => {
  beforeAll(async () => {
    delete process.env.WHATSMIAU_BASE_URL;
    await cleanClinicFixtures();
    await seedClinicFixtures();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterAll(async () => {
    server?.close();
    if (originalWhatsmiauUrl) process.env.WHATSMIAU_BASE_URL = originalWhatsmiauUrl;
    await cleanClinicFixtures();
    await pool.end();
  });

  it("rejects anonymous protected requests while keeping health public", async () => {
    expect((await request("/api/healthz")).status).toBe(200);
    expect((await request("/api/clinic/me")).status).toBe(401);
    expect((await request("/api/clinic/portal")).status).toBe(401);
  });

  it("keeps owners in separate clinics across generic reads and mutations", async () => {
    const clients = await json(await request("/api/clinic/data/clients", users.ownerA));
    expect(clients.map((row: any) => row.id)).toEqual(expect.arrayContaining([ids.clientA, ids.clientUnassigned]));
    expect(clients.map((row: any) => row.id)).not.toContain(ids.clientB);

    const media = await json(await request("/api/clinic/data/session_media", users.ownerA));
    expect(media).toHaveLength(1);
    expect(media[0].id).toBe(ids.mediaA);

    const filtered = await json(await request(`/api/clinic/data/clients?filters=id:eq:${ids.clientB}`, users.ownerA));
    expect(filtered).toEqual([]);

    const patch = await request(`/api/clinic/data/clients/${ids.clientA}`, users.ownerA, {
      method: "PATCH",
      body: JSON.stringify({ name: "tampered", user_id: users.ownerB, clinic_id: ids.clinicB }),
    });
    expect(patch.status).toBe(403);
    expect((await request(`/api/clinic/data/clients/${ids.clientB}`, users.ownerA, {
      method: "PATCH", body: JSON.stringify({ name: "tampered" }),
    })).status).toBe(404);
    expect((await request(`/api/clinic/data/clients/${ids.clientB}`, users.ownerA, { method: "DELETE" })).status).toBe(404);
    expect((await request(`/api/clinic/data/session_media/${ids.mediaB}`, users.ownerA, {
      method: "PATCH", body: JSON.stringify({ caption: "cross-tenant" }),
    })).status).toBe(404);
    expect((await request("/api/clinic/data/user_roles", users.ownerA, {
      method: "POST", body: JSON.stringify({ user_id: users.ownerB, role: "owner" }),
    })).status).toBe(403);
  });

  it("shows a physiotherapist only assigned patients and blocks unassigned or foreign records", async () => {
    const portal = await json(await request("/api/clinic/portal", users.physioA));
    expect(portal.clients.map((row: any) => row.id)).toEqual([ids.clientA]);
    expect(portal.appointments.map((row: any) => row.id)).toEqual([ids.appointmentA]);

    const detail = await request(`/api/clinic/portal/appointments/${ids.appointmentB}`, users.physioA);
    expect(detail.status).toBe(404);
    expect((await request("/api/clinic/whatsapp/consent?clientId=" + ids.clientB, users.ownerA)).status).toBe(404);
    expect((await request(`/api/storage/objects/uploads/isolation-b.jpg`, users.physioA)).status).toBe(403);
  });

  it("does not expose team records from another clinic", async () => {
    const members = await json(await request("/api/clinic/members", users.ownerA));
    expect(members.map((row: any) => row.userId)).toEqual(expect.arrayContaining([users.ownerA, users.physioA]));
    expect(members.map((row: any) => row.userId)).not.toContain(users.ownerB);
    expect(members.map((row: any) => row.userId)).not.toContain(users.physioB);
    const assignments = await json(await request("/api/clinic/assignments", users.ownerA));
    expect(assignments).toHaveLength(1);
    expect(assignments[0].clientId).toBe(ids.clientA);
  });

  it("keeps patient data private, including patients without a responsible physiotherapist", async () => {
    const portal = await json(await request("/api/clinic/portal", users.patientA));
    expect(portal.clients.map((row: any) => row.id)).toEqual([ids.clientA]);
    expect(portal.appointments.map((row: any) => row.id)).toEqual([ids.appointmentA]);
    expect(portal.clients.map((row: any) => row.id)).not.toContain(ids.clientUnassigned);

    expect((await request(`/api/clinic/portal/appointments/${ids.appointmentB}`, users.patientA)).status).toBe(404);
    expect((await request(`/api/clinic/data/appointments/${ids.appointmentB}`, users.patientA, {
      method: "PATCH", body: JSON.stringify({ observations: "cross-tenant" }),
    })).status).toBe(404);
    expect((await request("/api/storage/objects/uploads/isolation-b.jpg", users.patientA)).status).toBe(403);
  });

  it("makes patient actions idempotent and booking reservation atomic under concurrency", async () => {
    const actionBody = { action: "confirm_presence", confirmed: true, idempotencyKey: "presence-a-2030" };
    const first = await request(`/api/clinic/portal/appointments/${ids.appointmentA}/actions`, users.patientA, {
      method: "POST", body: JSON.stringify(actionBody),
    });
    const second = await request(`/api/clinic/portal/appointments/${ids.appointmentA}/actions`, users.patientA, {
      method: "POST", body: JSON.stringify(actionBody),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await json(first)).toEqual(await json(second));
    const [actionCount] = await db.select({ count: count() }).from(clinicActionsTable)
      .where(and(eq(clinicActionsTable.appointmentId, ids.appointmentA), eq(clinicActionsTable.idempotencyKey, actionBody.idempotencyKey)));
    expect(Number(actionCount.count)).toBe(1);

    const booking = await Promise.all([
      request("/api/clinic/bookings", users.patientA, { method: "POST", body: JSON.stringify({ slotId: ids.slotA }) }),
      request("/api/clinic/bookings", users.patientA, { method: "POST", body: JSON.stringify({ slotId: ids.slotA }) }),
    ]);
    expect(booking.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it("isolates WhatsApp consent and outbox, supports retry/fallback, and respects opt-out", async () => {
    expect((await request(`/api/clinic/whatsapp/consent?clientId=${ids.clientB}`, users.ownerA)).status).toBe(404);
    expect((await request("/api/clinic/whatsapp/outbox", users.ownerA)).status).toBe(200);

    const enqueue = await request("/api/clinic/whatsapp/outbox", users.ownerA, {
      method: "POST",
      body: JSON.stringify({
        clientId: ids.clientA, eventType: "appointment_reminder",
        idempotencyKey: "reminder-a-2030", payload: { appointmentId: ids.appointmentA },
        fallbackText: "Lembrete da sua sessão",
      }),
    });
    expect(enqueue.status).toBe(201);
    const row = await json(enqueue);
    const duplicate = await request("/api/clinic/whatsapp/outbox", users.ownerA, {
      method: "POST", body: JSON.stringify({
        clientId: ids.clientA, eventType: "appointment_reminder",
        idempotencyKey: "reminder-a-2030", payload: {}, fallbackText: "retry",
      }),
    });
    expect(duplicate.status).toBe(200);
    expect((await json(duplicate)).id).toBe(row.id);

    const process = await request(`/api/clinic/whatsapp/outbox/${row.id}/process`, users.ownerA, { method: "POST" });
    expect(process.status).toBe(200);
    expect((await json(process)).status).toBe("fallback_required");

    await request("/api/clinic/whatsapp/consent", users.patientA, {
      method: "POST", body: JSON.stringify({ optedIn: false }),
    });
    const optedOut = await request("/api/clinic/whatsapp/outbox", users.ownerA, {
      method: "POST", body: JSON.stringify({
        clientId: ids.clientA, eventType: "appointment_confirmation",
        idempotencyKey: "optout-a-2030", payload: {}, fallbackText: "não deve enviar",
      }),
    });
    expect(optedOut.status).toBe(409);
  });
});