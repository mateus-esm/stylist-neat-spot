import { supabase } from "@/integrations/supabase/client";

export async function completeAppointment(appointmentId: string, details: Record<string, unknown> = {}) {
  const { error } = await supabase.from("appointments")
    .update({ ...details, status: "atendido" }).eq("id", appointmentId);
  return { error: error?.message };
}
