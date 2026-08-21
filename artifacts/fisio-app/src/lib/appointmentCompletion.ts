import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/**
 * Marks an appointment as 'atendido' and, when linked to a package,
 * increments the package's completed_sessions counter idempotently.
 * If the package reaches its total, status becomes 'concluido' and
 * finished_at is stamped. Returns { error } on failure.
 */
export async function completeAppointment(appointmentId: string): Promise<{ error?: string }> {
  const { data: appt, error: fetchErr } = await db
    .from("appointments")
    .select("id, status, package_id, package_session_index, payment_status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!appt) return { error: "Sessão não encontrada" };

  // Update status. For avulsos (no package), mark as paid too —
  // "atendido = recebido" in this clinic; package sessions don't touch payment.
  const wasAlreadyDone = appt.status === "atendido";
  if (!wasAlreadyDone) {
    const update: any = { status: "atendido" };
    if (!appt.package_id && appt.payment_status !== "pago") {
      update.payment_status = "pago";
    }
    const { error } = await db
      .from("appointments")
      .update(update)
      .eq("id", appointmentId);
    if (error) return { error: error.message };
  }

  // Increment package counter (idempotent)
  if (appt.package_id) {
    const { data: pkg, error: pkgErr } = await db
      .from("patient_packages")
      .select("id, completed_sessions, total_sessions")
      .eq("id", appt.package_id)
      .maybeSingle();
    if (pkgErr) return { error: pkgErr.message };

    if (pkg) {
      const completed = Number(pkg.completed_sessions || 0);
      const total = Number(pkg.total_sessions || 0);

      // Count atendido sessions tied to this package; this is the truth.
      const { count } = await db
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkg.id)
        .eq("status", "atendido");

      const nextCompleted = Math.min(total || (count || 0), count || 0);
      if (nextCompleted !== completed) {
        const isFinished = total > 0 && nextCompleted >= total;
        const { error: upErr } = await db
          .from("patient_packages")
          .update({
            completed_sessions: nextCompleted,
            status: isFinished ? "concluido" : "ativo",
            finished_at: isFinished ? new Date().toISOString() : null,
          })
          .eq("id", pkg.id);
        if (upErr) return { error: upErr.message };
      }
    }
  }

  return {};
}
