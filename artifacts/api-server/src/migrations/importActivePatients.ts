import { and, eq } from "drizzle-orm";
import { clientsTable, clinicMembersTable, clinicsTable, db, patientPackagesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import patients from "./activePatients.json" with { type: "json" };

/**
 * One-time, idempotent import of the clinic's active patients and their plans
 * (from the "Migração de Pacientes Ativos" spreadsheet). Enabled only when
 * CLINIC_IMPORT_ACTIVE_PATIENTS=true. Existing patients (same name for the same
 * owner) are never duplicated or modified.
 */
export async function importActivePatients() {
  if (process.env.CLINIC_IMPORT_ACTIVE_PATIENTS?.trim().toLowerCase() !== "true") return;
  const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
  if (clinics.length !== 1) {
    logger.warn({ clinics: clinics.length }, "Active patient import skipped: expected exactly one clinic");
    return;
  }
  const clinicId = clinics[0].id;
  const owners = await db.select({ userId: clinicMembersTable.userId }).from(clinicMembersTable)
    .where(and(eq(clinicMembersTable.clinicId, clinicId), eq(clinicMembersTable.role, "owner")));
  let created = 0;
  for (const owner of owners) {
    const existing = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable)
      .where(and(eq(clientsTable.clinicId, clinicId), eq(clientsTable.userId, owner.userId)));
    const known = new Set(existing.map((client) => client.name.trim().toLowerCase()));
    for (const patient of patients) {
      if (known.has(patient.name.toLowerCase())) continue;
      await db.transaction(async (tx) => {
        const [client] = await tx.insert(clientsTable).values({
          userId: owner.userId,
          clinicId,
          name: patient.name,
          phone: patient.phone || null,
          notes: patient.notes ? `Migração: ${patient.notes}` : null,
        }).returning({ id: clientsTable.id });
        const startedAt = new Date(`${patient.startedAt}T12:00:00-03:00`);
        await tx.insert(patientPackagesTable).values({
          userId: owner.userId,
          clientId: client.id,
          name: `Plano de ${patient.totalSessions} sessões`,
          totalSessions: patient.totalSessions,
          completedSessions: patient.completedSessions,
          price: patient.price.toFixed(2),
          paymentStatus: patient.paymentStatus,
          status: "ativo",
          startedAt,
          paidAt: patient.paymentStatus === "pago" ? startedAt : null,
        });
      });
      created++;
    }
  }
  logger.info({ created, owners: owners.length }, "Active patient import finished");
}
