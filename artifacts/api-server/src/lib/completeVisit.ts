import { and, eq, isNull, or } from "drizzle-orm";
import { db, appointmentsTable, clinicAssignmentsTable, clinicAuditEventsTable, patientPackagesTable } from "@workspace/db";
import { z } from "zod";

const completion = z.object({
  durationMin: z.coerce.number().int().positive().max(1440).optional(),
  painScale: z.number().int().min(0).max(10).nullable().optional(),
  observations: z.string().nullable().optional(), evolutionNotes: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(), photoUrl: z.string().nullable().optional(),
  price: z.coerce.number().nonnegative().finite().optional(),
  paymentStatus: z.enum(["pago", "pendente"]).optional(),
  packageId: z.string().uuid().nullable().optional(),
});

export async function completeVisit(id: string, userId: string, clinicId: string, isManager: boolean, input: Record<string, unknown>) {
  const parsed = completion.safeParse(input);
  if (!parsed.success) return { status: 400, error: "Confira duração, dor, valor e pacote antes de concluir." } as const;
  const { price, paymentStatus, packageId, ...clinical } = parsed.data;
  return db.transaction(async (tx) => {
    const [visit] = await tx.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, id),
      or(eq(appointmentsTable.clinicId, clinicId), and(isNull(appointmentsTable.clinicId), eq(appointmentsTable.userId, userId))),
      isManager ? eq(appointmentsTable.userId, userId) : undefined)).for("update");
    if (!visit) return { status: 404, error: "Sessão indisponível." } as const;
    if (!isManager && visit.assignedToUserId !== userId) {
      const [assigned] = visit.clientId ? await tx.select({ id: clinicAssignmentsTable.id }).from(clinicAssignmentsTable)
        .where(and(eq(clinicAssignmentsTable.clientId, visit.clientId), eq(clinicAssignmentsTable.clinicId, clinicId),
          eq(clinicAssignmentsTable.physiotherapistUserId, userId), eq(clinicAssignmentsTable.status, "active"))) : [];
      if (!assigned) return { status: 404, error: "Sessão indisponível." } as const;
    }
    if (visit.status === "atendido") return { status: 200, visit } as const;
    if (!["agendado", "confirmado", "presenca_confirmada", "em_andamento"].includes(visit.status)) {
      return { status: 409, error: "Confira a situação da sessão antes de concluir." } as const;
    }
    const linkedId = isManager && packageId !== undefined ? packageId : visit.packageId;
    let index: number | null = null;
    let total: number | null = null;
    if (linkedId) {
      const [pkg] = visit.clientId ? await tx.select().from(patientPackagesTable)
        .where(and(eq(patientPackagesTable.id, linkedId), eq(patientPackagesTable.clientId, visit.clientId),
          eq(patientPackagesTable.userId, visit.userId))).for("update") : [];
      if (!pkg || pkg.status !== "ativo" || pkg.completedSessions >= pkg.totalSessions) {
        return { status: 409, error: "O pacote não possui sessões disponíveis para este paciente." } as const;
      }
      index = pkg.completedSessions + 1;
      total = pkg.totalSessions;
      await tx.update(patientPackagesTable).set({
        completedSessions: index, status: index === total ? "concluido" : "ativo",
        finishedAt: index === total ? new Date() : null,
      }).where(eq(patientPackagesTable.id, pkg.id));
    }
    const [updated] = await tx.update(appointmentsTable).set({
      ...clinical, status: "atendido", packageId: linkedId, packageSessionIndex: index, packageTotal: total,
      price: linkedId ? "0" : isManager && price !== undefined ? price.toFixed(2) : visit.price,
      paymentStatus: linkedId ? "pago" : isManager && paymentStatus ? paymentStatus : visit.paymentStatus,
    }).where(eq(appointmentsTable.id, visit.id)).returning();
    await tx.insert(clinicAuditEventsTable).values({
      clinicId, actorUserId: userId, action: "appointment.completed", resourceType: "appointment", resourceId: id,
      metadata: { packageId: linkedId, packageSessionIndex: index, paymentStatus: updated.paymentStatus },
    });
    return { status: 200, visit: updated } as const;
  });
}
