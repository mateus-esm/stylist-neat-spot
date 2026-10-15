import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
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
 * - Removes duplicate migrated patients left by earlier concurrent runs.
 * - Plans are recorded as paid on the spreadsheet's `paidAt` date so the amount
 *   counts as that month's revenue.
 * - Patients that already exist (same name for the same owner) are never
 *   modified, except for migrated ones, whose plan payment date is aligned.
 */
export async function importActivePatients() {
  if (process.env.CLINIC_IMPORT_ACTIVE_PATIENTS?.trim().toLowerCase() !== "true") return;
  const summary = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('import-active-patients'))`);
    const clinics = await tx.select({ id: clinicsTable.id }).from(clinicsTable);
    if (clinics.length !== 1) return { skipped: `expected exactly one clinic, found ${clinics.length}` };
    const clinicId = clinics[0].id;
    const owners = await tx.select({ userId: clinicMembersTable.userId }).from(clinicMembersTable)
      .where(and(eq(clinicMembersTable.clinicId, clinicId), eq(clinicMembersTable.role, "owner")));

    let created = 0;
    let removedDuplicates = 0;
    let paymentDatesAligned = 0;
    for (const owner of owners) {
      const existing = await tx.select({
        id: clientsTable.id,
        name: clientsTable.name,
        notes: clientsTable.notes,
      }).from(clientsTable)
        .where(and(eq(clientsTable.clinicId, clinicId), eq(clientsTable.userId, owner.userId)))
        .orderBy(asc(clientsTable.createdAt));

      const seen = new Map<string, string>();
      const duplicateIds: string[] = [];
      for (const client of existing) {
        const key = client.name.trim().toLowerCase();
        const migrated = client.notes?.startsWith(MIGRATION_NOTE_PREFIX);
        if (seen.has(key) && migrated) duplicateIds.push(client.id);
        else if (!seen.has(key)) seen.set(key, client.id);
      }
      if (duplicateIds.length) {
        await tx.delete(clientsTable).where(inArray(clientsTable.id, duplicateIds));
        removedDuplicates += duplicateIds.length;
      }

      for (const patient of patients) {
        const paidAt = new Date(`${patient.paidAt}T12:00:00-03:00`);
        const existingId = seen.get(patient.name.toLowerCase());
        if (existingId) {
          const aligned = await tx.update(patientPackagesTable).set({ paidAt })
            .where(and(
              eq(patientPackagesTable.clientId, existingId),
              like(patientPackagesTable.name, "Plano de %"),
              eq(patientPackagesTable.paymentStatus, "pago"),
              sql`${patientPackagesTable.paidAt} is distinct from ${paidAt.toISOString()}::timestamptz`,
            )).returning({ id: patientPackagesTable.id });
          paymentDatesAligned += aligned.length;
          continue;
        }
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
        seen.set(patient.name.toLowerCase(), client.id);
        created++;
      }
    }
    return { created, removedDuplicates, paymentDatesAligned, owners: owners.length };
  });
  logger.info(summary, "Active patient import finished");
}
