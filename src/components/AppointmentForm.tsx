import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

interface ServiceOpt {
  id: string;
  name: string;
  default_duration_min: number;
  default_price: number;
}

const OTHER = "__other__";

const AppointmentForm = ({ open, onOpenChange, onSuccess, appointment, selectedDate }: AppointmentFormProps) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [packageId, setPackageId] = useState("avulso");
  const [serviceChoice, setServiceChoice] = useState<string>("");
  const [serviceText, setServiceText] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [duration, setDuration] = useState("50");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    fetchPatients();
    fetchServices();
    if (appointment) {
      setClientId(appointment.client_id || "");
      setClientName(appointment.client_name);
      setPackageId(appointment.package_id || "avulso");
      setTime(appointment.appointment_time?.slice(0, 5) || "");
      setServiceText(appointment.service);
      setServiceChoice(OTHER);
      setPrice(String(appointment.price));
      setDate(appointment.appointment_date);
      setDuration(String(appointment.duration_min || 50));
      if (appointment.client_id) fetchPackages(appointment.client_id);
    } else {
      setClientId("");
      setClientName("");
      setPackageId("avulso");
      setTime("");
      setServiceChoice("");
      setServiceText("");
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

  const fetchServices = async () => {
    const { data } = await db.from("services").select("*").eq("active", true).order("name");
    setServices(data || []);
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

  const handleServiceChange = (value: string) => {
    setServiceChoice(value);
    if (value === OTHER || value === "") {
      return;
    }
    const svc = services.find((s) => s.id === value);
    if (svc) {
      setServiceText(svc.name);
      setDuration(String(svc.default_duration_min));
      if (packageId === "avulso") setPrice(String(svc.default_price));
    }
  };

  const linkedToPackage = packageId !== "avulso" && packageId !== "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const selectedPackage = packages.find((pkg) => pkg.id === packageId);
    const finalService = linkedToPackage
      ? (selectedPackage?.service || selectedPackage?.name || serviceText.trim() || "Sessão de pacote")
      : serviceText.trim();

    if (!linkedToPackage && !finalService) {
      toast({ title: "Informe o serviço", variant: "destructive" });
      return;
    }
    setLoading(true);

    const nextPackageIndex = selectedPackage ? Number(selectedPackage.completed_sessions || 0) + 1 : null;

    const data = {
      user_id: user.id,
      client_id: clientId || null,
      client_name: clientName,
      appointment_date: date,
      appointment_time: time,
      service: finalService,
      price: linkedToPackage ? 0 : (parseFloat(price) || 0),
      payment_status: linkedToPackage ? "pago" : (appointment?.payment_status || "pendente"),
      duration_min: parseInt(duration) || 50,
      package_id: selectedPackage?.id || null,
      package_session_index: nextPackageIndex,
      package_total: selectedPackage ? Number(selectedPackage.total_sessions || 0) : null,
    };

    if (appointment) {
      const { error } = await db.from("appointments").update(data).eq("id", appointment.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Sessão atualizada" });
    } else {
      const { error } = await db.from("appointments").insert(data);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Sessão agendada" });
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Editar sessão" : "Nova sessão"}</DialogTitle>
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
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Nome do paciente" value={clientName} onChange={(e) => setClientName(e.target.value)} required className="rounded-sm" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Horário</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="rounded-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Input type="number" min="5" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required className="rounded-sm" />
            </div>
          </div>

          {!linkedToPackage && (
            <div className="space-y-2">
              <Label>Tipo de serviço</Label>
              <Select value={serviceChoice} onValueChange={handleServiceChange}>
                <SelectTrigger className="rounded-sm">
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Outro (texto livre)</SelectItem>
                </SelectContent>
              </Select>
              {(serviceChoice === OTHER || services.length === 0) && (
                <Input
                  placeholder="Descrição do serviço"
                  value={serviceText}
                  onChange={(e) => setServiceText(e.target.value)}
                  className="rounded-sm"
                />
              )}
            </div>
          )}

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
                    {pkg.name} — sessão {Number(pkg.completed_sessions || 0) + 1} de {pkg.total_sessions}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!linkedToPackage && (
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} required className="rounded-sm" />
            </div>
          )}

          <Button type="submit" className="w-full rounded-sm" disabled={loading}>
            {loading ? "Salvando..." : appointment ? "Salvar" : "Agendar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentForm;
