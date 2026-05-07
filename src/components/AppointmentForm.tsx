import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  appointment?: any;
  selectedDate: string;
}

interface Patient {
  id: string;
  name: string;
  phone: string | null;
}

const AppointmentForm = ({ open, onOpenChange, onSuccess, appointment, selectedDate }: AppointmentFormProps) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [packageId, setPackageId] = useState("avulso");
  const [time, setTime] = useState("");
  const [service, setService] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [duration, setDuration] = useState("50");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;

    fetchPatients();
    if (appointment) {
      setClientId(appointment.client_id || "");
      setClientName(appointment.client_name);
      setPackageId(appointment.package_id || "avulso");
      setTime(appointment.appointment_time?.slice(0, 5) || "");
      setService(appointment.service);
      setPrice(String(appointment.price));
      setDate(appointment.appointment_date);
      setDuration(String(appointment.duration_min || 50));
      if (appointment.client_id) fetchPackages(appointment.client_id);
    } else {
      setClientId("");
      setClientName("");
      setPackageId("avulso");
      setTime("");
      setService("Sessao de fisioterapia");
      setPrice("");
      setDate(selectedDate);
      setDuration("50");
      setPackages([]);
    }
  }, [open, appointment, user, selectedDate]);

  const fetchPatients = async () => {
    const { data } = await db.from("clients").select("id, name, phone").order("name");
    if (data) setPatients(data);
  };

  const fetchPackages = async (patientId: string) => {
    const { data } = await db
      .from("patient_packages")
      .select("*")
      .eq("client_id", patientId)
      .eq("status", "ativo")
      .order("created_at", { ascending: false });
    setPackages(data || []);
  };

  const handlePatientSelect = async (id: string) => {
    setClientId(id);
    const patient = patients.find((row) => row.id === id);
    if (patient) setClientName(patient.name);
    setPackageId("avulso");
    await fetchPackages(id);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setLoading(true);

    const selectedPackage = packages.find((pkg) => pkg.id === packageId);
    const nextPackageIndex = selectedPackage ? Number(selectedPackage.completed_sessions || 0) + 1 : null;
    const data = {
      user_id: user.id,
      client_id: clientId || null,
      client_name: clientName,
      appointment_date: date,
      appointment_time: time,
      service,
      price: parseFloat(price) || 0,
      duration_min: parseInt(duration) || 50,
      package_id: selectedPackage?.id || null,
      package_session_index: nextPackageIndex,
      package_total: selectedPackage ? Number(selectedPackage.total_sessions || 0) : null,
    };

    if (appointment) {
      const { error } = await db.from("appointments").update(data).eq("id", appointment.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Sessao atualizada" });
    } else {
      const { error } = await db.from("appointments").insert(data);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Sessao agendada" });
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-sm">
        <DialogHeader>
          <DialogTitle>{appointment ? "Editar sessao" : "Nova sessao"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente</Label>
            {patients.length > 0 ? (
              <Select value={clientId} onValueChange={handlePatientSelect}>
                <SelectTrigger className="rounded-sm">
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>{patient.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Nome do paciente"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                required
                className="rounded-sm"
              />
            )}
            {patients.length > 0 && !clientId && (
              <Input
                placeholder="Ou digite o nome"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                className="rounded-sm"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Horario</Label>
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} required className="rounded-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label>Duracao (min)</Label>
              <Input type="number" min="5" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} required className="rounded-sm" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Evolucao / Sessao</Label>
            <Input
              placeholder="Ex: Reabilitacao de joelho, LCA fase 2"
              value={service}
              onChange={(event) => setService(event.target.value)}
              required
              className="rounded-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Plano vinculado</Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!clientId || packages.length === 0}>
              <SelectTrigger className="rounded-sm">
                <SelectValue placeholder="Avulso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avulso">Avulso</SelectItem>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} - sessao {Number(pkg.completed_sessions || 0) + 1} de {pkg.total_sessions}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min="0" placeholder="0,00" value={price} onChange={(event) => setPrice(event.target.value)} required className="rounded-sm" />
          </div>

          <Button type="submit" className="w-full rounded-sm" disabled={loading}>
            {loading ? "Salvando..." : appointment ? "Salvar" : "Agendar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentForm;
