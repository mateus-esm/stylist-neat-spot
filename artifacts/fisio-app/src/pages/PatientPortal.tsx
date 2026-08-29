import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { clinicApi, type PortalData } from "@/lib/clinicApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarPlus, Check, ChevronRight, FileText, HelpCircle, LogOut, UserRound, X } from "lucide-react";
import { toast } from "sonner";

const statusLabel: Record<string, string> = {
  solicitado: "Aguardando confirmação",
  agendado: "Agendado",
  presenca_confirmada: "Presença confirmada",
  reagendamento_solicitado: "Reagendamento solicitado",
  cancelamento_solicitado: "Cancelamento solicitado",
  atendido: "Concluído",
};

const PatientPortal = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ id: string; action: "confirm_presence" | "request_reschedule" | "request_cancel" } | null>(null);
  const [whatsappOptedIn, setWhatsappOptedIn] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const portal = await clinicApi.portal();
      setData(portal);
      const consent = await clinicApi.getConsent();
      setWhatsappOptedIn(!!consent.optedIn);
    }
    catch (error: any) { toast.error(error.message || "Não foi possível carregar seu portal"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get("action");
    const id = new URLSearchParams(location.search).get("appointment");
    if (action && id && ["confirm_presence", "request_reschedule", "request_cancel"].includes(action)) {
      setConfirming({ id, action: action as any });
    }
  }, [location.search]);

  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = useMemo(() => (data?.appointments ?? []).filter((a) =>
    a.appointment_date >= today && !["atendido", "cancelado", "cancelamento_solicitado"].includes(a.status)
  ), [data, today]);
  const activePackage = data?.packages?.find((p) => p.status === "ativo");
  const plans = data?.plans ?? [];
  const exercises = data?.exercises ?? [];

  const submitAction = async () => {
    if (!confirming) return;
    try {
      await clinicApi.appointmentAction(confirming.id, {
        action: confirming.action,
        confirmed: true,
        idempotencyKey: `${confirming.action}:${confirming.id}`,
      });
      toast.success(confirming.action === "confirm_presence" ? "Presença confirmada" : confirming.action === "request_cancel" ? "Pedido de cancelamento enviado" : "Pedido de reagendamento enviado");
      setConfirming(null);
      navigate("/meu-app", { replace: true });
      await load();
    } catch (error: any) { toast.error(error.message || "Não foi possível concluir a ação"); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando seu portal...</div>;
  if (!data?.client) return <div className="p-6 text-center text-sm text-muted-foreground">Seu cadastro ainda não está vinculado a uma clínica.</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BrandLogo size="sm" />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Seu portal de cuidado</p>
          <h1 className="text-2xl font-semibold">{data.client.name}</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Início", "#inicio"], ["Agenda", "#agenda"], ["Plano", "#plano"], ["Ajuda", "#ajuda"],
          ].map(([label, href]) => <a key={href} href={href} className="rounded-sm border border-border bg-card px-3 py-2 text-center text-xs font-medium hover:border-primary">{label}</a>)}
        </div>

        <section id="inicio" className="space-y-3">
          {activePackage && <Card className="rounded-sm"><CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Pacote ativo</p><p className="font-semibold">{activePackage.name}</p></div><Badge variant="outline" className="rounded-sm">{activePackage.completed_sessions}/{activePackage.total_sessions}</Badge></div>
            <Progress value={activePackage.total_sessions ? (activePackage.completed_sessions / activePackage.total_sessions) * 100 : 0} className="h-2" />
            <p className="text-xs text-muted-foreground">Saldo: {Math.max(0, Number(activePackage.total_sessions) - Number(activePackage.completed_sessions))} sessões</p>
          </CardContent></Card>}
          <Button onClick={() => setRequestOpen(true)} className="w-full rounded-sm gap-2"><CalendarPlus className="h-4 w-4" /> Solicitar sessão</Button>
        </section>

        <section id="agenda" className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted-foreground">Agenda</p><span className="text-xs text-muted-foreground">{upcoming.length} próximas</span></div>
          {upcoming.length === 0 ? <Card className="rounded-sm border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhuma sessão próxima.</CardContent></Card> :
            upcoming.map((a) => <Card key={a.id} className="rounded-sm"><CardContent className="flex items-center justify-between gap-3 p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/meu-app/sessao/${a.id}`)}>
                <p className="text-sm font-semibold">{format(new Date(`${a.appointment_date}T12:00:00`), "EEE, dd MMM", { locale: ptBR })} · {a.appointment_time?.slice(0, 5)}</p>
                <p className="text-xs text-muted-foreground">{a.service} · {statusLabel[a.status] ?? a.status}</p>
              </button>
              <div className="flex gap-1"><Button variant="ghost" size="icon" title="Confirmar presença" onClick={() => setConfirming({ id: a.id, action: "confirm_presence" })}><Check className="h-4 w-4 text-primary" /></Button><Button variant="ghost" size="icon" title="Reagendar" onClick={() => setConfirming({ id: a.id, action: "request_reschedule" })}><ChevronRight className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Solicitar cancelamento" onClick={() => setConfirming({ id: a.id, action: "request_cancel" })}><X className="h-4 w-4 text-destructive" /></Button></div>
            </CardContent></Card>)}
        </section>

        <section id="plano" className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Plano e exercícios</p>
          {plans.length === 0 ? <Card className="rounded-sm border-dashed"><CardContent className="py-5 text-sm text-muted-foreground">Seu fisioterapeuta ainda não publicou um plano.</CardContent></Card> : plans.slice(0, 3).map((p) => <Card key={p.id} className="rounded-sm"><CardContent className="space-y-1 p-4"><p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />{p.title}</p>{p.content && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.content}</p>}{p.tips && <p className="text-xs text-muted-foreground"><b>Dicas:</b> {p.tips}</p>}</CardContent></Card>)}
          {exercises.length > 0 && <Card className="rounded-sm"><CardContent className="p-4"><p className="mb-2 text-sm font-semibold">Exercícios acompanhados</p><p className="text-sm text-muted-foreground">{exercises.filter((e) => e.completed_at).length} de {exercises.length} concluídos</p></CardContent></Card>}
        </section>

        <section id="ajuda" className="rounded-sm border border-border bg-card p-4"><p className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4 text-primary" /> Precisa de ajuda?</p><p className="mt-1 text-sm text-muted-foreground">Use o WhatsApp da clínica para dúvidas sobre sua agenda ou plano. Não envie informações clínicas sensíveis por mensagem.</p></section>
        <section className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-4"><div><p className="text-sm font-semibold">Lembretes pelo WhatsApp</p><p className="text-xs text-muted-foreground">Somente horários e links seguros, sem dados clínicos.</p></div><Button variant="outline" size="sm" className="shrink-0 rounded-sm" onClick={async () => { try { const next = !whatsappOptedIn; await clinicApi.consent({ optedIn: next }); setWhatsappOptedIn(next); toast.success(next ? "Lembretes ativados" : "Lembretes desativados"); } catch (error: any) { toast.error(error.message || "Não foi possível atualizar a preferência"); } }}>{whatsappOptedIn ? "Desativar" : "Ativar"}</Button></section>
        <section className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><UserRound className="h-4 w-4" /> Seus dados são exibidos somente para você e sua equipe responsável.</section>
      </main>

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}><DialogContent className="max-w-sm rounded-sm"><DialogHeader><DialogTitle>Confirmar ação</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{confirming?.action === "confirm_presence" ? "Você confirma sua presença nesta sessão?" : confirming?.action === "request_cancel" ? "Deseja solicitar o cancelamento desta sessão?" : "Deseja solicitar um novo horário para esta sessão?"}</p><Button onClick={submitAction} className="w-full rounded-sm">Confirmar</Button></DialogContent></Dialog>
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="max-w-sm rounded-sm"><DialogHeader><DialogTitle>Solicitar sessão</DialogTitle></DialogHeader>{(data.availableSlots ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">Não há horários disponíveis no momento.</p> : <div className="space-y-2">{data.availableSlots.map((slot) => <button key={slot.id} onClick={async () => { try { const { createClinicBooking } = await import("@workspace/api-client-react"); await createClinicBooking({ slotId: slot.id }); toast.success("Horário solicitado"); setRequestOpen(false); load(); } catch (error: any) { toast.error(error.message || "Horário indisponível"); } }} className="w-full rounded-sm border border-border p-3 text-left hover:border-primary"><p className="text-sm font-semibold">{format(new Date(`${slot.slot_date}T12:00:00`), "EEE, dd MMM", { locale: ptBR })}</p><p className="text-xs text-muted-foreground">{slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}</p></button>)}</div>}</DialogContent></Dialog>
    </div>
  );
};

export default PatientPortal;