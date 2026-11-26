import { describe, expect, it } from "vitest";
import {
  appointmentsTable, availabilitySlotsTable, clinicMembersTable,
  clientsTable, db, patientInvitesTable, userRolesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { body, expectJson, useClinicApp } from "./clinicHarness";
import { ids, users } from "./fixtures";
import { clerkEmails, sentInvitations } from "./providers";

describe("clinic journeys", () => {
  const request = useClinicApp();
  const dataPath = (table: string, id?: string) => `/api/clinic/data/${table}${id ? `/${id}` : ""}`;
  const portal = "/api/clinic/portal";
  const bookings = "/api/clinic/bookings";
  const session = "/api/clinic/me";
  const invitations = "/api/clinic/invitations";

  it.each([
    ["clients", ids.clientA, ids.clientB, { name: "Updated client" }],
    ["appointments", ids.appointmentA, ids.appointmentB, { observations: "Updated visit notes" }],
    ["session_exercises", ids.exerciseA, ids.exerciseB, { name: "Updated exercise" }],
    ["session_media", ids.mediaA, ids.mediaB, { caption: "Updated caption" }],
    ["patient_packages", ids.packageA, ids.packageB, { name: "Updated package" }],
    ["session_plans", ids.planA, ids.planB, { title: "Updated plan" }],
  ] as const)("%s stays scoped to the managing admin and the linked patient", async (table, foreignId, localId, edit) => {
    expect(await expectJson(await request(session, users.adminB))).toMatchObject({ role: "admin" });
    const list = await expectJson<{ id: string }[]>(await request(dataPath(table), users.adminB));
    expect(list.map(({ id }) => id)).toEqual([localId]);
    expect(await expectJson(await request(`${dataPath(table)}?filters=id:eq:${foreignId}`, users.adminB))).toEqual([]);

    expect((await request(dataPath(table), users.patientB)).status).toBe(403);
    expect((await request(dataPath(table), users.patientB, body("POST", edit))).status).toBe(403);
    expect((await request(dataPath(table, localId), users.patientB, body("DELETE"))).status).toBe(403);
    expect((await request(dataPath(table, foreignId), users.adminB, body("PATCH", edit))).status).toBe(404);
    expect(await expectJson(await request(dataPath(table, localId), users.adminB, body("PATCH", edit)))).toMatchObject(edit);
  });

  it("shows patients only their own care and preserves the fields their portal reads", async () => {
    const care = await expectJson(await request(portal, users.patientA));
    expect(care).toMatchObject({ role: "patient", clinicId: ids.clinicA, client: { id: ids.clientA } });
    expect(care.clients).toMatchObject([{ id: ids.clientA }]);
    expect(care.appointments).toMatchObject([{ id: ids.appointmentA, appointment_date: "2030-01-10", appointment_time: "09:00:00" }]);
    expect(care.exercises).toMatchObject([{ id: ids.exerciseA, completed_at: null }]);
    expect(care.packages).toMatchObject([{ id: ids.packageA, client_id: ids.clientA, total_sessions: expect.any(Number) }]);
    expect(care.plans).toMatchObject([{ id: ids.planA, appointment_id: ids.appointmentA, week_start: "2030-01-07" }]);
    expect(care.availableSlots).toMatchObject([{ id: ids.slotA, slot_date: "2030-01-12", start_time: "09:00:00" }]);

    const detail = `${portal}/appointments/${ids.appointmentA}`;
    expect((await request(detail, users.patientPeer)).status).toBe(404);
    expect((await request(detail, users.adminB)).status).toBe(404);
    expect(await expectJson(await request(detail, users.patientA))).toMatchObject({
      appointment: { id: ids.appointmentA, appointment_date: "2030-01-10", pain_scale: null },
      exercises: [{ id: ids.exerciseA, appointment_id: ids.appointmentA }],
      plans: [{ id: ids.planA }],
    });
  });

  it("permits a patient's own session feedback and exercise progress, not changes to the care plan", async () => {
    for (const [table, id, change] of [
      ["clients", ids.clientA, { name: "Not editable" }],
      ["session_media", ids.mediaA, { caption: "Not editable" }],
      ["patient_packages", ids.packageA, { total_sessions: 99 }],
      ["session_plans", ids.planA, { title: "Not editable" }],
    ] as const) {
      expect((await request(dataPath(table, id), users.patientA, body("PATCH", change))).status).toBe(403);
    }
    const exercise = dataPath("session_exercises", ids.exerciseA);
    const completedAt = "2030-01-10T12:00:00.000Z";
    expect((await request(exercise, users.patientPeer, body("PATCH", { completedAt }))).status).toBe(403);
    expect((await request(exercise, users.patientA, body("PATCH", { completedAt: "invalid" }))).status).toBe(400);
    expect(await expectJson(await request(exercise, users.patientA, body("PATCH", {
      completedAt, performance: "good", sets: 99, appointment_id: ids.appointmentPeer,
    })))).toMatchObject({
      completed_at: completedAt, performance: "good", sets: 3, appointment_id: ids.appointmentA,
    });

    const appointment = dataPath("appointments", ids.appointmentA);
    expect((await request(appointment, users.patientPeer, body("PATCH", { painScale: 5 }))).status).toBe(404);
    expect(await expectJson(await request(appointment, users.patientA, body("PATCH", {
      painScale: 5, patientNotes: "Fixture note", client_id: ids.clientPeer, appointment_date: "2035-01-01",
    })))).toMatchObject({ pain_scale: 5, patient_notes: "Fixture note", client_id: ids.clientA, appointment_date: "2030-01-10" });
    expect(await expectJson(await request(`${portal}/appointments/${ids.appointmentA}`, users.patientA))).toMatchObject({
      appointment: { pain_scale: 5, patient_notes: "Fixture note" },
      exercises: [{ completed_at: completedAt, performance: "good" }],
    });
    expect(await expectJson(await request(exercise, users.patientA, body("PATCH", { completedAt: null })))).toMatchObject({
      completed_at: null,
    });
  });

  it("links a patient invitation only to the intended client and consumes it once", async () => {
    const invite = body("POST", { clientId: ids.clientUnassigned, email: "Invitee@EXAMPLE.test" });
    expect((await request(invitations, users.patientA, invite)).status).toBe(403);
    expect((await request(invitations, users.adminB, invite)).status).toBe(404);
    expect(await expectJson(await request(invitations, users.ownerA, invite), 201)).toEqual({ ok: true });
    expect(sentInvitations).toEqual([expect.objectContaining({
      email_address: "invitee@example.test",
      public_metadata: { clinicClientId: ids.clientUnassigned, role: "patient" },
    })]);
    clerkEmails.set(users.unrelated, { primary: "unrelated@example.test", secondary: "invitee@example.test" });
    expect(await expectJson(await request(session, users.unrelated))).toMatchObject({ role: null });
    const [before] = await db.select().from(clientsTable).where(eq(clientsTable.id, ids.clientUnassigned));
    expect(before.authUserId).toBeNull();

    clerkEmails.set(users.invited, { primary: "invitee@example.test" });
    const signIn = () => request(session, users.invited).then((response) => expectJson(response));
    expect(await Promise.all([signIn(), signIn()])).toEqual([
      { userId: users.invited, role: "patient" }, { userId: users.invited, role: "patient" },
    ]);
    const care = await expectJson(await request(portal, users.invited));
    expect(care).toMatchObject({ clinicId: ids.clinicA, role: "patient", clients: [{ id: ids.clientUnassigned }] });
    const [linked] = await db.select().from(clientsTable).where(eq(clientsTable.id, ids.clientUnassigned));
    const [inviteRow] = await db.select().from(patientInvitesTable).where(eq(patientInvitesTable.clientId, ids.clientUnassigned));
    expect(linked.authUserId).toBe(users.invited);
    expect(inviteRow.consumedAt).toBeInstanceOf(Date);
    expect(await db.select().from(clinicMembersTable).where(eq(clinicMembersTable.userId, users.invited))).toMatchObject([
      { clinicId: ids.clinicA, role: "patient", status: "active" },
    ]);
    expect(await db.select().from(userRolesTable).where(eq(userRolesTable.userId, users.invited))).toHaveLength(1);
    clerkEmails.set(users.unrelated, { primary: "invitee@example.test" });
    expect(await expectJson(await request(session, users.unrelated))).toMatchObject({ role: null });
    expect((await request(invitations, users.ownerA, invite)).status).toBe(409);
  });

  it("reserves an offered slot once and lets only the managing admin approve the request", async () => {
    const book = (user: string, slotId: string) => request(bookings, user, body("POST", { slotId }));
    expect((await book(users.ownerA, ids.slotA)).status).toBe(403);
    expect((await book(users.patientA, ids.slotB)).status).toBe(409);
    expect((await request(dataPath("appointments"), users.patientA, body("POST", { status: "solicitado" }))).status).toBe(403);
    expect((await request(dataPath("availability_slots", ids.slotA), users.patientA, body("PATCH", { status: "reservado" }))).status).toBe(403);

    const contenders = [
      { user: users.patientA, client: ids.clientA },
      { user: users.patientPeer, client: ids.clientPeer },
    ];
    const results = await Promise.all(contenders.map(async (actor) => ({ ...actor, response: await book(actor.user, ids.slotA) })));
    expect(results.map(({ response }) => response.status).sort()).toEqual([201, 409]);
    const winner = results.find(({ response }) => response.status === 201)!;
    const loser = results.find(({ response }) => response.status === 409)!;
    const { appointment, slot } = await expectJson<{ appointment: { id: string }; slot: unknown }>(winner.response, 201);
    expect(appointment).toMatchObject({ status: "solicitado", user_id: users.ownerA, client_id: winner.client });
    expect(slot).toMatchObject({ id: ids.slotA, status: "reservado", appointment_id: appointment.id });
    expect(await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.userId, users.ownerA), eq(appointmentsTable.appointmentDate, "2030-01-12"),
    ))).toMatchObject([{ id: appointment.id, status: "solicitado" }]);

    const approval = body("PATCH", { status: "confirmado" });
    const apptPath = dataPath("appointments", appointment.id);
    const checkIn = body("PATCH", { status: "em_andamento" });
    expect((await request(apptPath, winner.user, approval)).status).toBe(403);
    expect((await request(apptPath, winner.user, checkIn)).status).toBe(409);
    expect((await request(apptPath, loser.user, approval)).status).toBe(404);
    expect((await request(apptPath, users.adminB, approval)).status).toBe(404);
    const pending = `${dataPath("appointments")}?filters=status:eq:solicitado`;
    expect(await expectJson(await request(pending, users.ownerA))).toMatchObject([{ id: appointment.id }]);
    expect(await expectJson(await request(apptPath, users.ownerA, approval))).toMatchObject({ id: appointment.id, status: "confirmado" });
    expect(await expectJson(await request(pending, users.ownerA))).toEqual([]);
    const winningPortal = await expectJson(await request(portal, winner.user));
    expect(winningPortal.appointments).toContainEqual(expect.objectContaining({ id: appointment.id, status: "confirmado" }));
    expect(winningPortal.availableSlots).toEqual([]);
    const [reserved] = await db.select().from(availabilitySlotsTable).where(eq(availabilitySlotsTable.id, ids.slotA));
    expect(reserved).toMatchObject({ status: "reservado", appointmentId: appointment.id });
    expect(await expectJson(await request(apptPath, winner.user, checkIn))).toMatchObject({ status: "em_andamento" });
  });
});
