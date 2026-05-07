import { useState, useEffect, useMemo } from "react";
import { format, addDays, startOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, eachWeekOfInterval, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight, LogOut, DollarSign, Clock } from "lucide-react";
import AppointmentForm from "@/components/AppointmentForm";
import AppointmentSheet from "@/components/AppointmentSheet";
import ServiceLogSheet from "@/components/ServiceLogSheet";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

type View = "day" | "week" | "month";

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 8;
const END_HOUR = 21;

const statusBg: Record<string, string> = {
  agendado: "bg-secondary/80 border-l-muted-foreground",
  confirmado: "bg-primary/15 border-l-primary",
  atendido: "bg-success/15 border-l-success",
  faltou: "bg-destructive/15 border-l-destructive",
  cancelado: "bg-muted/50 border-l-muted",
};

const Index = () => {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>("day");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const range = useMemo(() => {
    if (view === "day") return { start: anchorDate, end: anchorDate };
    if (view === "week") {
      const s = startOfWeek(anchorDate, { weekStartsOn: 1 });
      return { start: s, end: addDays(s, 6) };
    }
    return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
  }, [view, anchorDate]);

  const fetchAppointments = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .gte("appointment_date", format(range.start, "yyyy-MM-dd"))
      .lte("appointment_date", format(range.end, "yyyy-MM-dd"))
      .order("appointment_time");
    if (data) setAppointments(data);
  };

  useEffect(() => {
    fetchAppointments();
  }, [user, range.start.toString(), range.end.toString()]);

  const dailyTotal = appointments
    .filter((a) => a.appointment_date === format(new Date(), "yyyy-MM-dd") && a.status === "atendido")
    .reduce((s, a) => s + Number(a.price), 0);

  const navigate = (delta: number) => {
    if (view === "day") setAnchorDate(addDays(anchorDate, delta));
    else if (view === "week") setAnchorDate(addDays(anchorDate, delta * 7));
    else {
      const d = new Date(anchorDate);
      d.setMonth(d.getMonth() + delta);
      setAnchorDate(d);
    }
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

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between">
            <BrandLogo size="sm" />
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">R$ {dailyTotal.toFixed(2)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">hoje</span>
              </div>
              <ThemeToggle />
              <Button onClick={signOut} variant="ghost" size="icon" className="h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                onClick={() => setAnchorDate(new Date())}
                className="px-2 text-sm font-semibold capitalize hover:text-primary"
              >
                {headerLabel}
              </button>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* View toggle */}
            <div className="flex rounded-full border border-border bg-card p-0.5">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-all",
                    view === v
                      ? "bg-gradient-brand text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5">
        {view === "day" && <DayView date={anchorDate} appointments={appointments} onSelect={openSheet} />}
        {view === "week" && <WeekView startDate={range.start} appointments={appointments} onSelect={openSheet} />}
        {view === "month" && (
          <MonthView
            anchor={anchorDate}
            appointments={appointments}
            onSelectDay={(d) => { setAnchorDate(d); setView("day"); }}
          />
        )}
      </div>

      {/* FAB */}
      <Button
        onClick={() => { setEditing(null); setFormOpen(true); }}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

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

      <ServiceLogSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        appointment={selected}
        onSuccess={fetchAppointments}
      />
    </div>
  );
};

// ── DAY VIEW (timeline) ─────────────────────────────────────
const DayView = ({ date, appointments, onSelect }: any) => {
  const dayStr = format(date, "yyyy-MM-dd");
  const dayAppts = appointments.filter((a: any) => a.appointment_date === dayStr);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const apptStyle = (a: any) => {
    const [h, m] = a.appointment_time.split(":").map(Number);
    const top = (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
    const height = ((a.duration_min || 30) / 60) * HOUR_HEIGHT;
    return { top, height: Math.max(height, 36) };
  };

  if (dayAppts.length === 0) {
    return (
      <Card className="border-dashed border-border bg-card/50">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sem agendamentos para este dia</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card/40 p-3">
      <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
        {/* Hour grid */}
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-start gap-3 border-t border-border/40"
            style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          >
            <span className="-mt-2 w-10 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}

        {/* Appointments */}
        <div className="absolute inset-y-0 left-12 right-1">
          {dayAppts.map((a: any) => {
            const s = apptStyle(a);
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a)}
                className={cn(
                  "absolute left-0 right-0 overflow-hidden rounded-lg border-l-4 px-3 py-2 text-left transition-all hover:scale-[1.01] hover:shadow-elevated",
                  statusBg[a.status]
                )}
                style={{ top: s.top, height: s.height }}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{a.appointment_time?.slice(0, 5)}</span>
                  <span className="text-primary">R$ {Number(a.price).toFixed(0)}</span>
                </div>
                <p className="truncate text-sm font-medium">{a.client_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{a.service}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── WEEK VIEW ────────────────────────────────────────────────
const WeekView = ({ startDate, appointments, onSelect }: any) => {
  const days = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const list = appointments.filter((a: any) => a.appointment_date === dayStr);
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
                <span className="text-[10px] text-muted-foreground">{list.length} ag.</span>
              </div>
              {list.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground/60">Sem agendamentos</p>
              ) : (
                <div className="space-y-1.5">
                  {list.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border-l-4 bg-secondary/40 px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary/70",
                        statusBg[a.status]
                      )}
                    >
                      <span className="font-semibold tabular-nums">{a.appointment_time?.slice(0, 5)}</span>
                      <span className="flex-1 truncate">{a.client_name}</span>
                      <span className="text-muted-foreground">{a.service}</span>
                    </button>
                  ))}
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
const MonthView = ({ anchor, appointments, onSelectDay }: any) => {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });

  const countByDay = appointments.reduce((acc: Record<string, number>, a: any) => {
    acc[a.appointment_date] = (acc[a.appointment_date] || 0) + 1;
    return acc;
  }, {});

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