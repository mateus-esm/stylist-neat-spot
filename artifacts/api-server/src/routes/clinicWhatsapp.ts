import { timingSafeEqual } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  db,
  clientsTable,
  clinicAuditEventsTable,
  whatsappConsentsTable,
  whatsappDeliveryEventsTable,
  whatsappOutboxTable,
  whatsappSettingsTable,
  whatsappTemplatesTable,
  type WhatsappEventType,
} from "@workspace/db";
import { z } from "zod";
import { requireClinicAuth } from "../middlewares/requireClinicAuth";
import {
  ensureClinicForUser,
  getClientIdForPatient,
  getStoredRole,
  isAdminRole,
} from "../lib/clinicRole";
import {
  enqueueWhatsappEvent,
  ensureWhatsappTemplates,
  getWhatsappConfig,
  connectWhatsmiauInstance,
  createWhatsmiauInstance,
  disconnectWhatsmiauInstance,
  getWhatsmiauInstanceStatus,
  processWhatsappMessage,
  previewValues,
  recordWhatsmiauDelivery,
  renderWhatsappTemplate,
  WHATSAPP_VARIABLES,
} from "../lib/whatsapp";

const router: IRouter = Router();

function hasValidWebhookToken(req: Request) {
  const expected = process.env.WHATSMIAU_WEBHOOK_TOKEN?.trim();
  if (!expected) return true;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const headerToken = req.header("x-whatsmiau-webhook-token");
  const provided = queryToken ?? headerToken;
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

// WhatsMiau has no documented webhook signature. Use the optional shared token
// gate when configured, and never require clinic authentication from the provider.
router.post("/webhooks/whatsmiau", async (req: Request, res: Response): Promise<void> => {
  if (!hasValidWebhookToken(req)) {
    res.status(401).json({ error: "Webhook token inválido" });
    return;
  }
  const result = await recordWhatsmiauDelivery(req.body);
  if (!result.accepted) {
    res.status(400).json({ error: "Evento Whatsmiau inválido ou não suportado" });
    return;
  }
  res.status(200).json(result);
});

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
  fallbackText: z.string().max(4096).optional(),
  scheduledAt: z.coerce.date().optional(),
  templateKey: z.string().min(1).max(80).optional(),
});
const SettingsBody = z.object({
  enabled: z.boolean().optional(),
  reminderHours: z.array(z.number().int().min(1).max(168))
    .min(1).max(7)
    .refine((hours) => new Set(hours).size === hours.length, "Janelas de lembrete não podem se repetir")
    .optional(),
  timezone: z.string().min(1).max(80).refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido").optional(),
}).refine((value) => Object.keys(value).length > 0);
const TemplateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  eventType: z.enum(["invite", "appointment_confirmation", "appointment_reminder", "reschedule"]),
  label: z.string().min(1).max(120),
  body: z.string().min(1).max(4096),
  active: z.boolean().default(true),
});
const TemplatePatch = TemplateBody.partial().refine((value) => Object.keys(value).length > 0);
const TestBody = z.object({
  clientId: z.string().uuid(),
  values: z.record(z.string(), z.unknown()).default({}),
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

async function ownedClient(clientId: string, clinicId: string, userId: string) {
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    eq(clientsTable.userId, userId),
    or(eq(clientsTable.clinicId, clinicId), isNull(clientsTable.clinicId)),
  )).limit(1);
  return client;
}

router.get("/clinic/whatsapp/config", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const config = await getWhatsappConfig(admin.clinicId);
  res.json(config);
});

router.patch("/clinic/whatsapp/config", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db.insert(whatsappSettingsTable).values({
    clinicId: admin.clinicId,
    ...parsed.data,
    updatedBy: admin.userId,
  }).onConflictDoUpdate({
    target: whatsappSettingsTable.clinicId,
    set: { ...parsed.data, updatedBy: admin.userId, updatedAt: new Date() },
  }).returning();
  await db.insert(clinicAuditEventsTable).values({
    clinicId: admin.clinicId, actorUserId: admin.userId,
    action: "whatsapp.settings_updated", resourceType: "whatsapp_settings",
    resourceId: settings.id, metadata: parsed.data,
  });
  res.json(settings);
});

function generatedInstanceName(clinicId: string) {
  return `fisio-${clinicId.replace(/-/g, "").slice(0, 16)}`;
}

async function clinicWhatsappSettings(clinicId: string) {
  let [settings] = await db.select().from(whatsappSettingsTable)
    .where(eq(whatsappSettingsTable.clinicId, clinicId)).limit(1);
  if (!settings) {
    [settings] = await db.insert(whatsappSettingsTable)
      .values({ clinicId }).returning();
  }
  return settings;
}

function normalizeConnectionStatus(status: string) {
  if (status === "connected" || status === "open") return "connected";
  if (status === "awaiting_qr" || status === "connecting" || status === "qr") return "awaiting_qr";
  if (status === "disconnected" || status === "close" || status === "closed") return "disconnected";
  return "unknown";
}

router.post("/clinic/whatsapp/instance/connect", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  try {
    const current = await clinicWhatsappSettings(admin.clinicId);
    const instanceName = current.instanceName ?? generatedInstanceName(admin.clinicId);
    const connection = current.instanceName
      ? await connectWhatsmiauInstance(instanceName)
      : await createWhatsmiauInstance(instanceName);
    const connectionStatus = normalizeConnectionStatus(connection.status);
    const [settings] = await db.update(whatsappSettingsTable).set({
      instanceName,
      connectionStatus,
      connectedPhone: connection.phoneNumber,
      lastProviderSyncAt: new Date(),
      updatedBy: admin.userId,
      updatedAt: new Date(),
    }).where(eq(whatsappSettingsTable.clinicId, admin.clinicId)).returning();
    res.json({
      settings,
      instanceName,
      status: connectionStatus,
      phoneNumber: connection.phoneNumber,
      qrCode: connection.qrCode,
      qrExpiresAt: connection.qrExpiresAt,
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp" });
  }
});

router.get("/clinic/whatsapp/instance/status", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  try {
    const current = await clinicWhatsappSettings(admin.clinicId);
    const instanceName = current.instanceName;
    if (!instanceName) {
      res.json({ status: "not_configured", instanceName: null, phoneNumber: null });
      return;
    }
    const connection = await getWhatsmiauInstanceStatus(instanceName);
    const status = normalizeConnectionStatus(connection.status);
    const [settings] = await db.update(whatsappSettingsTable).set({
      connectionStatus: status,
      connectedPhone: connection.phoneNumber,
      lastProviderSyncAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(whatsappSettingsTable.clinicId, admin.clinicId)).returning();
    res.json({
      settings,
      instanceName,
      status,
      phoneNumber: connection.phoneNumber,
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp" });
  }
});

router.post("/clinic/whatsapp/instance/disconnect", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  try {
    const current = await clinicWhatsappSettings(admin.clinicId);
    if (!current.instanceName) {
      res.json({ status: "not_configured", instanceName: null });
      return;
    }
    const result = await disconnectWhatsmiauInstance(current.instanceName);
    const [settings] = await db.update(whatsappSettingsTable).set({
      connectionStatus: "disconnected",
      connectedPhone: null,
      lastProviderSyncAt: new Date(),
      updatedBy: admin.userId,
      updatedAt: new Date(),
    }).where(eq(whatsappSettingsTable.clinicId, admin.clinicId)).returning();
    res.json({ settings, instanceName: result.instanceName, status: "disconnected" });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível desconectar o WhatsApp" });
  }
});

router.get("/clinic/whatsapp/templates", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  // The defaults are persisted on first use, so automations never rely on browser-only text.
  await ensureWhatsappTemplates(admin.clinicId);
  const templates = await db.select().from(whatsappTemplatesTable)
    .where(eq(whatsappTemplatesTable.clinicId, admin.clinicId))
    .orderBy(asc(whatsappTemplatesTable.eventType), asc(whatsappTemplatesTable.version));
  res.json({
    templates,
    variables: WHATSAPP_VARIABLES,
  });
});

router.post("/clinic/whatsapp/templates", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = TemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const allowed = WHATSAPP_VARIABLES[parsed.data.eventType as WhatsappEventType];
  const used = Array.from(parsed.data.body.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)).map((match) => match[1]);
  const invalid = used.find((name) => !allowed.includes(name));
  if (invalid) {
    res.status(400).json({ error: `Variável não permitida para este evento: ${invalid}` });
    return;
  }
  const missing = allowed.filter((name) => !used.includes(name));
  // Missing placeholders are allowed for custom templates only when the author deliberately
  // omits them; render still fails explicitly if a template uses an unavailable value.
  if (missing.length === allowed.length) {
    res.status(400).json({ error: "O template precisa usar pelo menos uma variável documentada" });
    return;
  }
  const [created] = await db.insert(whatsappTemplatesTable).values({
      clinicId: admin.clinicId,
      ...parsed.data,
      variables: used,
      version: 1,
    }).onConflictDoNothing({
      target: [whatsappTemplatesTable.clinicId, whatsappTemplatesTable.key],
    }).returning();
  if (!created) {
    res.status(409).json({ error: "Já existe um template com esta chave nesta clínica" });
    return;
  }
  res.status(201).json(created);
});

router.patch("/clinic/whatsapp/templates/:id", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = TemplatePatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [current] = await db.select().from(whatsappTemplatesTable).where(and(
    eq(whatsappTemplatesTable.id, id), eq(whatsappTemplatesTable.clinicId, admin.clinicId),
  )).limit(1);
  if (!current) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }
  const eventType = (parsed.data.eventType ?? current.eventType) as WhatsappEventType;
  const body = parsed.data.body ?? current.body;
  const allowed = WHATSAPP_VARIABLES[eventType];
  const used = Array.from(body.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)).map((match) => match[1]);
  const invalid = used.find((name) => !allowed.includes(name));
  if (invalid) {
    res.status(400).json({ error: `Variável não permitida para este evento: ${invalid}` });
    return;
  }
  const [updated] = await db.update(whatsappTemplatesTable).set({
    ...parsed.data,
    eventType,
    body,
    variables: used,
    version: current.version + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(whatsappTemplatesTable.id, id), eq(whatsappTemplatesTable.clinicId, admin.clinicId),
  )).returning();
  res.json(updated);
});

router.delete("/clinic/whatsapp/templates/:id", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [updated] = await db.update(whatsappTemplatesTable).set({
    active: false, updatedAt: new Date(),
  }).where(and(
    eq(whatsappTemplatesTable.id, id), eq(whatsappTemplatesTable.clinicId, admin.clinicId),
  )).returning();
  if (!updated) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }
  res.json(updated);
});

router.post("/clinic/whatsapp/templates/preview", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = z.object({
    eventType: z.enum(["invite", "appointment_confirmation", "appointment_reminder", "reschedule"]),
    body: z.string().min(1).max(4096),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json({ text: renderWhatsappTemplate(parsed.data.body, previewValues(parsed.data.eventType)) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Template inválido" });
  }
});

router.post("/clinic/whatsapp/templates/:id/test", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = TestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = await ownedClient(parsed.data.clientId, admin.clinicId, admin.userId);
  if (!client) {
    res.status(404).json({ error: "Paciente não encontrado nesta clínica" });
    return;
  }
  const [template] = await db.select().from(whatsappTemplatesTable).where(and(
    eq(whatsappTemplatesTable.id, Array.isArray(req.params.id) ? req.params.id[0] : req.params.id),
    eq(whatsappTemplatesTable.clinicId, admin.clinicId),
  )).limit(1);
  if (!template) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }
  const row = await enqueueWhatsappEvent({
    clinicId: admin.clinicId,
    clientId: client.id,
    eventType: template.eventType as WhatsappEventType,
    templateKey: template.key,
    idempotencyKey: `template_test:${template.id}:${Date.now()}`,
    values: parsed.data.values,
  });
  if (!row) {
    res.status(409).json({ error: "O paciente precisa ter consentimento e telefone válido para o teste" });
    return;
  }
  const result = await processWhatsappMessage(row.id, admin.clinicId);
  res.json(result);
});

router.get("/clinic/whatsapp/consent", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const context = await contextFor(userId);
  if (!context) {
    res.status(403).json({ error: "No clinic membership" });
    return;
  }
  const clientId = context.role === "patient" ? await getClientIdForPatient(userId) : (req.query.clientId as string | undefined);
  if (!clientId) {
    res.status(400).json({ error: "clientId é obrigatório" });
    return;
  }
  const client = context.role === "patient"
    ? await ownedClient(clientId, context.clinicId, userId)
    : (await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, clientId), eq(clientsTable.userId, userId),
      or(eq(clientsTable.clinicId, context.clinicId), isNull(clientsTable.clinicId)),
    )).limit(1))[0];
  if (!client) {
    res.status(404).json({ error: "Paciente não encontrado" });
    return;
  }
  const [consent] = await db.select().from(whatsappConsentsTable).where(and(
    eq(whatsappConsentsTable.clinicId, context.clinicId),
    eq(whatsappConsentsTable.clientId, clientId),
  )).limit(1);
  res.json(consent ?? { clinicId: context.clinicId, clientId, optedIn: false, phone: client.phone });
});

router.post("/clinic/whatsapp/consent", async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const context = await contextFor(userId);
  if (!context) {
    res.status(403).json({ error: "No clinic membership" });
    return;
  }
  const parsed = ConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const clientId = context.role === "patient" ? await getClientIdForPatient(userId) : parsed.data.clientId;
  if (!clientId) {
    res.status(400).json({ error: "clientId é obrigatório" });
    return;
  }
  const client = context.role === "patient"
    ? (await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, clientId), eq(clientsTable.authUserId, userId),
      or(eq(clientsTable.clinicId, context.clinicId), isNull(clientsTable.clinicId)),
    )).limit(1))[0]
    : await ownedClient(clientId, context.clinicId, userId);
  if (!client) {
    res.status(404).json({ error: "Paciente não encontrado" });
    return;
  }
  const now = new Date();
  const [consent] = await db.insert(whatsappConsentsTable).values({
    clinicId: context.clinicId, clientId,
    phone: parsed.data.phone ?? client.phone,
    optedIn: parsed.data.optedIn,
    optedInAt: parsed.data.optedIn ? now : undefined,
    optedOutAt: parsed.data.optedIn ? undefined : now,
  }).onConflictDoUpdate({
    target: [whatsappConsentsTable.clinicId, whatsappConsentsTable.clientId],
    set: {
      phone: parsed.data.phone ?? client.phone, optedIn: parsed.data.optedIn,
      optedInAt: parsed.data.optedIn ? now : undefined,
      optedOutAt: parsed.data.optedIn ? undefined : now, updatedAt: now,
    },
  }).returning();
  await db.insert(clinicAuditEventsTable).values({
    clinicId: context.clinicId, actorUserId: userId,
    action: parsed.data.optedIn ? "whatsapp.opted_in" : "whatsapp.opted_out",
    resourceType: "client", resourceId: clientId, metadata: {},
  });
  res.json(consent);
});

router.get("/clinic/whatsapp/outbox", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const rows = await db.select().from(whatsappOutboxTable).where(eq(
    whatsappOutboxTable.clinicId, admin.clinicId,
  )).orderBy(asc(whatsappOutboxTable.createdAt));
  res.json(rows);
});

router.post("/clinic/whatsapp/outbox", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const parsed = OutboxBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = await ownedClient(parsed.data.clientId, admin.clinicId, admin.userId);
  if (!client) {
    res.status(404).json({ error: "Paciente não encontrado nesta clínica" });
    return;
  }
  try {
    const [existing] = await db.select({ id: whatsappOutboxTable.id }).from(whatsappOutboxTable).where(and(
      eq(whatsappOutboxTable.clinicId, admin.clinicId),
      eq(whatsappOutboxTable.idempotencyKey, parsed.data.idempotencyKey),
    )).limit(1);
    const row = await enqueueWhatsappEvent({
      clinicId: admin.clinicId,
      clientId: parsed.data.clientId,
      eventType: parsed.data.eventType,
      idempotencyKey: parsed.data.idempotencyKey,
      values: parsed.data.payload,
      scheduledAt: parsed.data.scheduledAt,
      templateKey: parsed.data.templateKey,
    });
    if (!row) {
      res.status(409).json({ error: "Paciente não autorizou mensagens WhatsApp ou não possui telefone" });
      return;
    }
    res.status(existing ? 200 : 201).json(row);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível enfileirar a mensagem" });
  }
});

router.post("/clinic/whatsapp/outbox/:id/process", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const row = await processWhatsappMessage(id, admin.clinicId);
  if (!row) {
    res.status(404).json({ error: "Mensagem não encontrada" });
    return;
  }
  res.json(row);
});

router.get("/clinic/whatsapp/outbox/:id/events", async (req: Request, res: Response): Promise<void> => {
  const admin = await adminContext(req, res);
  if (!admin) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const events = await db.select().from(whatsappDeliveryEventsTable).where(and(
    eq(whatsappDeliveryEventsTable.clinicId, admin.clinicId),
    eq(whatsappDeliveryEventsTable.outboxId, id),
  )).orderBy(asc(whatsappDeliveryEventsTable.occurredAt));
  res.json(events);
});

export default router;