import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  db,
  appointmentsTable,
  clientsTable,
  clinicsTable,
  whatsappConsentsTable,
  whatsappDeliveryEventsTable,
  whatsappOutboxTable,
  whatsappSettingsTable,
  whatsappTemplatesTable,
  type WhatsappEventType,
} from "@workspace/db";
import { logger } from "./logger";

export const WHATSAPP_VARIABLES: Record<WhatsappEventType, string[]> = {
  invite: ["patientName", "clinicName", "inviteLink"],
  appointment_confirmation: ["patientName", "clinicName", "appointmentDate", "appointmentTime", "service", "confirmationLink"],
  appointment_reminder: ["patientName", "clinicName", "appointmentDate", "appointmentTime", "service", "confirmationLink"],
  reschedule: ["patientName", "clinicName", "appointmentDate", "appointmentTime", "service", "confirmationLink"],
};

const DEFAULT_TEMPLATES: Array<{
  key: string;
  eventType: WhatsappEventType;
  label: string;
  body: string;
}> = [
  {
    key: "invite",
    eventType: "invite",
    label: "Convite para o portal",
    body: "Olá, {{patientName}}. A {{clinicName}} enviou um convite para você acompanhar seus agendamentos. {{inviteLink}}",
  },
  {
    key: "appointment_confirmation",
    eventType: "appointment_confirmation",
    label: "Confirmação de agendamento",
    body: "Olá, {{patientName}}. Sua sessão na {{clinicName}} está marcada para {{appointmentDate}} às {{appointmentTime}}. Serviço: {{service}}. {{confirmationLink}}",
  },
  {
    key: "appointment_reminder",
    eventType: "appointment_reminder",
    label: "Lembrete de sessão",
    body: "Lembrete, {{patientName}}: sua sessão na {{clinicName}} será em {{appointmentDate}} às {{appointmentTime}}. Serviço: {{service}}. {{confirmationLink}}",
  },
  {
    key: "reschedule",
    eventType: "reschedule",
    label: "Pedido de reagendamento",
    body: "Olá, {{patientName}}. Recebemos seu pedido de reagendamento na {{clinicName}}. Consulte as opções seguras no portal: {{confirmationLink}}",
  },
];

export class WhatsappConfigurationError extends Error {}

const WHATSMIAU_DEFAULT_BASE_URL = "https://api.whatsmiau.dev/v2";
const WHATSMIAU_DEFAULT_SEND_PATH = "/message/sendText/:instance";

function cleanValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 500);
}

export function renderWhatsappTemplate(body: string, values: Record<string, unknown>): string {
  const missing = new Set<string>();
  const rendered = body.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    const value = cleanValue(values[name]);
    if (!value) missing.add(name);
    return value;
  });
  const unsupported = Array.from(rendered.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)).map((match) => match[1]);
  if (unsupported.length > 0) {
    throw new Error(`Template possui variável inválida: ${unsupported[0]}`);
  }
  if (missing.size > 0) {
    throw new Error(`Variáveis ausentes: ${Array.from(missing).join(", ")}`);
  }
  return rendered;
}

export function previewValues(eventType: WhatsappEventType): Record<string, string> {
  const values: Record<string, string> = {
    patientName: "Ana",
    clinicName: "Clínica exemplo",
    inviteLink: "Acesse o portal pelo link enviado pela clínica.",
    appointmentDate: "10/01/2030",
    appointmentTime: "09:00",
    service: "Sessão de fisioterapia",
    confirmationLink: "Acesse o portal para confirmar ou pedir alteração.",
  };
  return Object.fromEntries(WHATSAPP_VARIABLES[eventType].map((key) => [key, values[key]]));
}

export function isWhatsappAsyncEnabled() {
  return process.env.WHATSMIAU_ASYNC_ENABLED?.trim().toLowerCase() === "true";
}

export async function ensureWhatsappTemplates(clinicId: string) {
  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(whatsappTemplatesTable).values({
      clinicId,
      key: template.key,
      eventType: template.eventType,
      label: template.label,
      body: template.body,
      variables: WHATSAPP_VARIABLES[template.eventType],
      active: true,
      version: 1,
    }).onConflictDoNothing({
      target: [whatsappTemplatesTable.clinicId, whatsappTemplatesTable.key],
    });
  }
}

export async function getWhatsappConfig(clinicId: string) {
  let [settings] = await db.select().from(whatsappSettingsTable)
    .where(eq(whatsappSettingsTable.clinicId, clinicId)).limit(1);
  if (!settings) {
    [settings] = await db.insert(whatsappSettingsTable).values({ clinicId }).returning();
  }
  return {
    settings,
    provider: {
      configured: Boolean(process.env.WHATSMIAU_API_TOKEN && process.env.WHATSMIAU_INSTANCE_NAME),
      baseUrlConfigured: Boolean(process.env.WHATSMIAU_BASE_URL),
      tokenConfigured: Boolean(process.env.WHATSMIAU_API_TOKEN),
      instanceConfigured: Boolean(process.env.WHATSMIAU_INSTANCE_NAME),
      instanceName: process.env.WHATSMIAU_INSTANCE_NAME || null,
      baseUrl: process.env.WHATSMIAU_BASE_URL || WHATSMIAU_DEFAULT_BASE_URL,
      sendPath: process.env.WHATSMIAU_SEND_PATH || WHATSMIAU_DEFAULT_SEND_PATH,
      authHeader: "apikey",
      supportedMessageTypes: ["text", "buttons", "list"],
      asyncEnabled: isWhatsappAsyncEnabled(),
      status: process.env.WHATSMIAU_API_TOKEN && process.env.WHATSMIAU_INSTANCE_NAME ? "configured" : "not_configured",
    },
  };
}

type EnqueueInput = {
  clinicId: string;
  clientId: string;
  eventType: WhatsappEventType;
  idempotencyKey: string;
  values?: Record<string, unknown>;
  scheduledAt?: Date;
  templateKey?: string;
};

export async function enqueueWhatsappEvent(input: EnqueueInput) {
  await ensureWhatsappTemplates(input.clinicId);
  const [client] = await db.select({ name: clientsTable.name, phone: clientsTable.phone })
    .from(clientsTable).where(and(
      eq(clientsTable.id, input.clientId),
      or(eq(clientsTable.clinicId, input.clinicId), isNull(clientsTable.clinicId)),
    )).limit(1);
  const [consent] = await db.select({ optedIn: whatsappConsentsTable.optedIn, phone: whatsappConsentsTable.phone })
    .from(whatsappConsentsTable).where(and(
      eq(whatsappConsentsTable.clinicId, input.clinicId),
      eq(whatsappConsentsTable.clientId, input.clientId),
    )).limit(1);
  const phone = cleanValue(consent?.phone ?? client?.phone);
  if (!client || !consent?.optedIn || !phone) return null;

  const [clinic] = await db.select({ name: clinicsTable.name }).from(clinicsTable)
    .where(eq(clinicsTable.id, input.clinicId)).limit(1);
  const [template] = await db.select().from(whatsappTemplatesTable).where(and(
    eq(whatsappTemplatesTable.clinicId, input.clinicId),
    eq(whatsappTemplatesTable.eventType, input.eventType),
    eq(whatsappTemplatesTable.active, true),
    input.templateKey ? eq(whatsappTemplatesTable.key, input.templateKey) : undefined,
  )).orderBy(asc(whatsappTemplatesTable.version)).limit(1);
  if (!template) throw new Error(`Nenhum template ativo para ${input.eventType}`);

  let appointmentValues: Record<string, unknown> = {};
  const appointmentId = typeof input.values?.appointmentId === "string" ? input.values.appointmentId : undefined;
  if (appointmentId && input.eventType !== "invite") {
    const [appointment] = await db.select({
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      service: appointmentsTable.service,
    }).from(appointmentsTable).where(and(
      eq(appointmentsTable.id, appointmentId),
      eq(appointmentsTable.clinicId, input.clinicId),
    )).limit(1);
    if (appointment) {
      appointmentValues = {
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime.slice(0, 5),
        service: appointment.service,
        confirmationLink: "Acesse o portal para confirmar ou pedir alteração.",
      };
    }
  }
  const values: Record<string, unknown> = {
    ...input.values,
    ...appointmentValues,
    patientName: client.name,
    clinicName: clinic?.name ?? "sua clínica",
  };
  const fallbackText = renderWhatsappTemplate(template.body, values);
  const [row] = await db.insert(whatsappOutboxTable).values({
    clinicId: input.clinicId,
    clientId: input.clientId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    phone,
    payload: Object.fromEntries(WHATSAPP_VARIABLES[input.eventType]
      .filter((key) => key in values)
      .map((key) => [key, cleanValue(values[key])])),
    fallbackText,
    status: "pending",
    attempts: "0",
    nextAttemptAt: input.scheduledAt,
    templateKey: template.key,
    templateVersion: template.version,
  }).onConflictDoNothing({
    target: [whatsappOutboxTable.clinicId, whatsappOutboxTable.idempotencyKey],
  }).returning();
  if (row) return row;
  const [existing] = await db.select().from(whatsappOutboxTable).where(and(
    eq(whatsappOutboxTable.clinicId, input.clinicId),
    eq(whatsappOutboxTable.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  return existing ?? null;
}

export async function enqueueAppointmentEvent(
  clinicId: string,
  appointmentId: string,
  eventType: Exclude<WhatsappEventType, "invite">,
  suffix: string = eventType,
) {
  const [appointment] = await db.select({
    id: appointmentsTable.id,
    clientId: appointmentsTable.clientId,
    appointmentDate: appointmentsTable.appointmentDate,
    appointmentTime: appointmentsTable.appointmentTime,
    service: appointmentsTable.service,
  }).from(appointmentsTable).where(and(
    eq(appointmentsTable.id, appointmentId),
    eq(appointmentsTable.clinicId, clinicId),
  )).limit(1);
  if (!appointment?.clientId) return null;
  return enqueueWhatsappEvent({
    clinicId,
    clientId: appointment.clientId,
    eventType,
    idempotencyKey: `${eventType}:${appointment.id}:${suffix}`,
    values: {
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime.slice(0, 5),
      service: appointment.service,
      confirmationLink: "Acesse o portal para confirmar ou pedir alteração.",
    },
  });
}

function appointmentDateInTimezone(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asUtc - guess));
}

export async function enqueueDueWhatsappReminders(now = new Date()) {
  const appointments = await db.select({
    id: appointmentsTable.id,
    clinicId: appointmentsTable.clinicId,
    clientId: appointmentsTable.clientId,
    appointmentDate: appointmentsTable.appointmentDate,
    appointmentTime: appointmentsTable.appointmentTime,
    service: appointmentsTable.service,
  }).from(appointmentsTable).where(inArray(appointmentsTable.status, ["agendado", "solicitado"]));
  let queued = 0;
  for (const appointment of appointments) {
    if (!appointment.clinicId || !appointment.clientId) continue;
    const [settings] = await db.select().from(whatsappSettingsTable)
      .where(and(eq(whatsappSettingsTable.clinicId, appointment.clinicId), eq(whatsappSettingsTable.enabled, true))).limit(1);
    if (!settings) continue;
    const appointmentAt = appointmentDateInTimezone(appointment.appointmentDate, appointment.appointmentTime, settings.timezone);
    for (const hours of settings.reminderHours.filter((value) => Number.isFinite(value) && value > 0 && value <= 168)) {
      const scheduledAt = new Date(appointmentAt.getTime() - hours * 60 * 60 * 1000);
      if (scheduledAt > now) {
        await enqueueWhatsappEvent({
          clinicId: appointment.clinicId,
          clientId: appointment.clientId,
          eventType: "appointment_reminder",
          idempotencyKey: `appointment_reminder:${appointment.id}:${hours}`,
          values: {
            appointmentDate: appointment.appointmentDate,
            appointmentTime: appointment.appointmentTime.slice(0, 5),
            service: appointment.service,
            confirmationLink: "Acesse o portal para confirmar ou pedir alteração.",
          },
          scheduledAt,
        });
        continue;
      }
      const row = await enqueueWhatsappEvent({
        clinicId: appointment.clinicId,
        clientId: appointment.clientId,
        eventType: "appointment_reminder",
        idempotencyKey: `appointment_reminder:${appointment.id}:${hours}`,
        values: {
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime.slice(0, 5),
          service: appointment.service,
          confirmationLink: "Acesse o portal para confirmar ou pedir alteração.",
        },
      });
      if (row?.createdAt && row.createdAt.getTime() >= now.getTime() - 1000) queued++;
    }
  }
  return queued;
}

function providerConfig() {
  const baseUrl = (process.env.WHATSMIAU_BASE_URL || WHATSMIAU_DEFAULT_BASE_URL).replace(/\/$/, "");
  const token = process.env.WHATSMIAU_API_TOKEN;
  const instanceName = process.env.WHATSMIAU_INSTANCE_NAME?.trim();
  if (!token || !instanceName) {
    throw new WhatsappConfigurationError("Whatsmiau não configurado: defina WHATSMIAU_API_TOKEN e WHATSMIAU_INSTANCE_NAME");
  }
  const sendPath = (process.env.WHATSMIAU_SEND_PATH || WHATSMIAU_DEFAULT_SEND_PATH).trim();
  if (!sendPath.includes(":instance") && !sendPath.includes("{instance}")) {
    throw new WhatsappConfigurationError("WHATSMIAU_SEND_PATH precisa conter :instance");
  }
  const encodedInstance = encodeURIComponent(instanceName);
  return {
    url: `${baseUrl}${sendPath.replace(":instance", encodedInstance).replace("{instance}", encodedInstance)}`,
    token,
    timeout: Math.max(Number(process.env.WHATSMIAU_TIMEOUT_MS || 10000), 1000),
  };
}

type WhatsappProviderMessage = Pick<typeof whatsappOutboxTable.$inferSelect, "phone" | "fallbackText" | "idempotencyKey">;

export function buildWhatsmiauRequest(message: WhatsappProviderMessage) {
  const config = providerConfig();
  if (!message.phone) {
    throw new Error("Mensagem WhatsApp sem telefone");
  }
  return {
    url: config.url,
    timeout: config.timeout,
    headers: {
      "content-type": "application/json",
      apikey: config.token,
      "idempotency-key": message.idempotencyKey,
    },
    body: {
      number: message.phone,
      text: message.fallbackText,
    },
  };
}

function stringAt(value: unknown, ...keys: string[]) {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

export function extractWhatsmiauMessageId(body: unknown) {
  return stringAt(body, "key", "id")
    ?? stringAt(body, "data", "key", "id")
    ?? stringAt(body, "messageId")
    ?? stringAt(body, "data", "messageId")
    ?? stringAt(body, "id")
    ?? stringAt(body, "data", "id");
}

async function sendToWhatsmiau(message: WhatsappProviderMessage) {
  const request = buildWhatsmiauRequest(message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeout);
  try {
    const response = await fetch(request.url, {
      method: "POST",
      signal: controller.signal,
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Whatsmiau HTTP ${response.status}`);
    const providerMessageId = extractWhatsmiauMessageId(body);
    if (!providerMessageId) throw new Error("Whatsmiau não confirmou sucesso (key.id ausente)");
    return { providerMessageId };
  } finally {
    clearTimeout(timeout);
  }
}

type WhatsmiauDelivery = {
  providerMessageId: string;
  status: "delivered" | "read";
  occurredAt: Date;
  providerPayload: Record<string, unknown>;
};

export function parseWhatsmiauDeliveryWebhook(input: unknown): WhatsmiauDelivery | null {
  if (!input || typeof input !== "object") return null;
  const envelope = input as Record<string, unknown>;
  const event = typeof envelope.event === "string" ? envelope.event.toLowerCase().replace("_", ".") : "";
  if (event !== "messages.update") return null;
  const data = envelope.data;
  if (!data || typeof data !== "object") return null;
  const delivery = data as Record<string, unknown>;
  const providerMessageId = stringAt(delivery, "messageId")
    ?? stringAt(delivery, "keyId")
    ?? stringAt(delivery, "key", "id");
  const rawStatus = typeof delivery.status === "string" ? delivery.status.toUpperCase() : "";
  const status = rawStatus === "DELIVERY_ACK" ? "delivered" : rawStatus === "READ" ? "read" : null;
  if (!providerMessageId || !status) return null;
  const rawDate = typeof envelope.date_time === "string" ? envelope.date_time : "";
  const parsedDate = rawDate ? new Date(rawDate) : new Date();
  const occurredAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  return {
    providerMessageId,
    status,
    occurredAt,
    // Keep only delivery metadata. In particular, do not persist message text,
    // remote JIDs, or any other provider payload that could contain clinical data.
    providerPayload: {
      event: "messages.update",
      instance: stringAt(envelope, "instance") ?? stringAt(delivery, "instanceId"),
      status: rawStatus,
      messageId: providerMessageId,
      date_time: rawDate || occurredAt.toISOString(),
    },
  };
}

const DELIVERY_STATUS_RANK: Record<string, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

export async function recordWhatsmiauDelivery(input: unknown) {
  const delivery = parseWhatsmiauDeliveryWebhook(input);
  if (!delivery) return { accepted: false as const, tracked: false as const };

  const [outbox] = await db.select().from(whatsappOutboxTable)
    .where(eq(whatsappOutboxTable.providerMessageId, delivery.providerMessageId))
    .limit(1);
  if (!outbox) {
    // A webhook can race the response that links an outbox row to the provider ID.
    // Acknowledge it, but do not create an orphan event without a clinic owner.
    return { accepted: true as const, tracked: false as const, providerMessageId: delivery.providerMessageId };
  }

  await db.insert(whatsappDeliveryEventsTable).values({
    clinicId: outbox.clinicId,
    outboxId: outbox.id,
    providerMessageId: delivery.providerMessageId,
    status: delivery.status,
    providerPayload: delivery.providerPayload,
    occurredAt: delivery.occurredAt,
  }).onConflictDoNothing();

  const currentRank = DELIVERY_STATUS_RANK[outbox.status] ?? -1;
  const deliveryRank = DELIVERY_STATUS_RANK[delivery.status] ?? -1;
  if (deliveryRank > currentRank) {
    await db.update(whatsappOutboxTable).set({
      status: delivery.status,
      updatedAt: new Date(),
    }).where(eq(whatsappOutboxTable.id, outbox.id));
  }
  return {
    accepted: true as const,
    tracked: true as const,
    providerMessageId: delivery.providerMessageId,
    status: delivery.status,
  };
}

export async function processWhatsappMessage(id: string, clinicId: string) {
  const lockToken = randomUUID();
  const now = new Date();
  const staleAt = new Date(now.getTime() - 10 * 60 * 1000);
  const [claimed] = await db.update(whatsappOutboxTable).set({
    status: "processing",
    lockedAt: now,
    lockToken,
    updatedAt: now,
  }).where(and(
    eq(whatsappOutboxTable.id, id),
    eq(whatsappOutboxTable.clinicId, clinicId),
    inArray(whatsappOutboxTable.status, ["pending", "retry_wait", "processing"]),
    or(isNull(whatsappOutboxTable.nextAttemptAt), lte(whatsappOutboxTable.nextAttemptAt, now)),
    or(isNull(whatsappOutboxTable.lockedAt), lte(whatsappOutboxTable.lockedAt, staleAt)),
  )).returning();
  if (!claimed) {
    const [current] = await db.select().from(whatsappOutboxTable).where(and(
      eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.clinicId, clinicId),
    )).limit(1);
    return current ?? null;
  }

  const attempt = Number(claimed.attempts) + 1;
  try {
    const delivered = await sendToWhatsmiau(claimed);
    const [sent] = await db.update(whatsappOutboxTable).set({
      status: "sent",
      attempts: String(attempt),
      providerMessageId: delivered.providerMessageId,
      sentAt: new Date(),
      lastError: null,
      nextAttemptAt: null,
      lockedAt: null,
      lockToken: null,
    }).where(and(eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.lockToken, lockToken))).returning();
    if (sent) {
      await db.insert(whatsappDeliveryEventsTable).values({
        clinicId,
        outboxId: id,
        providerMessageId: delivered.providerMessageId,
        status: "accepted",
        providerPayload: {
          provider: "whatsmiau",
          messageId: delivered.providerMessageId,
        },
      }).onConflictDoNothing();
    }
    return sent ?? claimed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider error";
    const isConfigurationError = error instanceof WhatsappConfigurationError;
    const terminal = isConfigurationError || attempt >= 3;
    const [failed] = await db.update(whatsappOutboxTable).set({
      status: terminal ? "fallback_required" : "retry_wait",
      attempts: String(attempt),
      lastError: message,
      nextAttemptAt: terminal ? null : new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000),
      lockedAt: null,
      lockToken: null,
    }).where(and(eq(whatsappOutboxTable.id, id), eq(whatsappOutboxTable.lockToken, lockToken))).returning();
    logger.warn({ err: error, outboxId: id, clinicId, attempt }, "WhatsApp delivery failed");
    return failed ?? claimed;
  }
}

export async function processWhatsappOutboxBatch(limit = 20) {
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  const rows = await db.select({ id: whatsappOutboxTable.id, clinicId: whatsappOutboxTable.clinicId })
    .from(whatsappOutboxTable).where(and(
      inArray(whatsappOutboxTable.status, ["pending", "retry_wait", "processing"]),
      or(isNull(whatsappOutboxTable.nextAttemptAt), lte(whatsappOutboxTable.nextAttemptAt, new Date())),
      or(isNull(whatsappOutboxTable.lockedAt), lte(whatsappOutboxTable.lockedAt, staleAt)),
    )).orderBy(asc(whatsappOutboxTable.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  let processed = 0;
  for (const row of rows) {
    if (await processWhatsappMessage(row.id, row.clinicId)) processed++;
  }
  return processed;
}

export function startWhatsappWorker() {
  const intervalMs = Number(process.env.WHATSMIAU_WORKER_INTERVAL_MS || 60000);
  const run = async () => {
    if (!isWhatsappAsyncEnabled()) return;
    try {
      await enqueueDueWhatsappReminders();
      await processWhatsappOutboxBatch();
    } catch (error) {
      logger.error({ err: error }, "WhatsApp worker run failed");
    }
  };
  const timer = setInterval(run, Math.max(intervalMs, 10_000));
  timer.unref?.();
  void run();
  return timer;
}