import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/**
 * Realistic end-date forecast for a package.
 * Priority:
 *   1. If there are scheduled future appointments linked to the package,
 *      use the date of the Nth future session (N = remaining).
 *   2. Otherwise, use the patient's return_days cadence (default 7).
 */
export async function forecastPackageEnd(pkg: {
  id: string;
  client_id: string;
  total_sessions: number;
  completed_sessions: number;
}): Promise<Date | null> {
  const remaining = Math.max(0, Number(pkg.total_sessions) - Number(pkg.completed_sessions));
  if (remaining <= 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { data: future } = await db
    .from("appointments")
    .select("appointment_date")
    .eq("package_id", pkg.id)
    .gte("appointment_date", today)
    .neq("status", "cancelado")
    .order("appointment_date", { ascending: true });

  if (future && future.length >= remaining) {
    const last = future[remaining - 1];
    return new Date(`${last.appointment_date}T12:00:00`);
  }

  // Fallback: patient cadence
  const { data: client } = await db
    .from("clients")
    .select("return_days")
    .eq("id", pkg.client_id)
    .maybeSingle();

  const cadence = Number(client?.return_days) || 7;
  return addDays(new Date(), remaining * cadence);
}
