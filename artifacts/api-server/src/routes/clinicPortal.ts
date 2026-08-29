import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
  sessionPlansTable,
} from "@workspace/db";
import { z } from "zod";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  ensureClinicForUser,
  getClientIdForPatient,
  getStoredRole,
  isAdminRole,
  isStaffRole,
} from "../lib/clinicRole";

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
    .where(eq(appointmentsTable.id, appointmentId)).limit(1);
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

  const appointmentWhere = clientIds.length
    ? inArray(appointmentsTable.clientId, clientIds)
    : isAdminRole(context.role)
      ? eq(appointmentsTable.userId, userId)
      : eq(appointmentsTable.assignedToUserId, userId);
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
  const slotOwner = clients[0]?.assignedToUserId ?? clients[0]?.userId ?? appointments[0]?.userId;
  const slots = context.role === "patient" && slotOwner
    ? await db.select().from(availabilitySlotsTable).where(and(
      eq(availabilitySlotsTable.status, "aberto"),
      eq(availabilitySlotsTable.userId, slotOwner),
    ))
    : [];
  return res.json({ clinicId: context.clinicId, role: context.role, client: clients[0] ?? null, clients, appointments, packages, plans, exercises, availableSlots: slots });
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
  return res.json({ appointment, exercises, plans });
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

  const nextStatus = {
    confirm_presence: "presenca_confirmada",
    request_reschedule: "reagendamento_solicitado",
    request_cancel: "cancelamento_solicitado",
  }[parsed.data.action];
  const result = { ok: true, action: parsed.data.action, appointmentId: id, status: nextStatus };
  try {
    const saved = await db.transaction(async (tx) => {
      const [updated] = await tx.update(appointmentsTable).set({ status: nextStatus }).where(and(
        eq(appointmentsTable.id, id), eq(appointmentsTable.clientId, await getClientIdForPatient(userId) as string),
      )).returning();
      if (!updated) throw new Error("Appointment changed before action");
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
    return res.json(saved);
  } catch {
    return res.status(409).json({ error: "O agendamento mudou antes da confirmação; atualize a página" });
  }
});

export default router;