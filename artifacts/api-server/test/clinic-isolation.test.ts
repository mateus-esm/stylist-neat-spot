import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { db, clinicActionsTable, whatsappOutboxTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { ids, users } from "./fixtures";
import { useClinicApp } from "./clinicHarness";

async function json(response: Response) {
  return response.json() as Promise<any>;
}

describe("authenticated clinic isolation", () => {
  const request = useClinicApp();

  it("rejects anonymous protected requests while keeping health public", async () => {
    expect((await request("/api/healthz")).status).toBe(200);
    expect((await request("/api/clinic/me")).status).toBe(401);
    expect((await request("/api/clinic/portal")).status).toBe(401);
  });

  it("requires a configured scheduler credential before processing WhatsApp", async () => {
    const oldToken = process.env.WHATSMIAU_JOB_TOKEN;
    const oldEnabled = process.env.WHATSMIAU_ASYNC_ENABLED;
    try {
      delete process.env.WHATSMIAU_JOB_TOKEN;
      expect((await request("/api/jobs/whatsapp", undefined, { method: "POST" })).status).toBe(404);
      process.env.WHATSMIAU_JOB_TOKEN = "local-scheduler-only";
      process.env.WHATSMIAU_ASYNC_ENABLED = "false";
      expect((await request("/api/jobs/whatsapp", undefined, { method: "POST" })).status).toBe(401);
      const response = await request("/api/jobs/whatsapp", undefined, { method: "POST",
        headers: { authorization: "Bearer local-scheduler-only" } });
      expect(await json(response)).toMatchObject({ enabled: false, processed: 0 });
    } finally {
      if (oldToken === undefined) delete process.env.WHATSMIAU_JOB_TOKEN; else process.env.WHATSMIAU_JOB_TOKEN = oldToken;
      if (oldEnabled === undefined) delete process.env.WHATSMIAU_ASYNC_ENABLED; else process.env.WHATSMIAU_ASYNC_ENABLED = oldEnabled;
    }
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
    expect(portal.appointments[0]).not.toHaveProperty("price");
    expect(portal.packages[0]).not.toHaveProperty("paymentStatus");
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
    const consent = await json(await request("/api/clinic/whatsapp/consent", users.patientA));
    expect(consent.optedIn).toBe(true);
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

  it("makes patient presence confirmation idempotent", async () => {
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
    await request("/api/clinic/whatsapp/config", users.ownerA, {
      method: "PATCH", body: JSON.stringify({ enabled: true, managerPhone: "+55 85 99999-0000" }),
    });
    const booking = await Promise.all([
      request("/api/clinic/bookings", users.patientA, { method: "POST", body: JSON.stringify({ slotId: ids.slotA }) }),
      request("/api/clinic/bookings", users.patientA, { method: "POST", body: JSON.stringify({ slotId: ids.slotA }) }),
    ]);
    expect(booking.map((response) => response.status).sort()).toEqual([201, 409]);
    const { appointment } = await json(booking.find((response) => response.status === 201)!);
    expect(appointment.duration_min).toBe(30);
    const link = `/api/clinic/booking-requests?id=${appointment.id}`;
    const review = `/api/clinic/booking-requests/${appointment.id}`;
    expect((await json(await request(link, users.ownerB)))).toEqual([]);
    expect((await request(link, users.patientA)).status).toBe(403);
    expect((await json(await request(link, users.ownerA)))[0].status).toBe("solicitado");
    const alerts = await db.select().from(whatsappOutboxTable).where(eq(whatsappOutboxTable.eventType, "booking_request"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].fallbackText).toContain(`/?solicitacao=${appointment.id}`);
    expect(alerts[0].phone).toBe("5585999990000");
    const early = await request(`/api/clinic/portal/appointments/${appointment.id}/actions`, users.patientA, {
      method: "POST", body: JSON.stringify({ ...actionBody, idempotencyKey: "too-early" }),
    });
    expect(early.status).toBe(409);
    const accept = { method: "POST", body: JSON.stringify({ decision: "approve" }) };
    expect((await request(review, users.ownerB, accept)).status).toBe(409);
    expect((await Promise.all([request(review, users.ownerA, accept), request(review, users.ownerA, accept)]))
      .map((r) => r.status).sort()).toEqual([200, 409]);
    const messages = await db.select().from(whatsappOutboxTable).where(eq(whatsappOutboxTable.clientId, ids.clientA));
    expect(messages.filter((row) => row.fallbackText.includes(`/meu-app/agenda/${appointment.id}`))).toHaveLength(1);
    expect((await request(`/api/clinic/portal/appointments/${appointment.id}/actions`, users.patientA, {
      method: "POST", body: JSON.stringify({ ...actionBody, idempotencyKey: "after-approval" }),
    })).status).toBe(200);
  });

  it("delivers a manager alert and approved visit link through the outbox and records delivery", async () => {
    const { availabilitySlotsTable } = await import("@workspace/db");
    const [slot] = await db.insert(availabilitySlotsTable).values({
      userId: users.ownerA, slotDate: "2030-02-02", startTime: "09:00", endTime: "10:00",
    }).returning();
    const messages: Array<{ number: string; text: string }> = [];
    const provider = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      messages.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ key: { id: "local-delivery-" + messages.length } }));
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => provider.once("listening", resolve));
    const original = { url: process.env.WHATSMIAU_BASE_URL, token: process.env.WHATSMIAU_API_TOKEN,
      instance: process.env.WHATSMIAU_INSTANCE_NAME };
    process.env.WHATSMIAU_BASE_URL = `http://127.0.0.1:${(provider.address() as {port:number}).port}`;
    process.env.WHATSMIAU_API_TOKEN = "test";
    process.env.WHATSMIAU_INSTANCE_NAME = "local-test";
    const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
    try {
      await request("/api/clinic/whatsapp/config", users.ownerA, {
        method: "PATCH", body: JSON.stringify({ enabled: true, managerPhone: "5585999990000" }),
      });
      const booking = await json(await request("/api/clinic/bookings", users.patientA, post({ slotId: slot.id })));
      const id = booking.appointment.id;
      async function deliver(key: string) {
        const [row] = await db.select().from(whatsappOutboxTable).where(eq(whatsappOutboxTable.idempotencyKey, key));
        const sent = await json(await request(`/api/clinic/whatsapp/outbox/${row.id}/process`, users.ownerA, post({})));
        expect(sent.status).toBe("sent");
        const receipt = await request("/api/webhooks/whatsmiau", undefined, post({
          event: "messages.update", data: { messageId: sent.providerMessageId, status: "DELIVERY_ACK" },
        }));
        expect(receipt.status).toBe(200);
        const [delivered] = await db.select().from(whatsappOutboxTable).where(eq(whatsappOutboxTable.id, row.id));
        expect(delivered.status).toBe("delivered");
      }
      await deliver(`booking_request:${id}`);
      expect(messages[0]).toMatchObject({ number: "5585999990000", text: expect.stringContaining(`/?solicitacao=${id}`) });
      await request(`/api/clinic/booking-requests/${id}`, users.ownerA, post({ decision: "approve" }));
      await deliver(`appointment_confirmation:${id}:booking-approved`);
      expect(messages[1].text).toContain(`/meu-app/agenda/${id}`);
      expect(messages[1].number).not.toBe(messages[0].number);
    } finally {
      provider.close();
      for (const [key, value] of Object.entries({ WHATSMIAU_BASE_URL: original.url,
        WHATSMIAU_API_TOKEN: original.token, WHATSMIAU_INSTANCE_NAME: original.instance })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      await db.delete(availabilitySlotsTable).where(eq(availabilitySlotsTable.id, slot.id));
    }
  });

  it("restores a reserved patient slot on decline and links to the available times", async () => {
    const { availabilitySlotsTable } = await import("@workspace/db");
    const [slot] = await db.insert(availabilitySlotsTable).values({
      userId: users.ownerA, slotDate: "2030-03-02", startTime: "10:00", endTime: "11:00",
      status: "reservado", reservedForClientId: ids.clientA,
    }).returning();
    const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
    try {
      await request("/api/clinic/whatsapp/config", users.ownerA, {
        method: "PATCH", body: JSON.stringify({ enabled: true, managerPhone: "5585999990000" }),
      });
      const portal = await json(await request("/api/clinic/portal", users.patientA));
      expect(portal.availableSlots.map((r: {id:string}) => r.id)).toContain(slot.id);
      expect((await request("/api/clinic/bookings", users.patientB, post({ slotId: slot.id }))).status).toBe(409);
      const booking = await json(await request("/api/clinic/bookings", users.patientA, post({ slotId: slot.id })));
      const id = booking.appointment.id;
      expect((await request(`/api/clinic/booking-requests/${id}`, users.ownerA, post({ decision: "decline" }))).status).toBe(200);
      const [released] = await db.select().from(availabilitySlotsTable).where(eq(availabilitySlotsTable.id, slot.id));
      expect(released).toMatchObject({ status: "reservado", appointmentId: null, reservedForClientId: ids.clientA });
      const [message] = await db.select().from(whatsappOutboxTable).where(eq(whatsappOutboxTable.idempotencyKey, `booking_declined:${id}`));
      expect(message.fallbackText).toContain("/meu-app?agendar=1");
    } finally {
      await db.delete(availabilitySlotsTable).where(eq(availabilitySlotsTable.id, slot.id));
    }
  });

  it("preserves imported sessions and consumes the last two credits exactly once", async () => {
    const { appointmentsTable, patientPackagesTable } = await import("@workspace/db");
    const [pkg] = await db.insert(patientPackagesTable).values({
      userId: users.ownerA, clientId: ids.clientA, name: "Plano de teste", totalSessions: 6, completedSessions: 4,
    }).returning();
    const visit = {
      userId: users.ownerA, clinicId: ids.clinicA, clientId: ids.clientA, clientName: "Paciente de teste",
      appointmentDate: "2030-01-10", appointmentTime: "11:00", service: "Fisioterapia", packageId: pkg.id,
    };
    const [first, second, excess] = await db.insert(appointmentsTable).values([visit, visit, visit]).returning();
    const complete = (id: string, actor: string) => request(`/api/clinic/data/appointments/${id}`, actor, {
      method: "PATCH", body: JSON.stringify({ status: "atendido", pain_scale: 3, evolution_notes: "Teste" }),
    });
    try {
      expect((await complete(first.id, users.ownerB)).status).toBe(404);
      expect((await complete(first.id, users.physioB)).status).toBe(404);
      const attempts = await Promise.all([complete(first.id, users.physioA), complete(first.id, users.ownerA)]);
      expect(attempts.map((r) => r.status)).toEqual([200, 200]);
      let [current] = await db.select().from(patientPackagesTable).where(eq(patientPackagesTable.id, pkg.id));
      expect(current).toMatchObject({ completedSessions: 5, status: "ativo" });
      expect((await complete(second.id, users.ownerA)).status).toBe(200);
      expect((await complete(excess.id, users.ownerA)).status).toBe(409);
      [current] = await db.select().from(patientPackagesTable).where(eq(patientPackagesTable.id, pkg.id));
      expect(current).toMatchObject({ completedSessions: 6, status: "concluido" });
      expect(current.finishedAt).toBeTruthy();
      const reread = await json(await request("/api/clinic/portal", users.patientA));
      expect(reread.appointments.find((row: {id:string}) => row.id === first.id)).toMatchObject({
        status: "atendido", package_session_index: 5, pain_scale: 3, evolution_notes: "Teste",
      });
      expect(reread.appointments.find((row: {id:string}) => row.id === excess.id).status).toBe("agendado");
    } finally {
      for (const row of [first, second, excess]) await db.delete(appointmentsTable).where(eq(appointmentsTable.id, row.id));
      await db.delete(patientPackagesTable).where(eq(patientPackagesTable.id, pkg.id));
    }
  });

  it("keeps an unpaid standalone session pending when the clinical visit is completed", async () => {
    const { appointmentsTable } = await import("@workspace/db");
    const [visit] = await db.insert(appointmentsTable).values({
      userId: users.ownerA, clinicId: ids.clinicA, clientId: ids.clientA, clientName: "Paciente de teste",
      appointmentDate: "2030-01-10", appointmentTime: "12:00", service: "Fisioterapia", price: "221.00", paymentStatus: "pendente",
    }).returning();
    try {
      const response = await request(`/api/clinic/data/appointments/${visit.id}`, users.ownerA, {
        method: "PATCH", body: JSON.stringify({ status: "atendido", payment_status: "pendente" }),
      });
      expect(await json(response)).toMatchObject({ status: "atendido", price: "221.00", payment_status: "pendente" });
    } finally { await db.delete(appointmentsTable).where(eq(appointmentsTable.id, visit.id)); }
  });

  it("queues a confirmed visit reminder once at 24 hours and suppresses it after cancellation", async () => {
    const { appointmentsTable } = await import("@workspace/db");
    const { enqueueDueWhatsappReminders, processWhatsappMessage } = await import("../src/lib/whatsapp");
    await request("/api/clinic/whatsapp/config", users.ownerA, { method: "PATCH",
      body: JSON.stringify({ enabled: true, reminderHours: [24], timezone: "America/Fortaleza" }) });
    const [visit] = await db.insert(appointmentsTable).values({
      userId: users.ownerA, clinicId: ids.clinicA, clientId: ids.clientA, clientName: "Paciente de teste",
      appointmentDate: "2031-06-03", appointmentTime: "10:00", status: "confirmado", service: "Sessão",
    }).returning();
    try {
      const due = new Date("2031-06-02T13:00:00Z");
      await enqueueDueWhatsappReminders(new Date(due.getTime() - 60000));
      const rows = () => db.select().from(whatsappOutboxTable).where(and(
        eq(whatsappOutboxTable.eventType, "appointment_reminder"), eq(whatsappOutboxTable.clientId, ids.clientA)));
      expect(await rows()).toHaveLength(0);
      await enqueueDueWhatsappReminders(due);
      await enqueueDueWhatsappReminders(due);
      const reminders = await rows();
      expect(reminders).toHaveLength(1);
      expect(reminders[0].fallbackText).toContain(`/meu-app/agenda/${visit.id}`);
      await db.update(appointmentsTable).set({ status: "cancelado" }).where(eq(appointmentsTable.id, visit.id));
      expect((await processWhatsappMessage(reminders[0].id, ids.clinicA))?.status).toBe("cancelled");
    } finally { await db.delete(appointmentsTable).where(eq(appointmentsTable.id, visit.id)); }
  });

  it("isolates WhatsApp consent and outbox, supports retry/fallback, and respects opt-out", async () => {
    expect((await request(`/api/clinic/whatsapp/consent?clientId=${ids.clientB}`, users.ownerA)).status).toBe(404);
    expect((await request("/api/clinic/whatsapp/outbox", users.ownerA)).status).toBe(200);
    await request("/api/clinic/whatsapp/config", users.ownerA, {
      method: "PATCH", body: JSON.stringify({ enabled: true, managerPhone: "5585999990000" }),
    });

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
        idempotencyKey: "reminder-a-2030", payload: { appointmentId: ids.appointmentA },
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
