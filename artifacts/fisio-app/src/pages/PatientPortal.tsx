import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { createClinicBooking } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarPlus, ChevronRight, LogOut } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const PatientPortal = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: cli } = await db.from("clients").select("*").eq("auth_user_id", user.id).maybeSingle();
    setClient(cli);
    if (!cli) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: appts }, { data: pkgs }, { data: openSlots }] = await Promise.all([
      db.from("appointments").select("*").eq("client_id", cli.id).order("appointment_date", { ascending: false }).order("appointment_time", { ascending: false }).limit(20),
      db.from("patient_packages").select("*").eq("client_id", cli.id).order("created_at", { ascending: false }),
      db.from("availability_slots").select("*").eq("status", "aberto").gte("slot_date", today).order("slot_date").order("start_time").limit(30),
    ]);
    setAppointments(appts || []);
    setPackages(pkgs || []);
    setSlots(openSlots || []);
  };

  useEffect(() => { load(); }, [user]);

  const requestSlot = async (slot: any) => {
    if (!client) return;
    // Atomic booking: creates the "solicitado" appointment and reserves the
    // slot in a single server transaction (race-safe).
    try {
      await createClinicBooking({ slotId: slot.id });
    } catch (error: any) {
      const message =
        error?.status === 409
          ? "Este horario acabou de ser reservado. Escolha outro."
          : error?.message || "Nao foi possivel solicitar o horario.";
      toast.error(message);
      return;
    }

    toast.success("Horario solicitado. Aguarde confirmacao.");
    setRequestOpen(false);
    load();
  };

  const upcoming = appointments.filter((a) => a.status !== "atendido" && a.appointment_date >= format(new Date(), "yyyy-MM-dd"));
  const past = appointments.filter((a) => a.status === "atendido").slice(0, 5);
  const activePackage = packages.find((p) => p.status === "ativo");

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Ola</p>
          <h1 className="text-2xl font-semibold">{client?.name ?? "Paciente"}</h1>
        </div>

        {activePackage && (
          <Card className="rounded-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Pacote ativo</p>
                  <p className="text-sm font-semibold">{activePackage.name}</p>
                </div>
                <Badge variant="outline" className="rounded-sm">{activePackage.completed_sessions}/{activePackage.total_sessions}</Badge>
              </div>
              <Progress value={(activePackage.completed_sessions / activePackage.total_sessions) * 100} className="h-2" />
            </CardContent>
          </Card>
        )}

        <Button onClick={() => setRequestOpen(true)} className="w-full rounded-sm gap-2">
          <CalendarPlus className="h-4 w-4" /> Solicitar sessao
        </Button>

        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Proximas sessoes</p>
          {upcoming.length === 0 ? (
            <Card className="rounded-sm border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground">Sem sessoes agendadas.</CardContent></Card>
          ) : (
            upcoming.map((a) => (
              <button key={a.id} onClick={() => navigate(`/meu-app/sessao/${a.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-sm border border-border bg-card p-3 text-left hover:border-foreground/30">
                <div>
                  <p className="text-sm font-semibold">{format(new Date(a.appointment_date + "T12:00:00"), "EEE, dd MMM", { locale: ptBR })} · {a.appointment_time?.slice(0,5)}</p>
                  <p className="text-xs text-muted-foreground">{a.service}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === "solicitado" ? "outline" : "default"} className="rounded-sm capitalize">{a.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))
          )}
        </section>

        {past.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ultimas sessoes</p>
            {past.map((a) => (
              <button key={a.id} onClick={() => navigate(`/meu-app/sessao/${a.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-sm border border-border bg-card p-3 text-left hover:border-foreground/30">
                <div>
                  <p className="text-sm font-semibold">{format(new Date(a.appointment_date + "T12:00:00"), "dd MMM yyyy", { locale: ptBR })}</p>
                  <p className="text-xs text-muted-foreground">{a.service}{a.pain_scale != null ? ` · dor ${a.pain_scale}/10` : ""}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </section>
        )}
      </main>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm rounded-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Solicitar sessao</DialogTitle></DialogHeader>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem horarios disponiveis.</p>
          ) : (
            <div className="space-y-2">
              {slots.map((s) => (
                <button key={s.id} onClick={() => requestSlot(s)} className="w-full rounded-sm border border-border p-3 text-left hover:border-primary">
                  <p className="text-sm font-semibold capitalize">{format(new Date(s.slot_date + "T12:00:00"), "EEE, dd MMM", { locale: ptBR })}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientPortal;
