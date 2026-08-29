import { createHash, randomBytes } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  appointmentsTable,
  clientsTable,
  clinicsTable,
  clinicAssignmentsTable,
  clinicInvitationsTable,
  clinicMembersTable,
  clinicAuditEventsTable,
  userRolesTable,
} from "@workspace/db";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  ensureClinicForUser,
  getStoredRole,
  isAdminRole,
  getClerkPrimaryEmail,
} from "../lib/clinicRole";
import { z } from "zod";

const router: IRouter = Router();
router.use(requireClinicAuth);

const InviteBody = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "physiotherapist"]).default("physiotherapist"),
});
const AssignmentBody = z.object({
  clientId: z.string().uuid(),
  physiotherapistUserId: z.string().min(1).nullable(),
});
const TransferBody = z.object({ physiotherapistUserId: z.string().min(1) });
const MemberPatchBody = z.object({
  role: z.enum(["admin", "physiotherapist"]).optional(),
  status: z.enum(["active", "revoked"]).optional(),
}).refine((v) => v.role !== undefined || v.status !== undefined);

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function callerContext(userId: string) {
  const role = await getStoredRole(userId);
  const context = await ensureClinicForUser(userId, role);
  return context ? { ...context, role: (await getStoredRole(userId)) ?? context.role } : null;
}

async function requireAdmin(req: Request, res: Response) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const context = await callerContext(userId);
  if (!context || !isAdminRole(context.role)) {
    res.status(403).json({ error: "Apenas proprietários e administradores podem administrar a equipe" });
    return null;
  }
  return { userId, ...context };
}

async function audit(clinicId: string, actorUserId: string, action: string, resourceType: string, resourceId?: string, metadata: Record<string, unknown> = {}) {
  await db.insert(clinicAuditEventsTable).values({
    clinicId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}

router.get("/clinic/context", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const role = await getStoredRole(userId);
  const context = await ensureClinicForUser(userId, role);
  if (!context) return res.status(403).json({ error: "No clinic membership" });
  const [clinic] = await db.select().from(clinicsTable)
    .where(eq(clinicsTable.id, context.clinicId)).limit(1);
  return res.json({ clinic, userId, role: context.role });
});

router.get("/clinic/members", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const members = await db.select().from(clinicMembersTable)
    .where(eq(clinicMembersTable.clinicId, admin.clinicId))
    .orderBy(desc(clinicMembersTable.createdAt));
  return res.json(members);
});

router.get("/clinic/invitations/team", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const invitations = await db.select({
    id: clinicInvitationsTable.id,
    email: clinicInvitationsTable.email,
    role: clinicInvitationsTable.role,
    status: clinicInvitationsTable.status,
    expiresAt: clinicInvitationsTable.expiresAt,
    createdAt: clinicInvitationsTable.createdAt,
  }).from(clinicInvitationsTable)
    .where(eq(clinicInvitationsTable.clinicId, admin.clinicId))
    .orderBy(desc(clinicInvitationsTable.createdAt));
  return res.json(invitations);
});

router.post("/clinic/members/invitations", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const email = parsed.data.email.trim().toLowerCase();
  const [existing] = await db.select().from(clinicInvitationsTable).where(and(
    eq(clinicInvitationsTable.clinicId, admin.clinicId),
    eq(clinicInvitationsTable.email, email),
    eq(clinicInvitationsTable.status, "pending"),
  )).limit(1);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invitation] = existing
    ? await db.update(clinicInvitationsTable).set({
      role: parsed.data.role,
      tokenHash: tokenDigest(token),
      invitedBy: admin.userId,
      expiresAt,
      status: "pending",
      acceptedAt: null,
      acceptedBy: null,
    }).where(eq(clinicInvitationsTable.id, existing.id)).returning()
    : await db.insert(clinicInvitationsTable).values({
      clinicId: admin.clinicId,
      email,
      role: parsed.data.role,
      tokenHash: tokenDigest(token),
      invitedBy: admin.userId,
      expiresAt,
    }).onConflictDoNothing().returning();
  if (!invitation) return res.status(409).json({ error: "Não foi possível criar o convite" });
  await audit(admin.clinicId, admin.userId, "member.invited", "clinic_invitation", invitation.id, { role: invitation.role });
  return res.status(201).json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    // The raw token is returned once to the admin so it can be shared securely.
    invitePath: `/aceitar-convite?token=${token}`,
  });
});

router.post("/clinic/members/invitations/:token/accept", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const [invitation] = await db.select().from(clinicInvitationsTable)
    .where(and(eq(clinicInvitationsTable.tokenHash, tokenDigest(token)), eq(clinicInvitationsTable.status, "pending")))
    .limit(1);
  if (!invitation) return res.status(404).json({ error: "Convite inválido ou já utilizado" });
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await db.update(clinicInvitationsTable).set({ status: "expired" }).where(eq(clinicInvitationsTable.id, invitation.id));
    return res.status(410).json({ error: "Convite expirado" });
  }
  const authenticatedEmail = await getClerkPrimaryEmail(userId);
  if (!authenticatedEmail || authenticatedEmail !== invitation.email.toLowerCase()) {
    return res.status(403).json({ error: "Este convite foi enviado para outro e-mail" });
  }
  const [existing] = await db.select().from(clinicMembersTable).where(and(
    eq(clinicMembersTable.clinicId, invitation.clinicId),
    eq(clinicMembersTable.userId, userId),
  )).limit(1);
  if (existing?.status === "active") return res.json({ member: existing });
  const member = await db.transaction(async (tx) => {
    const [created] = await tx.insert(clinicMembersTable).values({
      clinicId: invitation.clinicId,
      userId,
      email: invitation.email,
      role: invitation.role,
      status: "active",
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
    }).onConflictDoUpdate({
      target: [clinicMembersTable.clinicId, clinicMembersTable.userId],
      set: { role: invitation.role, status: "active", revokedAt: null, joinedAt: new Date() },
    }).returning();
    await tx.update(clinicInvitationsTable).set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedBy: userId,
    }).where(and(eq(clinicInvitationsTable.id, invitation.id), eq(clinicInvitationsTable.status, "pending")));
    await tx.insert(userRolesTable).values({ userId, role: invitation.role }).onConflictDoNothing();
    return created;
  });
  await audit(invitation.clinicId, userId, "member.accepted", "clinic_member", member?.id, { role: invitation.role });
  return res.json({ member });
});

router.patch("/clinic/members/:id", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = MemberPatchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [target] = await db.select().from(clinicMembersTable).where(and(
    eq(clinicMembersTable.id, id), eq(clinicMembersTable.clinicId, admin.clinicId),
  )).limit(1);
  if (!target) return res.status(404).json({ error: "Membro não encontrado" });
  if (target.userId === admin.userId && parsed.data.status === "revoked") {
    return res.status(400).json({ error: "Não é possível revogar seu próprio acesso" });
  }
  const [updated] = await db.update(clinicMembersTable).set({
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
    ...(parsed.data.status ? { status: parsed.data.status, revokedAt: parsed.data.status === "revoked" ? new Date() : null } : {}),
  }).where(eq(clinicMembersTable.id, target.id)).returning();
  await audit(admin.clinicId, admin.userId, parsed.data.status === "revoked" ? "member.revoked" : "member.updated", "clinic_member", target.id, parsed.data);
  return res.json(updated);
});

router.get("/clinic/assignments", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const rows = await db.select().from(clinicAssignmentsTable)
    .where(eq(clinicAssignmentsTable.clinicId, admin.clinicId));
  return res.json(rows);
});

router.get("/clinic/audit", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const rows = await db.select().from(clinicAuditEventsTable)
    .where(eq(clinicAuditEventsTable.clinicId, admin.clinicId))
    .orderBy(desc(clinicAuditEventsTable.createdAt))
    .limit(200);
  return res.json(rows);
});

router.post("/clinic/assignments", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = AssignmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { clientId, physiotherapistUserId } = parsed.data;
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    eq(clientsTable.userId, admin.userId),
  )).limit(1);
  if (!client) return res.status(404).json({ error: "Paciente não encontrado nesta clínica" });
  if (physiotherapistUserId) {
    const [member] = await db.select().from(clinicMembersTable).where(and(
      eq(clinicMembersTable.clinicId, admin.clinicId),
      eq(clinicMembersTable.userId, physiotherapistUserId),
      eq(clinicMembersTable.role, "physiotherapist"),
      eq(clinicMembersTable.status, "active"),
    )).limit(1);
    if (!member) return res.status(400).json({ error: "Fisioterapeuta não está ativo nesta clínica" });
  }
  const assignment = await db.transaction(async (tx) => {
    const [row] = await tx.insert(clinicAssignmentsTable).values({
      clinicId: admin.clinicId,
      clientId,
      physiotherapistUserId,
      assignedBy: admin.userId,
      status: physiotherapistUserId ? "active" : "unassigned",
    }).onConflictDoUpdate({
      target: [clinicAssignmentsTable.clinicId, clinicAssignmentsTable.clientId],
      set: { physiotherapistUserId, assignedBy: admin.userId, status: physiotherapistUserId ? "active" : "unassigned", updatedAt: new Date() },
    }).returning();
    await tx.update(clientsTable).set({ clinicId: admin.clinicId, assignedToUserId: physiotherapistUserId })
      .where(eq(clientsTable.id, clientId));
    await tx.update(appointmentsTable).set({ clinicId: admin.clinicId, assignedToUserId: physiotherapistUserId })
      .where(eq(appointmentsTable.clientId, clientId));
    return row;
  });
  await audit(admin.clinicId, admin.userId, "patient.assigned", "client", clientId, { physiotherapistUserId });
  return res.json(assignment);
});

router.post("/clinic/appointments/:id/transfer", async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = TransferBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [appointment] = await db.select().from(appointmentsTable).where(and(
    eq(appointmentsTable.id, id), eq(appointmentsTable.userId, admin.userId),
  )).limit(1);
  if (!appointment || !appointment.clientId) return res.status(404).json({ error: "Agendamento não encontrado" });
  const [member] = await db.select().from(clinicMembersTable).where(and(
    eq(clinicMembersTable.clinicId, admin.clinicId),
    eq(clinicMembersTable.userId, parsed.data.physiotherapistUserId),
    eq(clinicMembersTable.role, "physiotherapist"),
    eq(clinicMembersTable.status, "active"),
  )).limit(1);
  if (!member) return res.status(400).json({ error: "Fisioterapeuta não está ativo nesta clínica" });
  await db.transaction(async (tx) => {
    await tx.update(appointmentsTable).set({ clinicId: admin.clinicId, assignedToUserId: parsed.data.physiotherapistUserId })
      .where(eq(appointmentsTable.id, id));
    await tx.insert(clinicAssignmentsTable).values({
      clinicId: admin.clinicId, clientId: appointment.clientId!, physiotherapistUserId: parsed.data.physiotherapistUserId,
      assignedBy: admin.userId, status: "active",
    }).onConflictDoUpdate({
      target: [clinicAssignmentsTable.clinicId, clinicAssignmentsTable.clientId],
      set: { physiotherapistUserId: parsed.data.physiotherapistUserId, assignedBy: admin.userId, status: "active", updatedAt: new Date() },
    });
  });
  await audit(admin.clinicId, admin.userId, "appointment.transferred", "appointment", id, parsed.data);
  const [updated] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  return res.json(updated);
});

export default router;