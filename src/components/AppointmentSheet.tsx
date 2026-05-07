import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Phone, MessageCircle, Check, X, Clock, Edit3, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: any;
  onComplete: () => void;
  onEdit: () => void;
  onLog: () => void;
  onRefresh: () => void;
}

const AppointmentSheet = ({ open, onOpenChange, appointment, onComplete, onEdit, onLog, onRefresh }: Props) => {
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    if (open && appointment?.client_id) {
      supabase.from("clients").select("*").eq("id", appointment.client_id).maybeSingle().then(({ data }) => setClient(data));
    } else {
      setClient(null);
    }
  }, [open, appointment]);

  if (!appointment) return null;

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appointment.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    onRefresh();
    onOpenChange(false);
  };

  const remove = async () => {
    if (!confirm("Excluir este agendamento?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    onRefresh();
    onOpenChange(false);
  };

  const notify = () => {
    const phone = client?.phone?.replace(/\D/g, "");
    if (!phone) return toast.error("Cliente sem telefone");
    const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const msg = encodeURIComponent(
      `Olá ${appointment.client_name}! Confirmando seu horário às ${appointment.appointment_time?.slice(0, 5)} no dia ${format(new Date(appointment.appointment_date + "T12:00:00"), "dd/MM")}. ✂️`
    );
    window.open(`https://wa.me/${fullPhone}?text=${msg}`, "_blank");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border/60 sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl">{appointment.client_name}</SheetTitle>
          <p className="text-sm text-muted-foreground capitalize">
            {format(new Date(appointment.appointment_date + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })} • {appointment.appointment_time?.slice(0, 5)}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary">
              {appointment.service}
            </Badge>
            <Badge variant="outline">{appointment.duration_min || 30} min</Badge>
            <Badge className="bg-gradient-brand text-primary-foreground">
              R$ {Number(appointment.price).toFixed(2)}
            </Badge>
          </div>

          {client?.notes && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs uppercase tracking-wider text-warning mb-1">⚠ Observações do cliente</p>
              <p className="text-sm">{client.notes}</p>
            </div>
          )}

          {appointment.photo_url && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Foto do corte</p>
              <img src={appointment.photo_url} alt="Corte" className="w-full rounded-lg" />
            </div>
          )}

          {appointment.satisfaction && (
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map((n) => (
                <Star key={n} className={cn("h-5 w-5", n <= appointment.satisfaction ? "fill-accent text-accent" : "text-muted")} />
              ))}
            </div>
          )}

          {client?.phone && (
            <div className="flex items-center gap-2 rounded-lg bg-secondary/40 p-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{client.phone}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={notify} variant="outline" className="gap-2">
              <MessageCircle className="h-4 w-4" /> Notificar
            </Button>
            <Button onClick={onEdit} variant="outline" className="gap-2">
              <Edit3 className="h-4 w-4" /> Editar
            </Button>
          </div>

          {appointment.status !== "atendido" && (
            <Button
              onClick={onLog}
              className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90"
              size="lg"
            >
              <Check className="h-5 w-5 mr-2" /> Marcar como atendido
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {appointment.status !== "confirmado" && appointment.status !== "atendido" && (
              <Button onClick={() => updateStatus("confirmado")} variant="outline" className="gap-2">
                <Clock className="h-4 w-4" /> Confirmar
              </Button>
            )}
            {appointment.status !== "faltou" && appointment.status !== "atendido" && (
              <Button onClick={() => updateStatus("faltou")} variant="outline" className="gap-2 text-destructive">
                <X className="h-4 w-4" /> Faltou
              </Button>
            )}
          </div>

          <Button onClick={remove} variant="ghost" className="w-full text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Excluir agendamento
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AppointmentSheet;