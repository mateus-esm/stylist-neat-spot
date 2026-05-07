import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  appointment?: any;
  selectedDate: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
}

const AppointmentForm = ({ open, onOpenChange, onSuccess, appointment, selectedDate }: AppointmentFormProps) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [time, setTime] = useState("");
  const [service, setService] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [duration, setDuration] = useState("30");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchClients();
      if (appointment) {
        setClientId(appointment.client_id || "");
        setClientName(appointment.client_name);
        setTime(appointment.appointment_time?.slice(0, 5) || "");
        setService(appointment.service);
        setPrice(String(appointment.price));
        setDate(appointment.appointment_date);
        setDuration(String(appointment.duration_min || 30));
      } else {
        setClientId("");
        setClientName("");
        setTime("");
        setService("");
        setPrice("");
        setDate(selectedDate);
        setDuration("30");
      }
    }
  }, [open, appointment, user, selectedDate]);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("id, name, phone").order("name");
    if (data) setClients(data);
  };

  const handleClientSelect = (id: string) => {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client) setClientName(client.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const data = {
      user_id: user.id,
      client_id: clientId || null,
      client_name: clientName,
      appointment_date: date,
      appointment_time: time,
      service,
      price: parseFloat(price) || 0,
      duration_min: parseInt(duration) || 30,
    };

    if (appointment) {
      const { error } = await supabase.from("appointments").update(data).eq("id", appointment.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Agendamento atualizado!" });
    } else {
      const { error } = await supabase.from("appointments").insert(data);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Agendamento criado!" });
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{appointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            {clients.length > 0 ? (
              <Select value={clientId} onValueChange={handleClientSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Nome do cliente"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            )}
            {clients.length > 0 && !clientId && (
              <Input
                placeholder="Ou digite o nome"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Input type="number" min="5" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Serviço</Label>
            <Input placeholder="Ex: Corte, Barba..." value={service} onChange={(e) => setService(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min="0" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : appointment ? "Salvar" : "Agendar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentForm;
