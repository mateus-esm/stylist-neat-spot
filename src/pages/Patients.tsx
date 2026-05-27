import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Phone, Edit3, ClipboardList, Activity, PackagePlus, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import ClientForm from "@/components/ClientForm";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const db = supabase as any;

const emptyAnamnesis = {
  health_history: "",
  underlying_conditions: "",
  past_surgeries: "",
  primary_complaints: "",
};

const Patients = () => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, { total: number; last: string | null }>>({});
  const [anamnesis, setAnamnesis] = useState(emptyAnamnesis);
  const [packageName, setPackageName] = useState("Reabilitacao pos-operatoria - 12 sessoes");
  const [packageSessions, setPackageSessions] = useState("12");
  const [packagePrice, setPackagePrice] = useState("");
  const [packagePaymentStatus, setPackagePaymentStatus] = useState<"pago" | "pendente">("pendente");
  const [saving, setSaving] = useState(false);

  const fetchPatients = async () => {
    if (!user) return;

    let query = db.from("clients").select("*").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data } = await query;
    setPatients(data || []);

    const { data: appointments } = await db
      .from("appointments")
      .select("client_id, appointment_date, status")
      .eq("status", "atendido");

    const nextStats: Record<string, { total: number; last: string | null }> = {};
    appointments?.forEach((appointment: any) => {
      if (!appointment.client_id) return;
      if (!nextStats[appointment.client_id]) nextStats[appointment.client_id] = { total: 0, last: null };
      nextStats[appointment.client_id].total += 1;
      if (!nextStats[appointment.client_id].last || appointment.appointment_date > nextStats[appointment.client_id].last) {
        nextStats[appointment.client_id].last = appointment.appointment_date;
      }
    });
    setStats(nextStats);
  };

  const fetchProfile = async (patient: any) => {
    setSelectedPatient(patient);
    setAnamnesis({
      health_history: patient.health_history || "",
      underlying_conditions: patient.underlying_conditions || "",
      past_surgeries: patient.past_surgeries || "",
      primary_complaints: patient.primary_complaints || "",
    });
    setSheetOpen(true);

    const [{ data: appointmentHistory }, { data: packageRows }] = await Promise.all([
      db
        .from("appointments")
        .select("*")
        .eq("client_id", patient.id)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(40),
      db
        .from("patient_packages")
        .select("*")
        .eq("client_id", patient.id)
        .order("created_at", { ascending: false }),
    ]);

    setHistory(appointmentHistory || []);
    setPackages(packageRows || []);
  };

  useEffect(() => {
    fetchPatients();
  }, [user, search]);

  const activePackages = useMemo(() => packages.filter((pkg) => pkg.status === "ativo"), [packages]);

  const saveAnamnesis = async () => {
    if (!selectedPatient) return;
    setSaving(true);
    const { error } = await db.from("clients").update(anamnesis).eq("id", selectedPatient.id);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar anamnese", { description: error.message });
    toast.success("Anamnese atualizada");
    const updated = { ...selectedPatient, ...anamnesis };
    setSelectedPatient(updated);
    setPatients((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
  };

  const createPackage = async () => {
    if (!user || !selectedPatient) return;
    setSaving(true);
    const { error } = await db.from("patient_packages").insert({
      user_id: user.id,
      client_id: selectedPatient.id,
      name: packageName,
      total_sessions: parseInt(packageSessions) || 1,
      completed_sessions: 0,
      price: parseFloat(packagePrice) || 0,
      payment_status: packagePaymentStatus,
      status: "ativo",
      started_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) return toast.error("Erro ao registrar pacote", { description: error.message });
    toast.success("Pacote registrado");
    setPackageName("Reabilitacao pos-operatoria - 12 sessoes");
    setPackageSessions("12");
    setPackagePrice("");
    setPackagePaymentStatus("pendente");
    await fetchProfile(selectedPatient);
  };

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="flex items-center justify-between">
            <BrandLogo size="sm" />
            <Badge variant="outline" className="rounded-sm text-[10px] uppercase tracking-wider">
              {patients.length} pacientes
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-sm bg-card pl-9"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-2 px-4 pt-4">
        {patients.length === 0 ? (
          <Card className="rounded-sm border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum paciente cadastrado
            </CardContent>
          </Card>
        ) : (
          patients.map((patient) => {
            const patientStats = stats[patient.id] || { total: 0, last: null };
            return (
              <button
                key={patient.id}
                onClick={() => fetchProfile(patient)}
                className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-sm border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-foreground text-sm font-semibold text-background">
                  {patient.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{patient.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {patient.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {patient.phone}
                      </span>
                    )}
                    <span>{patientStats.last ? `Ultima sessao ${format(new Date(`${patientStats.last}T12:00:00`), "dd/MM/yyyy")}` : "Sem sessoes"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">{patientStats.total}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">sessoes</p>
                </div>
              </button>
            );
          })
        )}
      </main>

      <Button
        onClick={() => {
          setEditingPatient(null);
          setFormOpen(true);
        }}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-sm bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-border sm:max-w-2xl">
          {selectedPatient && (
            <>
              <SheetHeader className="text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="text-2xl">{selectedPatient.name}</SheetTitle>
                    <SheetDescription>
                      Prontuario clinico, pacotes ativos e linha do tempo de evolucoes.
                    </SheetDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedPatient.auth_user_id ? (
                      <Badge variant="outline" className="rounded-sm gap-1"><CheckCircle2 className="h-3 w-3" /> Acesso ativo</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const email = prompt("Email do paciente para enviar o convite:");
                          if (!email) return;
                          const { data, error } = await supabase.functions.invoke("invite-patient", { body: { client_id: selectedPatient.id, email } });
                          if (error || (data as any)?.error) return toast.error((data as any)?.error ?? error?.message ?? "Falha");
                          toast.success("Convite enviado");
                          await fetchProfile({ ...selectedPatient, auth_user_id: (data as any).user_id });
                        }}
                        className="rounded-sm gap-1"
                      ><Mail className="h-4 w-4" /> Convidar</Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setEditingPatient(selectedPatient);
                        setFormOpen(true);
                      }}
                      className="rounded-sm"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </div>

              <Tabs defaultValue="anamnesis" className="mt-6">
                <TabsList className="grid w-full grid-cols-3 rounded-sm">
                  <TabsTrigger value="anamnesis" className="rounded-sm">Anamnese</TabsTrigger>
                  <TabsTrigger value="packages" className="rounded-sm">Pacotes</TabsTrigger>
                  <TabsTrigger value="history" className="rounded-sm">Historico</TabsTrigger>
                </TabsList>

                <TabsContent value="anamnesis" className="mt-5 space-y-4">
                  {[
                    ["Historico de saude", "health_history"],
                    ["Condicoes de base", "underlying_conditions"],
                    ["Cirurgias previas", "past_surgeries"],
                    ["Queixas principais", "primary_complaints"],
                  ].map(([label, field]) => (
                    <div key={field} className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                      <Textarea
                        value={(anamnesis as any)[field]}
                        onChange={(event) => setAnamnesis((current) => ({ ...current, [field]: event.target.value }))}
                        rows={3}
                        className="rounded-sm"
                      />
                    </div>
                  ))}
                  <Button onClick={saveAnamnesis} disabled={saving} className="w-full rounded-sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar anamnese"}
                  </Button>
                </TabsContent>

                <TabsContent value="packages" className="mt-5 space-y-5">
                  <section className="space-y-3 rounded-sm border border-border p-3">
                    <div className="flex items-center gap-2">
                      <PackagePlus className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Novo pacote</h3>
                    </div>
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Input value={packageName} onChange={(event) => setPackageName(event.target.value)} className="rounded-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Sessoes</Label>
                        <Input type="number" min="1" value={packageSessions} onChange={(event) => setPackageSessions(event.target.value)} className="rounded-sm" />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor</Label>
                        <Input type="number" min="0" step="0.01" value={packagePrice} onChange={(event) => setPackagePrice(event.target.value)} className="rounded-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status financeiro</Label>
                      <Select value={packagePaymentStatus} onValueChange={(value: "pago" | "pendente") => setPackagePaymentStatus(value)}>
                        <SelectTrigger className="rounded-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={createPackage} disabled={saving} className="w-full rounded-sm">
                      Registrar pacote
                    </Button>
                  </section>

                  <section className="space-y-2">
                    {packages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum pacote registrado.</p>
                    ) : (
                      packages.map((pkg) => {
                        const total = Number(pkg.total_sessions) || 1;
                        const completed = Number(pkg.completed_sessions) || 0;
                        const progress = Math.min(100, Math.round((completed / total) * 100));
                        return (
                          <div key={pkg.id} className="rounded-sm border border-border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{pkg.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Sessao {completed} de {total} executada
                                </p>
                              </div>
                              <Badge variant={pkg.payment_status === "pendente" ? "outline" : "default"} className="rounded-sm">
                                {pkg.payment_status}
                              </Badge>
                            </div>
                            <div className="mt-3 h-2 rounded-sm bg-secondary">
                              <div className="h-full rounded-sm bg-primary" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </section>
                </TabsContent>

                <TabsContent value="history" className="mt-5">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem evolucoes registradas.</p>
                  ) : (
                    <ol className="space-y-2 border-l border-border pl-4">
                      {history.map((appointment) => (
                        <li key={appointment.id} className="relative pb-3">
                          <span
                            className={cn(
                              "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full",
                              appointment.status === "atendido" ? "bg-primary" : "bg-muted-foreground"
                            )}
                          />
                          <div className="grid grid-cols-[1fr_auto] gap-3">
                            <div>
                              <p className="text-sm font-medium">{appointment.service}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(`${appointment.appointment_date}T12:00:00`), "dd MMM yyyy", { locale: ptBR })} as {appointment.appointment_time?.slice(0, 5)}
                              </p>
                              {appointment.observations && <p className="mt-1 text-xs text-muted-foreground">{appointment.observations}</p>}
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="rounded-sm">{appointment.status}</Badge>
                              <p className="mt-1 text-xs font-semibold tabular-nums">R$ {Number(appointment.price || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>

              {activePackages.length > 0 && (
                <div className="mt-6 flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 p-3 text-xs">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>{activePackages.length} pacote(s) ativo(s) disponiveis para vincular na evolucao.</span>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <ClientForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchPatients}
        client={editingPatient}
      />
    </div>
  );
};

export default Patients;
