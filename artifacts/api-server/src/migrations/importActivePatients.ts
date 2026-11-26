import { and, asc, eq, sql } from "drizzle-orm";
import { clientsTable, clinicMembersTable, clinicsTable, db, patientPackagesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import patients from "./activePatients.json" with { type: "json" };

const MIGRATION_NOTE_PREFIX = "Migração:";

/**
 * One-time, idempotent import of the clinic's active patients and their plans
 * (from the "Migração de Pacientes Ativos" spreadsheet). Enabled only when
 * CLINIC_IMPORT_ACTIVE_PATIENTS=true.
 *
 * - Runs inside a single transaction guarded by an advisory lock, so concurrent
 *   server instances cannot import twice.
 * - Imports missing names once per clinic and preserves existing clinical and payment history.
 */
export async function importActivePatients() {
  if (process.env.CLINIC_IMPORT_ACTIVE_PATIENTS?.trim().toLowerCase() !== "true") return;
  const summary = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('import-active-patients'))`);
    const clinics = await tx.select({ id: clinicsTable.id }).from(clinicsTable);
    if (clinics.length !== 1) return { skipped: `expected exactly one clinic, found ${clinics.length}` };
    const clinicId = clinics[0].id;
    const [owner] = await tx.select({ userId: clinicMembersTable.userId }).from(clinicMembersTable)
      .where(and(eq(clinicMembersTable.clinicId, clinicId), eq(clinicMembersTable.role, "owner"), eq(clinicMembersTable.status, "active")))
      .orderBy(asc(clinicMembersTable.createdAt), asc(clinicMembersTable.id)).limit(1);

    if (!owner) return { skipped: "no active owner" };
    const existing = await tx.select({ name: clientsTable.name }).from(clientsTable)
      .where(eq(clientsTable.clinicId, clinicId));
    const normalized = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
    const seen = new Set(existing.map((client) => normalized(client.name)));
    let created = 0;
    for (const patient of patients) {
      const key = normalized(patient.name);
      if (seen.has(key)) continue;
      const paidAt = new Date(`${patient.paidAt}T12:00:00-03:00`);
      const [client] = await tx.insert(clientsTable).values({
        userId: owner.userId,
        clinicId,
        name: patient.name,
        phone: patient.phone || null,
        notes: patient.notes ? `${MIGRATION_NOTE_PREFIX} ${patient.notes}` : MIGRATION_NOTE_PREFIX,
      }).returning({ id: clientsTable.id });
      await tx.insert(patientPackagesTable).values({
        userId: owner.userId,
        clientId: client.id,
        name: `Plano de ${patient.totalSessions} sessões`,
        totalSessions: patient.totalSessions,
        completedSessions: patient.completedSessions,
        price: patient.price.toFixed(2),
        paymentStatus: patient.paymentStatus,
        status: "ativo",
        startedAt: new Date(`${patient.startedAt}T12:00:00-03:00`),
        paidAt: patient.paymentStatus === "pago" ? paidAt : null,
      });
      seen.add(key);
      created++;
    }
    return { created };
  });
  logger.info(summary, "Active patient import finished");
}
