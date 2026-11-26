import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  appointmentsTable,
  availabilitySlotsTable,
  clinicActionsTable,
  clinicAssignmentsTable,
  clinicAuditEventsTable,
  clinicMembersTable,
  patientPackagesTable,
  clientsTable,
  sessionExercisesTable,
  sessionMediaTable,
  sessionPlansTable,
} from "@workspace/db";
import { z } from "zod";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  ensureClinicForUser,
  getClientIdForPatient,
  getStoredRole,
  clinicalFields,
  isAdminRole,
  isStaffRole,
} from "../lib/clinicRole";
import { enqueueAppointmentEvent, enqueueBookingDeclined } from "../lib/whatsapp";
import { rowToSnake } from "../lib/clinicResponse";

const router: IRouter = Router();
router.use(requireClinicAuth);

const ActionBody = z.object({
  action: z.enum(["confirm_presence", "request_reschedule", "request_cancel"]),
  confirmed: z.literal(true),
  idempotencyKey: z.string().min(8).max(160),
  requestedSlotId: z.string().uuid().optional(),
});

async function contextFor(userId: string) {
  const role = await getStoredRole(userId);
  const context = await ensureClinicForUser(userId, role);
  return context ? { ...context, role: (await getStoredRole(userId)) ?? context.role } : null;
}

async function accessibleAppointment(userId: string, appointmentId: string) {
  const context = await contextFor(userId);
  if (!context) return { context: null, appointment: null };
  const [appointment] = await db.select().from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.id, appointmentId),
      or(eq(appointmentsTable.clinicId, context.clinicId), isNull(appointmentsTable.clinicId)),
    )).limit(1);
  if (!appointment) return { context, appointment: null };

  if (context.role === "patient") {
    const clientId = await getClientIdForPatient(userId);
    return { context, appointment: clientId && appointment.clientId === clientId ? appointment : null };
  }
  if (!isStaffRole(context.role)) return { context, appointment: null };
  if (isAdminRole(context.role) && appointment.userId === userId) return { context, appointment };
  if (context.role === "physiotherapist") {
    const [assignment] = appointment.clientId ? await db.select().from(clinicAssignmentsTable).where(and(
      eq(clinicAssignmentsTable.clinicId, context.clinicId),
      eq(clinicAssignmentsTable.clientId, appointment.clientId),
      eq(clinicAssignmentsTable.physiotherapistUserId, userId),
      eq(clinicAssignmentsTable.status, "active"),
    )).limit(1) : [];
    if (appointment.assignedToUserId === userId || assignment) return { context, appointment };
  }
  return { context, appointment: null };
}

router.get("/clinic/portal", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const context = await contextFor(userId);
  if (!context) return res.status(403).json({ error: "No clinic membership" });
  const clientId = context.role === "patient" ? await getClientIdForPatient(userId) : null;
  if (context.role === "patient" && !clientId) return res.status(403).json({ error: "No linked client found" });

  let clientIds: string[] = [];
  if (clientId) clientIds = [clientId];
  else if (context.role === "physiotherapist") {
    const assignments = await db.select({ clientId: clinicAssignmentsTable.clientId })
      .from(clinicAssignmentsTable).where(and(
        eq(clinicAssignmentsTable.clinicId, context.clinicId),
        eq(clinicAssignmentsTable.physiotherapistUserId, userId),
        eq(clinicAssignmentsTable.status, "active"),
      ));
    clientIds = assignments.map((row) => row.clientId);
  }

  const clinicAppointmentScope = or(eq(appointmentsTable.clinicId, context.clinicId), isNull(appointmentsTable.clinicId));
  const appointmentWhere = clientIds.length
    ? and(inArray(appointmentsTable.clientId, clientIds), clinicAppointmentScope)
    : isAdminRole(context.role)
      ? and(eq(appointmentsTable.userId, userId), clinicAppointmentScope)
      : and(eq(appointmentsTable.assignedToUserId, userId), clinicAppointmentScope);
  const appointments = await db.select().from(appointmentsTable).where(appointmentWhere).orderBy(
    asc(appointmentsTable.appointmentDate), asc(appointmentsTable.appointmentTime),
  );
  const ids = appointments.map((row) => row.id);
  const [clients, packages, plans, exercises] = await Promise.all([
    clientIds.length ? db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds)) : db.select().from(clientsTable).where(eq(clientsTable.userId, userId)),
    clientIds.length ? db.select().from(patientPackagesTable).where(inArray(patientPackagesTable.clientId, clientIds)) : db.select().from(patientPackagesTable).where(eq(patientPackagesTable.userId, userId)),
    clientIds.length ? db.select().from(sessionPlansTable).where(inArray(sessionPlansTable.clientId, clientIds)) : db.select().from(sessionPlansTable).where(eq(sessionPlansTable.userId, userId)),
    ids.length ? db.select().from(sessionExercisesTable).where(inArray(sessionExercisesTable.appointmentId, ids)) : Promise.resolve([]),
  ]);
  const slotOwner = clients[0]?.userId ?? appointments[0]?.userId;
  const slots = context.role === "patient" && slotOwner
    ? await db.select().from(availabilitySlotsTable).where(and(
      or(eq(availabilitySlotsTable.status, "aberto"),
        and(eq(availabilitySlotsTable.status, "reservado"), eq(availabilitySlotsTable.reservedForClientId, clientId!))),
      eq(availabilitySlotsTable.userId, slotOwner), isNull(availabilitySlotsTable.appointmentId),
      or(isNull(availabilitySlotsTable.reservedForClientId), eq(availabilitySlotsTable.reservedForClientId, clientId!)),
    )).orderBy(asc(availabilitySlotsTable.slotDate), asc(availabilitySlotsTable.startTime))
    : [];
  const clinicalOnly = context.role === "physiotherapist";
  const clientRows = clients.map((row) => rowToSnake(row, clientsTable));
  return res.json({
    clinicId: context.clinicId,
    role: context.role,
    client: clientRows[0] ?? null,
    clients: clientRows,
    appointments: appointments.map((row) => rowToSnake(clinicalOnly ? clinicalFields(row) : row, appointmentsTable)),
    packages: packages.map((row) => rowToSnake(clinicalOnly ? clinicalFields(row) : row, patientPackagesTable)),
    plans: plans.map((row) => rowToSnake(row, sessionPlansTable)),
    exercises: exercises.map((row) => rowToSnake(row, sessionExercisesTable)),
    availableSlots: slots
      .filter((s) => new Date(`${s.slotDate}T${s.startTime}-03:00`) > new Date())
      .map((row) => rowToSnake(row, availabilitySlotsTable)),
  });
});

router.get("/clinic/portal/appointments/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { context, appointment } = await accessibleAppointment(userId, id);
  if (!context || !appointment) return res.status(404).json({ error: "Agendamento não encontrado" });
  const [exercises, plans] = await Promise.all([
    db.select().from(sessionExercisesTable).where(eq(sessionExercisesTable.appointmentId, id)).orderBy(asc(sessionExercisesTable.orderIndex)),
    appointment.clientId ? db.select().from(sessionPlansTable).where(eq(sessionPlansTable.clientId, appointment.clientId)) : Promise.resolve([]),
  ]);
  await db.insert(clinicAuditEventsTable).values({
    clinicId: context.clinicId, actorUserId: userId, action: "clinical_record.viewed",
    resourceType: "appointment", resourceId: id, metadata: {},
  });
  return res.json({
    appointment: rowToSnake(context.role === "physiotherapist" ? clinicalFields(appointment) : appointment, appointmentsTable),
    exercises: exercises.map((row) => rowToSnake(row, sessionExercisesTable)),
    plans: plans.map((row) => rowToSnake(row, sessionPlansTable)),
  });
});

router.get("/clinic/portal/appointments/:id/media", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { appointment } = await accessibleAppointment(userId, id);
  if (!appointment) return res.status(404).json({ error: "Agendamento não encontrado" });
  const media = await db.select().from(sessionMediaTable)
    .where(eq(sessionMediaTable.appointmentId, appointment.id))
    .orderBy(desc(sessionMediaTable.createdAt));
  return res.json(media.map((row) => rowToSnake(row, sessionMediaTable)));
});

router.post("/clinic/portal/appointments/:id/actions", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = ActionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confirmação explícita e chave de idempotência são obrigatórias" });
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { context, appointment } = await accessibleAppointment(userId, id);
  if (!context || !appointment) return res.status(404).json({ error: "Agendamento não encontrado" });
  if (context.role !== "patient") return res.status(403).json({ error: "Ação disponível apenas ao paciente" });

  const existing = await db.select().from(clinicActionsTable).where(and(
    eq(clinicActionsTable.appointmentId, id),
    eq(clinicActionsTable.idempotencyKey, parsed.data.idempotencyKey),
  )).limit(1);
  if (existing[0]) return res.json(existing[0].result);

  if (new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}-03:00`) <= new Date()) {
    return res.status(409).json({ error: "Este horário já passou. Consulte sua agenda atual." });
  }
  const allowedStatuses = parsed.data.action === "confirm_presence"
    ? ["agendado", "confirmado"]
    : ["agendado", "confirmado", "presenca_confirmada"];
  const nextStatus = {
    confirm_presence: "presenca_confirmada",
    request_reschedule: "reagendamento_solicitado",
    request_cancel: "cancelamento_solicitado",
  }[parsed.data.action];
  const result = { ok: true, action: parsed.data.action, appointmentId: id, status: nextStatus };
  try {
    const saved = await db.transaction(async (tx) => {
      const [updated] = await tx.update(appointmentsTable).set({ status: nextStatus }).where(and(
        eq(appointmentsTable.id, id), eq(appointmentsTable.clientId, appointment.clientId!),
        inArray(appointmentsTable.status, allowedStatuses),
      )).returning();
      if (!updated) {
        const [retry] = await tx.select().from(clinicActionsTable).where(and(
          eq(clinicActionsTable.appointmentId, id), eq(clinicActionsTable.idempotencyKey, parsed.data.idempotencyKey),
        ));
        if (retry) return retry.result;
        throw new Error("Appointment changed before action");
      }
      const [action] = await tx.insert(clinicActionsTable).values({
        clinicId: context.clinicId, appointmentId: id, actorUserId: userId,
        action: parsed.data.action, idempotencyKey: parsed.data.idempotencyKey, result,
      }).onConflictDoNothing().returning();
      return action?.result ?? result;
    });
    await db.insert(clinicAuditEventsTable).values({
      clinicId: context.clinicId, actorUserId: userId, action: `appointment.${parsed.data.action}`,
      resourceType: "appointment", resourceId: id, metadata: { idempotencyKey: parsed.data.idempotencyKey },
    });
    if (parsed.data.action === "request_reschedule") {
      await enqueueAppointmentEvent(context.clinicId, id, "reschedule", parsed.data.idempotencyKey)
        .catch((err) => req.log.warn({ err, appointmentId: id }, "Could not queue reschedule receipt"));
    }
    return res.json(saved);
  } catch {
    return res.status(409).json({ error: "O agendamento mudou antes da confirmação; atualize a página" });
  }
});

const bookingFields = {
  id: appointmentsTable.id, clientName: appointmentsTable.clientName, status: appointmentsTable.status,
  appointmentDate: appointmentsTable.appointmentDate, appointmentTime: appointmentsTable.appointmentTime,
};

router.get("/clinic/booking-requests", async (req, res) => {
  const { userId } = getAuth(req);
  const context = userId && await contextFor(userId);
  if (!context || !isAdminRole(context.role)) return res.status(403).json({ error: "Acesso exclusivo da gestão." });
  const id = z.string().uuid().optional().safeParse(req.query.id);
  if (!id.success) return res.status(400).json({ error: "Link de solicitação inválido." });
  const rows = await db.select(bookingFields).from(appointmentsTable).where(and(
    eq(appointmentsTable.clinicId, context.clinicId),
    id.data ? eq(appointmentsTable.id, id.data) : eq(appointmentsTable.status, "solicitado"),
  )).orderBy(asc(appointmentsTable.appointmentDate), asc(appointmentsTable.appointmentTime));
  return res.json(rows);
});

router.post("/clinic/booking-requests/:id", async (req, res) => {
  const { userId } = getAuth(req);
  const context = userId && await contextFor(userId);
  if (!context || !isAdminRole(context.role)) return res.status(403).json({ error: "Acesso exclusivo da gestão." });
  const id = z.string().uuid().safeParse(req.params.id);
  const decision = z.enum(["approve", "decline"]).safeParse(req.body?.decision);
  if (!id.success || !decision.success) return res.status(400).json({ error: "Solicitação inválida." });
  const approve = decision.data === "approve";
  const updated = await db.transaction(async (tx) => {
    const [appointment] = await tx.update(appointmentsTable).set({ status: approve ? "confirmado" : "cancelado" })
      .where(and(eq(appointmentsTable.id, id.data), eq(appointmentsTable.clinicId, context.clinicId),
        eq(appointmentsTable.status, "solicitado"))).returning();
    if (!appointment) return null;
    if (approve) {
      await enqueueAppointmentEvent(context.clinicId, appointment.id, "appointment_confirmation", "booking-approved", tx);
    } else {
      await tx.update(availabilitySlotsTable).set({ status: sql`case when ${availabilitySlotsTable.reservedForClientId} is null then 'aberto' else 'reservado' end`, appointmentId: null })
        .where(eq(availabilitySlotsTable.appointmentId, appointment.id));
      if (appointment.clientId) await enqueueBookingDeclined(tx, context.clinicId, appointment.clientId, appointment.id);
    }
    await tx.insert(clinicAuditEventsTable).values({
      clinicId: context.clinicId, actorUserId: userId!, action: approve ? "booking.approved" : "booking.declined",
      resourceType: "appointment", resourceId: appointment.id, metadata: {},
    });
    return appointment.id;
  });
  if (!updated) return res.status(409).json({ error: "Este pedido já foi avaliado ou está indisponível." });
  return res.json({ id: updated });
});

export default router;
