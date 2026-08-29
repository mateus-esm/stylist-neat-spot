import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  db,
  clientsTable,
  clinicAuditEventsTable,
  clinicMembersTable,
  whatsappConsentsTable,
  whatsappOutboxTable,
} from "@workspace/db";
import { z } from "zod";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  ensureClinicForUser,
  getClientIdForPatient,
  getStoredRole,
  isAdminRole,
} from "../lib/clinicRole";

const router: IRouter = Router();
router.use(requireClinicAuth);

const ConsentBody = z.object({
  clientId: z.string().uuid().optional(),
  phone: z.string().min(5).max(32).optional(),
  optedIn: z.boolean(),
});
const OutboxBody = z.object({
  clientId: z.string().uuid(),
  eventType: z.enum(["invite", "appointment_confirmation", "appointment_reminder", "reschedule"]),
  idempotencyKey: z.string().min(8).max(160),
  payload: z.record(z.string(), z.unknown()).default({}),
  fallbackText: z.string().min(1).max(4096),
});

async function contextFor(userId: string) {
  const role = await getStoredRole(userId);
  const context = await ensureClinicForUser(userId, role);
  return context ? { ...context, role: (await getStoredRole(userId)) ?? context.role } : null;
}

async function adminContext(req: Request, res: Response) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const context = await contextFor(userId);
  if (!context || !isAdminRole(context.role)) {
    res.status(403).json({ error: "Apenas a administração pode gerenciar mensagens" });
    return null;
  }
  return { userId, ...context };
}

router.get("/clinic/whatsapp/consent", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const context = await contextFor(userId);
  if (!context) return res.status(403).json({ error: "No clinic membership" });
  const clientId = context.role === "patient" ? await getClientIdForPatient(userId) : (req.query.clientId as string | undefined);
  if (!clientId) return res.status(400).json({ error: "clientId é obrigatório" });
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    context.role === "patient" ? eq(clientsTable.authUserId, userId) : eq(clientsTable.userId, userId),
  )).limit(1);
  if (!client) return res.status(404).json({ error: "Paciente não encontrado" });
  const [consent] = await db.select().from(whatsappConsentsTable).where(and(
    eq(whatsappConsentsTable.clinicId, context.clinicId),
    eq(whatsappConsentsTable.clientId, clientId),
  )).limit(1);
  return res.json(consent ?? { clinicId: context.clinicId, clientId, optedIn: false, phone: client.phone });
});

router.post("/clinic/whatsapp/consent", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const context = await contextFor(userId);
  if (!context) return res.status(403).json({ error: "No clinic membership" });
  const parsed = ConsentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const clientId = context.role === "patient" ? await getClientIdForPatient(userId) : parsed.data.clientId;
  if (!clientId) return res.status(400).json({ error: "clientId é obrigatório" });
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    context.role === "patient" ? eq(clientsTable.authUserId, userId) : eq(clientsTable.userId, userId),
  )).limit(1);
  if (!client) return res.status(404).json({ error: "Paciente não encontrado" });
  const now = new Date();
  const [consent] = await db.insert(whatsappConsentsTable).values({
    clinicId: context.clinicId,
    clientId,
    phone: parsed.data.phone ?? client.phone,
    optedIn: parsed.data.optedIn,
    optedInAt: parsed.data.optedIn ? now : undefined,
    optedOutAt: parsed.data.optedIn ? undefined : now,
  }).onConflictDoUpdate({
    target: [whatsappConsentsTable.clinicId, whatsappConsentsTable.clientId],
    set: {
      phone: parsed.data.phone ?? client.phone,
      optedIn: parsed.data.optedIn,
      optedInAt: parsed.data.optedIn ? now : undefined,
      optedOutAt: parsed.data.optedIn ? undefined : now,
      updatedAt: now,
    },
  }).returning();
  await db.insert(clinicAuditEventsTable).values({
    clinicId: context.clinicId, actorUserId: userId, action: parsed.data.optedIn ? "whatsapp.opted_in" : "whatsapp.opted_out",
    resourceType: "client", resourceId: clientId, metadata: {},
  });
  return res.json(consent);
});

router.get("/clinic/whatsapp/outbox", async (req: Request, res: Response) => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const rows = await db.select().from(whatsappOutboxTable).where(eq(
    whatsappOutboxTable.clinicId, admin.clinicId,
  )).orderBy(asc(whatsappOutboxTable.createdAt));
  return res.json(rows);
});

router.post("/clinic/whatsapp/outbox", async (req: Request, res: Response) => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = OutboxBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { clientId, eventType, idempotencyKey, payload, fallbackText } = parsed.data;
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId), eq(clientsTable.userId, admin.userId),
  )).limit(1);
  if (!client) return res.status(404).json({ error: "Paciente não encontrado nesta clínica" });
  const [consent] = await db.select().from(whatsappConsentsTable).where(and(
    eq(whatsappConsentsTable.clinicId, admin.clinicId), eq(whatsappConsentsTable.clientId, clientId),
  )).limit(1);
  if (!consent?.optedIn || !(consent.phone ?? client.phone)) {
    return res.status(409).json({ error: "Paciente não autorizou mensagens WhatsApp ou não possui telefone" });
  }
  const [row] = await db.insert(whatsappOutboxTable).values({
    clinicId: admin.clinicId, clientId, eventType, idempotencyKey, payload, fallbackText,
    phone: consent.phone ?? client.phone, status: "pending", attempts: "0",
  }).onConflictDoNothing().returning();
  if (!row) {
    const [existing] = await db.select().from(whatsappOutboxTable).where(and(
      eq(whatsappOutboxTable.clinicId, admin.clinicId), eq(whatsappOutboxTable.idempotencyKey, idempotencyKey),
    )).limit(1);
    return res.json(existing);
  }
  return res.status(201).json(row);
});

async function processMessage(id: string, clinicId: string, logger: Request["log"]) {
  const [message] = await db.select().from(whatsappOutboxTable).where(and(
    eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.clinicId, clinicId),
  )).limit(1);
  if (!message) return null;
  if (message.status === "sent") return message;
  const attempt = Number(message.attempts) + 1;
  const baseUrl = process.env.WHATSMIAU_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    const [fallback] = await db.update(whatsappOutboxTable).set({
      status: "fallback_required", attempts: String(attempt), lastError: "Whatsmiau não configurado",
    }).where(and(eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.status, "pending"))).returning();
    return fallback ?? message;
  }
  try {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": message.idempotencyKey },
      body: JSON.stringify({ to: message.phone, text: message.fallbackText, eventType: message.eventType, payload: message.payload }),
    });
    if (!response.ok) throw new Error(`Whatsmiau HTTP ${response.status}`);
    const body = await response.json().catch(() => ({})) as { id?: string; messageId?: string };
    const [sent] = await db.update(whatsappOutboxTable).set({
      status: "sent", attempts: String(attempt), providerMessageId: body.id ?? body.messageId ?? null, sentAt: new Date(), lastError: null,
    }).where(and(eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.status, "pending"))).returning();
    return sent ?? message;
  } catch (error) {
    logger.warn({ err: error, outboxId: id }, "WhatsApp delivery failed");
    const [failed] = await db.update(whatsappOutboxTable).set({
      status: attempt >= 3 ? "fallback_required" : "retry_wait",
      attempts: String(attempt), lastError: error instanceof Error ? error.message : "provider error",
      nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000),
    }).where(and(eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.status, "pending"))).returning();
    return failed ?? message;
  }
}

router.post("/clinic/whatsapp/outbox/:id/process", async (req: Request, res: Response) => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const row = await processMessage(id, admin.clinicId, req.log);
  if (!row) return res.status(404).json({ error: "Mensagem não encontrada" });
  return res.json(row);
});

export default router;