import { useEffect, useMemo, useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { clinicApi, type PortalData } from "@/lib/clinicApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarPlus, Check, FileText, HelpCircle, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { appointmentStatusLabel } from "@/lib/statusLabels";

const PatientPortal = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: linkedId } = useParams();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(new URLSearchParams(location.search).get("agendar") === "1");
  const [confirming, setConfirming] = useState<{ id: string; action: "confirm_presence" | "request_reschedule" | "request_cancel" } | null>(null);
  const [whatsappOptedIn, setWhatsappOptedIn] = useState<boolean | null>(null);

  const sequence = useRef(0);
  const load = async () => {
    const run = ++sequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const portal = await clinicApi.portal();
      if (run !== sequence.current) return;
      setData(portal);
      try {
        const consent = await clinicApi.getConsent();
        if (run === sequence.current) setWhatsappOptedIn(!!consent.optedIn);
      } catch {
        // A consent service outage must not block access to the clinical portal.
        if (run === sequence.current) setWhatsappOptedIn(null);
      }
    }
    catch (error: any) {
      if (run === sequence.current) setLoadError(error.message || "Não foi possível carregar seu portal");
    }
    finally { if (run === sequence.current) setLoading(false); }
  };
  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { sequence.current++; window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get("action");
    const id = new URLSearchParams(location.search).get("appointment");
    if (action && id && ["confirm_presence", "request_reschedule", "request_cancel"].includes(action)) {
      setConfirming({ id, action: action as any });
    }
  }, [location.search]);

  const today = format(new Date(), "yyyy-MM-dd");
  const isFuture = (a: any) => new Date(`${a.appointmentDate}T${a.appointmentTime}-03:00`) > new Date();
  const upcoming = useMemo(() => (data?.appointments ?? []).filter((a) =>
    a.appointmentDate >= today && !["atendido", "cancelado", "faltou"].includes(a.status)
  ), [data, today]);
  const linked = data?.appointments.find((a) => a.id === linkedId);
  const agenda = linkedId ? (linked ? [linked] : []) : upcoming;
  const activePackage = data?.packages?.find((p) => p.status === "ativo");
  const plans = data?.plans ?? [];
  const exercises = data?.exercises ?? [];

  const submitAction = async () => {
    if (!confirming || busy) return;
    setBusy(true);
    try {
      await clinicApi.appointmentAction(confirming.id, {
        action: confirming.action,
        confirmed: true,
        idempotencyKey: `${confirming.action}:${confirming.id}:${data?.appointments.find((row) => row.id === confirming.id)?.updatedAt}`,
      });
      toast.success(confirming.action === "confirm_presence" ? "Presença confirmada" : confirming.action === "request_cancel" ? "Pedido de cancelamento enviado" : "Pedido de reagendamento enviado");
      setConfirming(null);
      navigate("/meu-app", { replace: true });
      await load();
    } catch (error: any) { toast.error(error.message || "Não foi possível concluir a ação"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando seu portal...</div>;
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Não foi possível carregar o portal</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button onClick={load} className="rounded-sm">Tentar novamente</Button>
        </div>
      </div>
    );
  }
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

        {!linkedId && <section id="inicio" className="space-y-3">
          {activePackage && <Card className="rounded-sm"><CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Pacote ativo</p><p className="font-semibold">{activePackage.name}</p></div><Badge variant="outline" className="rounded-sm">{activePackage.completedSessions}/{activePackage.totalSessions}</Badge></div>
            <Progress value={activePackage.totalSessions ? (activePackage.completedSessions / activePackage.totalSessions) * 100 : 0} className="h-2" />
            <p className="text-xs text-muted-foreground">Saldo: {Math.max(0, Number(activePackage.totalSessions) - Number(activePackage.completedSessions))} sessões</p>
          </CardContent></Card>}
          <Button onClick={() => setRequestOpen(true)} className="w-full rounded-sm gap-2"><CalendarPlus className="h-4 w-4" /> Solicitar sessão</Button>
        </section>}

        <section id="agenda" className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{linkedId ? "Sessão do link" : "Próximas sessões"}</h2>{linkedId && <Button variant="outline" size="sm" onClick={() => navigate("/meu-app")}>Minha agenda</Button>}</div>
          {agenda.length === 0 ? <Card className="rounded-sm border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground">{linkedId ? "Esta sessão está indisponível para sua conta." : "Nenhuma sessão próxima."}</CardContent></Card> :
            agenda.map((a) => <Card key={a.id} className="rounded-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/meu-app/sessao/${a.id}`)}>
                <p className="text-sm font-semibold">{format(new Date(`${a.appointmentDate}T12:00:00`), "EEE, dd MMM", { locale: ptBR })} · {a.appointmentTime?.slice(0, 5)}</p>
                 <p className="text-xs text-muted-foreground">{a.service} · {appointmentStatusLabel(a.status)}</p>
              </button>
              <div className="flex flex-wrap gap-2">
                {isFuture(a) && ["agendado", "confirmado"].includes(a.status) && <Button onClick={() => setConfirming({ id: a.id, action: "confirm_presence" })}><Check className="mr-1 h-4 w-4" />Confirmar presença</Button>}
                {isFuture(a) && ["agendado", "confirmado", "presenca_confirmada"].includes(a.status) && <>
                  <Button variant="outline" onClick={() => setConfirming({ id: a.id, action: "request_reschedule" })}>Reagendar</Button>
                  <Button variant="ghost" onClick={() => setConfirming({ id: a.id, action: "request_cancel" })}>Pedir cancelamento</Button>
                </>}
              </div>
            </CardContent></Card>)}
        </section>

        <section id="plano" className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Plano e exercícios</p>
          {plans.length === 0 ? <Card className="rounded-sm border-dashed"><CardContent className="py-5 text-sm text-muted-foreground">Seu fisioterapeuta ainda não publicou um plano.</CardContent></Card> : plans.slice(0, 3).map((p) => <Card key={p.id} className="rounded-sm"><CardContent className="space-y-1 p-4"><p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />{p.title}</p>{p.content && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.content}</p>}{p.tips && <p className="text-xs text-muted-foreground"><b>Dicas:</b> {p.tips}</p>}</CardContent></Card>)}
          {exercises.length > 0 && <Card className="rounded-sm"><CardContent className="p-4"><p className="mb-2 text-sm font-semibold">Exercícios acompanhados</p><p className="text-sm text-muted-foreground">{exercises.filter((e) => e.completedAt).length} de {exercises.length} concluídos</p></CardContent></Card>}
        </section>

        <section id="ajuda" className="rounded-sm border border-border bg-card p-4"><p className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4 text-primary" /> Precisa de ajuda?</p><p className="mt-1 text-sm text-muted-foreground">Use o WhatsApp da clínica para dúvidas sobre sua agenda ou plano. Não envie informações clínicas sensíveis por mensagem.</p></section>
        <section className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-4"><div><p className="text-sm font-semibold">Lembretes pelo WhatsApp</p><p className="text-xs text-muted-foreground">Receba o link para confirmar sua sessão ou consultar a agenda.</p></div><Button variant="outline" size="sm" className="shrink-0 rounded-sm" disabled={busy || whatsappOptedIn === null} onClick={async () => { setBusy(true); try { const next = !whatsappOptedIn; await clinicApi.consent({ optedIn: next }); setWhatsappOptedIn(next); toast.success(next ? "Lembretes ativados" : "Lembretes desativados"); } catch (error: any) { toast.error(error.message || "Não foi possível atualizar a preferência"); } finally { setBusy(false); } }}>{whatsappOptedIn ? "Desativar" : "Ativar"}</Button></section>
        <section className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><UserRound className="h-4 w-4" /> Seus dados são exibidos somente para você e sua equipe responsável.</section>
      </main>

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}><DialogContent className="max-w-sm rounded-sm"><DialogHeader><DialogTitle>Confirmar ação</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{confirming?.action === "confirm_presence" ? "Você confirma sua presença nesta sessão?" : confirming?.action === "request_cancel" ? "Deseja solicitar o cancelamento desta sessão?" : "Deseja solicitar um novo horário para esta sessão?"}</p><Button onClick={submitAction} disabled={busy} className="w-full rounded-sm">Confirmar</Button></DialogContent></Dialog>
       <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="max-w-sm rounded-sm"><DialogHeader><DialogTitle>Solicitar sessão</DialogTitle></DialogHeader>{(data.availableSlots ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">Não há horários disponíveis no momento.</p> : <div className="space-y-2">{data.availableSlots.map((slot) => <button key={slot.id} disabled={busy} onClick={async () => { setBusy(true); try { await clinicApi.createBooking({ slotId: slot.id }); toast.success("Pedido enviado. Acompanhe a aprovação na agenda."); setRequestOpen(false); await load(); } catch (error: any) { toast.error(error.message || "Horário indisponível"); await load(); } finally { setBusy(false); } }} className="w-full rounded-sm border border-border p-3 text-left hover:border-primary"><p className="text-sm font-semibold">{format(new Date(`${slot.slotDate}T12:00:00`), "EEE, dd MMM", { locale: ptBR })}</p><p className="text-xs text-muted-foreground">{slot.startTime?.slice(0, 5)} – {slot.endTime?.slice(0, 5)}</p></button>)}</div>}</DialogContent></Dialog>
    </div>
  );
};

export default PatientPortal;
