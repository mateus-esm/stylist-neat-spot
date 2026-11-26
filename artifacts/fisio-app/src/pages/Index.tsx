import { useState, useEffect, useMemo, useRef } from "react";
import { format, addDays, addMonths, startOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, eachWeekOfInterval, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight, LogOut, DollarSign, Clock, CalendarClock } from "lucide-react";
import AppointmentForm from "@/components/AppointmentForm";
import AppointmentSheet from "@/components/AppointmentSheet";
import EvolutionSheet from "@/components/EvolutionSheet";
import PendingRequestsBanner from "@/components/PendingRequestsBanner";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { clinicApi } from "@/lib/clinicApi";
import { useRole } from "@/hooks/useRole";
import { appointmentStatusLabel, slotStatusLabel } from "@/lib/statusLabels";
import DataErrorState from "@/components/DataErrorState";

type View = "day" | "week" | "month";


const statusBg: Record<string, string> = {
  agendado: "bg-secondary/80 border-l-muted-foreground",
  confirmado: "bg-primary/15 border-l-primary",
  atendido: "bg-success/15 border-l-success",
  faltou: "bg-destructive/15 border-l-destructive",
  cancelado: "bg-muted/50 border-l-muted",
};

const slotBg: Record<string, string> = {
  aberto: "border-primary/40 bg-primary/10 text-foreground",
  reservado: "border-warning/50 bg-warning/10 text-foreground",
  bloqueado: "border-border bg-muted/40 text-muted-foreground",
};

const Index = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useRole();
  const [team, setTeam] = useState<Record<string, string>>({});
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    clinicApi.members().then((rows) => {
      if (current) setTeam(Object.fromEntries(rows.map((member) => [member.userId, member.email || member.userId])));
    }).catch(() => { if (current) setTeam({}); });
    return () => { current = false; };
  }, [isAdmin, user?.id]);
  const fetchSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const navigateTo = useNavigate();
  const [view, setView] = useState<View>("day");
  const [params] = useSearchParams();
  const linkedDay = params.get("dia");
  const [anchorDate, setAnchorDate] = useState(new Date());
  useEffect(() => {
    if (!linkedDay || !/^\d{4}-\d{2}-\d{2}$/.test(linkedDay)) return;
    const date = new Date(linkedDay + "T12:00:00");
    if (!Number.isNaN(date.getTime()) && format(date, "yyyy-MM-dd") === linkedDay) {
      setAnchorDate(date);
      setView("day");
    }
  }, [linkedDay]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "day") return { start: anchorDate, end: anchorDate };
    if (view === "week") {
      const s = startOfWeek(anchorDate, { weekStartsOn: 1 });
      return { start: s, end: addDays(s, 6) };
    }
    return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
  }, [view, anchorDate]);

  const fetchAppointments = async (silent = false) => {
    if (!user) return;
    const sequence = ++fetchSequence.current;
    if (!silent) setLoading(true);
    setLoadError(null);
    const from = format(range.start, "yyyy-MM-dd");
    const to = format(range.end, "yyyy-MM-dd");

    const [{ data: appointmentRows, error: appointmentError }, { data: slotRows, error: slotError }] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .gte("appointment_date", from)
        .lte("appointment_date", to)
        .order("appointment_time"),
      supabase
        .from("availability_slots")
        .select("*")
        .gte("slot_date", from)
        .lte("slot_date", to)
        .order("start_time"),
    ]);

    if (sequence !== fetchSequence.current) return;
    setLoading(false);
    if (appointmentError || slotError) {
      setLoadError(appointmentError?.message || slotError?.message || "Não foi possível carregar a agenda.");
      return;
    }
    setAppointments(appointmentRows || []);
    setSlots(slotRows || []);
  };

  useEffect(() => {
    fetchAppointments();
    const refresh = () => { if (document.visibilityState === "visible") void fetchAppointments(true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { fetchSequence.current++; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [user, range.start.toString(), range.end.toString()]);

  const dailyTotal = appointments
    .filter((a) => a.appointment_date === format(anchorDate, "yyyy-MM-dd") && a.status === "atendido" && a.payment_status === "pago" && !a.package_id)
    .reduce((s, a) => s + Number(a.price), 0);

  const navigate = (delta: number) => {
    if (view === "day") setAnchorDate(addDays(anchorDate, delta));
    else if (view === "week") setAnchorDate(addDays(anchorDate, delta * 7));
    else setAnchorDate(addMonths(anchorDate, delta));
  };

  const openSheet = (a: any) => {
    setSelected(a);
    setSheetOpen(true);
  };

  const headerLabel = useMemo(() => {
    if (view === "day") return format(anchorDate, "EEEE, dd 'de' MMM", { locale: ptBR });
    if (view === "week") return `${format(range.start, "dd MMM", { locale: ptBR })} – ${format(range.end, "dd MMM", { locale: ptBR })}`;
    return format(anchorDate, "MMMM yyyy", { locale: ptBR });
  }, [view, anchorDate, range]);

  if (loadError) return <DataErrorState message={loadError} onRetry={() => fetchAppointments()} />;

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between">
            <BrandLogo size="sm" />
            <div className="flex items-center gap-2">
              {isAdmin && !loading && view === "day" && <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">{dailyTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">avulsos recebidos no dia</span>
              </div>}
              <ThemeToggle />
              <Button aria-label="Sair" onClick={signOut} variant="ghost" size="icon" className="h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => navigate(-1)} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                onClick={() => setAnchorDate(new Date())}
                className="px-2 text-sm font-semibold capitalize hover:text-primary"
              >
                {headerLabel}
              </button>
              <Button variant="ghost" size="icon" aria-label="Próximo período" onClick={() => navigate(1)} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* View toggle */}
            <div className="flex rounded-sm border border-border bg-card p-0.5">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                    view === v
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" className="rounded-sm gap-2" onClick={() => navigateTo("/disponibilidade")}>
              <CalendarClock className="h-4 w-4" /> Abrir horários
            </Button>
          </div>}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        {isAdmin && <PendingRequestsBanner onChange={fetchAppointments} />}
        {loading && <p role="status" className="rounded-lg border p-5 text-sm">Carregando agenda…</p>}
        {view === "day" && isAdmin && <div role="group" aria-label="Filtrar por profissional" className="mb-4 flex gap-2">
          <Button size="sm" variant={onlyMine ? "outline" : "default"} aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>Todos</Button>
          <Button size="sm" variant={onlyMine ? "default" : "outline"} aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>Meus atendimentos</Button>
        </div>}
        {!loading && view === "day" && <DayView date={anchorDate} appointments={appointments} slots={slots} onSelect={openSheet}
          team={team} userId={user?.id} onlyMine={onlyMine} canManage={isAdmin} />}
        {!loading && view === "week" && <WeekView startDate={range.start} appointments={appointments} slots={slots} onSelect={openSheet} />}
        {!loading && view === "month" && (
          <MonthView
            anchor={anchorDate}
            appointments={appointments}
            slots={slots}
            onSelectDay={(d: Date) => { setAnchorDate(d); setView("day"); }}
          />
        )}
      </div>

      {isAdmin && <Button aria-label="Agendar sessão"
        onClick={() => { setEditing(null); setFormOpen(true); }}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>}

      <AppointmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchAppointments}
        appointment={editing}
        selectedDate={format(anchorDate, "yyyy-MM-dd")}
      />

      <AppointmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        appointment={selected}
        onComplete={fetchAppointments}
        onEdit={() => { setEditing(selected); setSheetOpen(false); setFormOpen(true); }}
        onLog={() => { setSheetOpen(false); setLogOpen(true); }}
        onRefresh={fetchAppointments}
      />

      <EvolutionSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        appointment={selected}
        onSuccess={fetchAppointments}
      />
    </div>
  );
};

// Cards stay in document flow so overlapping visits and short slots remain actionable.
interface DayViewProps {
  date: Date;
  appointments: any[];
  slots: any[];
  onSelect: (appointment: any) => void;
  canManage: boolean;
  team: Record<string, string>;
  userId: string;
  onlyMine: boolean;
}
const DayView = ({ date, appointments, slots, onSelect, canManage, team, userId, onlyMine }: DayViewProps) => {
  const day = format(date, "yyyy-MM-dd");
  const visits = appointments.filter((a) => a.appointment_date === day && (!onlyMine || a.assigned_to_user_id === userId));
  const groups = new Map<string, typeof visits>();
  for (const visit of visits) {
    const key = visit.assigned_to_user_id || "";
    const group = groups.get(key);
    if (group) group.push(visit); else groups.set(key, [visit]);
  }
  const availability = slots.filter((s) => !onlyMine && s.slot_date === day && !s.appointment_id);
  if (!visits.length && !availability.length) return <Card className="border-dashed"><CardContent className="py-12 text-center">
    <Clock className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p>{onlyMine ? "Nenhum atendimento atribuído a você neste dia." : "Nenhum atendimento para este dia."}</p>
    {canManage && !onlyMine && <p className="mt-1 text-sm text-muted-foreground">Use o botão + para agendar uma sessão ou abra horários para os pacientes.</p>}
  </CardContent></Card>;
  return <div className="space-y-5">
    <section className="min-w-0 space-y-2"><h2 className="font-semibold">Atendimentos ({visits.length})</h2>
      {!visits.length && <p className="text-sm text-muted-foreground">Nenhuma sessão marcada.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...groups].map(([professional, group]) => <section key={professional} className="min-w-0 space-y-2 rounded-lg border p-3">
        <h3 className="break-words text-sm font-semibold">{professional === userId ? "Meus atendimentos" : !professional ? "Sem profissional atribuído" : team[professional] || "Profissional responsável"}</h3>
        {group.map((a: any) => <button key={a.id} onClick={() => onSelect(a)} className={cn("flex w-full items-start gap-3 rounded-lg border border-l-4 bg-card p-3 text-left", statusBg[a.status])}>
        <strong className="tabular-nums">{a.appointment_time.slice(0, 5)}</strong><span className="min-w-0"><strong className="block break-words">{a.client_name}</strong>
          <span className="block text-sm">{a.service} · {a.duration_min || 60} min</span>
          <span className="text-xs text-muted-foreground">{appointmentStatusLabel(a.status)}{a.package_id ? " · Pacote" : " · Avulso"}</span></span>
      </button>)}
      </section>)}</div>
    </section>
    {!onlyMine && <section className="min-w-0 space-y-2"><h2 className="font-semibold">Horários ({availability.length})</h2>
      {!availability.length && <p className="text-sm text-muted-foreground">Nenhum horário livre ou bloqueado.</p>}
      {availability.map((s: any) => <div key={s.id} className={cn("rounded-lg border border-dashed p-3 text-sm", slotBg[s.status])}>
        <strong>{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</strong><p>{slotStatusLabel(s.status)}{s.reason && ` · ${s.reason}`}</p>
      </div>)}
    </section>}
  </div>;
};

// ── WEEK VIEW ────────────────────────────────────────────────
const WeekView = ({ startDate, appointments, slots, onSelect }: any) => {
  const days = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const appointmentList = appointments.filter((a: any) => a.appointment_date === dayStr);
        const slotList = slots.filter((s: any) => s.slot_date === dayStr);
        return (
          <Card key={dayStr} className={cn("border-border/60", isToday(d) && "border-primary/40")}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-xs uppercase tracking-wider", isToday(d) ? "text-primary font-semibold" : "text-muted-foreground")}>
                    {format(d, "EEE", { locale: ptBR })}
                  </span>
                  <span className={cn("text-lg font-bold", isToday(d) && "text-primary")}>
                    {format(d, "dd")}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">{appointmentList.length} ag. · {slotList.length} horários</span>
              </div>
              {appointmentList.length === 0 && slotList.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground/60">Sem agendamentos ou horários</p>
              ) : (
                <div className="space-y-1.5">
                  {slotList.map((slot: any) => (
                    <div
                      key={slot.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-sm border border-dashed px-2 py-1.5 text-left text-xs",
                        slotBg[slot.status] || slotBg.aberto
                      )}
                    >
                      <span className="font-semibold tabular-nums">{slot.start_time?.slice(0, 5)}</span>
                      <span className="flex-1 truncate">{slot.reason || "Horário"}</span>
                       <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider">{slotStatusLabel(slot.status)}</span>
                    </div>
                  ))}
                  {appointmentList.map((a: any) => {
                    const isPkg = !!(a.package_id || a.package_session_index);
                    return (
                      <button
                        key={a.id}
                        onClick={() => onSelect(a)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-sm border-l-4 bg-secondary/40 px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary/70",
                          statusBg[a.status]
                        )}
                      >
                        <span className="font-semibold tabular-nums">{a.appointment_time?.slice(0, 5)}</span>
                        <span className="flex-1 truncate">{a.client_name}</span>
                        <span className="truncate text-muted-foreground">{a.service}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-sm border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider",
                            isPkg ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground"
                          )}
                        >
                          {isPkg ? `Sessão ${a.package_session_index ?? "-"}${a.package_total ? `/${a.package_total}` : ""}` : "Avulso"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ── MONTH VIEW ───────────────────────────────────────────────
const MonthView = ({ anchor, appointments, slots, onSelectDay }: any) => {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });

  const countByDay = appointments.reduce((acc: Record<string, number>, a: any) => {
    acc[a.appointment_date] = (acc[a.appointment_date] || 0) + 1;
    return acc;
  }, {});

  slots.forEach((slot: any) => {
    countByDay[slot.slot_date] = (countByDay[slot.slot_date] || 0) + 1;
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <div key={i} className="text-center text-[10px] uppercase text-muted-foreground">{d}</div>
        ))}
      </div>
      {weeks.map((w) => {
        const days = eachDayOfInterval({ start: w, end: addDays(w, 6) });
        return (
          <div key={w.toString()} className="grid grid-cols-7 gap-1 mb-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === anchor.getMonth();
              const count = countByDay[format(d, "yyyy-MM-dd")] || 0;
              return (
                <button
                  key={d.toString()}
                  onClick={() => onSelectDay(d)}
                  className={cn(
                    "aspect-square rounded-lg border border-transparent p-1 text-xs transition-all hover:border-primary/40 hover:bg-secondary/40",
                    !inMonth && "opacity-30",
                    isToday(d) && "border-primary/60 bg-primary/10"
                  )}
                >
                  <div className="flex h-full flex-col items-center justify-between">
                    <span className={cn("font-medium", isToday(d) && "text-primary")}>{format(d, "d")}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-gradient-brand px-1.5 text-[9px] font-bold text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default Index;
