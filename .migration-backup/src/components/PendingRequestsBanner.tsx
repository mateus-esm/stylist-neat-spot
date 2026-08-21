import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onChange?: () => void;
}

const PendingRequestsBanner = ({ onChange }: Props) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("status", "solicitado")
      .order("appointment_date")
      .order("appointment_time");
    setRequests(data || []);
  };

  useEffect(() => {
    fetchRequests();
    const channel = supabase
      .channel("pending-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchRequests)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const approve = async (a: any) => {
    setBusy(a.id);
    const { error } = await supabase
      .from("appointments")
      .update({ status: "confirmado" })
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      await supabase
        .from("availability_slots")
        .update({ status: "reservado", appointment_id: a.id })
        .eq("slot_date", a.appointment_date)
        .eq("start_time", a.appointment_time);
      toast.success("Agendamento aprovado");
    }
    setBusy(null);
    fetchRequests();
    onChange?.();
  };

  const reject = async (a: any) => {
    setBusy(a.id);
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelado" })
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      await supabase
        .from("availability_slots")
        .update({ status: "aberto", appointment_id: null })
        .eq("appointment_id", a.id);
      toast.success("Solicitação recusada");
    }
    setBusy(null);
    fetchRequests();
    onChange?.();
  };

  if (requests.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {requests.length} {requests.length === 1 ? "horário solicitado" : "horários solicitados"}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-primary/20 divide-y divide-border/40">
          {requests.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{a.client_name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {format(new Date(a.appointment_date + "T12:00:00"), "EEE dd/MM", { locale: ptBR })} •{" "}
                  {a.appointment_time?.slice(0, 5)} • {a.service}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject(a)}
                disabled={busy === a.id}
                className="h-8 px-2 text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => approve(a)}
                disabled={busy === a.id}
                className="h-8 px-2 bg-primary text-primary-foreground"
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingRequestsBanner;
