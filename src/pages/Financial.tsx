import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2, Package } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const db = supabase as any;

type Period = "all" | "day" | "week" | "month" | "custom";

const Financial = () => {
  const { user } = useAuth();
  const [appts, setAppts] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: a }, { data: p }, { data: c }] = await Promise.all([
        db.from("appointments").select("appointment_date, price, status, payment_status, package_id, client_id, service"),
        db.from("patient_packages").select("*"),
        db.from("clients").select("id, name").order("name"),
      ]);
      setAppts(a || []);
      setPackages(p || []);
      setClients(c || []);
    })();
  }, [user]);

  const range = useMemo(() => {
    const now = new Date();
    if (period === "all") {
      const refs = [
        ...appts.map((a) => a.appointment_date).filter(Boolean).map((d) => new Date(`${d}T00:00:00`)),
        ...packages.map((p) => p.paid_at || p.created_at).filter(Boolean).map((d) => new Date(d)),
      ].filter((d) => !Number.isNaN(d.getTime()));

      const from = refs.length
        ? new Date(Math.min(...refs.map((d) => d.getTime())))
        : startOfMonth(now);

      return { from: startOfDay(from), to: endOfDay(now) };
    }
    if (period === "day") return { from: startOfDay(now), to: endOfDay(now) };
    if (period === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (period === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    return { from: new Date(customFrom + "T00:00:00"), to: new Date(customTo + "T23:59:59") };
  }, [period, customFrom, customTo, appts, packages]);

  const fromStr = format(range.from, "yyyy-MM-dd");
  const toStr = format(range.to, "yyyy-MM-dd");

  // Filtered avulsos (no package): always by appointment_date
  const filteredAvulsos = useMemo(() => appts.filter((a) => {
    if (a.package_id) return false;
    if (a.appointment_date < fromStr || a.appointment_date > toStr) return false;
    if (filterClient !== "all" && a.client_id !== filterClient) return false;
    if (filterService !== "all" && a.service !== filterService) return false;
    return true;
  }), [appts, fromStr, toStr, filterClient, filterService]);

  // Filtered packages: paid_at inside range OR active pending (for pending bucket)
  const paidPackagesInRange = useMemo(() => packages.filter((p) => {
    if (p.payment_status !== "pago") return false;
    const ref = p.paid_at || p.created_at;
    if (!ref) return false;
    const d = format(new Date(ref), "yyyy-MM-dd");
    if (d < fromStr || d > toStr) return false;
    if (filterClient !== "all" && p.client_id !== filterClient) return false;
    if (filterService !== "all" && p.service !== filterService) return false;
    return true;
  }), [packages, fromStr, toStr, filterClient, filterService]);

  const pendingPackages = useMemo(() => packages.filter((p) => {
    if (p.status !== "ativo" || p.payment_status !== "pendente") return false;
    if (filterClient !== "all" && p.client_id !== filterClient) return false;
    if (filterService !== "all" && p.service !== filterService) return false;
    return true;
  }), [packages, filterClient, filterService]);

  const completedAvulsos = filteredAvulsos.filter((a) => a.status === "atendido");
  const revenueAvulsoPaid = completedAvulsos.filter((a) => a.payment_status === "pago").reduce((s, a) => s + Number(a.price), 0);
  const revenuePackagesPaid = paidPackagesInRange.reduce((s, p) => s + Number(p.price), 0);
  const grossRevenue = revenueAvulsoPaid + revenuePackagesPaid;

  const pendingAvulso = completedAvulsos.filter((a) => a.payment_status === "pendente").reduce((s, a) => s + Number(a.price), 0);
  const pendingPkg = pendingPackages.reduce((s, p) => s + Number(p.price), 0);
  const pending = pendingAvulso + pendingPkg;

  const activePackages = packages.filter((p) => p.status === "ativo").length;
  const sessionsDone = completedAvulsos.length + appts.filter((a) => a.status === "atendido" && a.package_id && a.appointment_date >= fromStr && a.appointment_date <= toStr).length;
  const ticketBaseCount = completedAvulsos.length + paidPackagesInRange.length;
  const avgTicket = ticketBaseCount > 0 ? grossRevenue / ticketBaseCount : 0;

  const services = useMemo(() => {
    const set = new Set<string>();
    appts.forEach((a) => a.service && set.add(a.service));
    packages.forEach((p) => p.service && set.add(p.service));
    return Array.from(set).sort();
  }, [appts, packages]);

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);

  const receivedItems = useMemo(() => {
    const avulsoItems = completedAvulsos
      .filter((a) => a.payment_status === "pago")
      .map((a, index) => ({
        id: `appt-${a.client_id}-${a.appointment_date}-${a.service}-${index}`,
        date: a.appointment_date,
        label: a.service || "Sessão avulsa",
        clientName: clientMap[a.client_id] || "Paciente",
        amount: Number(a.price),
        kind: "Avulso",
      }));

    const packageItems = paidPackagesInRange.map((p) => ({
      id: `pkg-${p.id}`,
      date: format(new Date(p.paid_at || p.created_at), "yyyy-MM-dd"),
      label: p.name || p.service || "Pacote",
      clientName: clientMap[p.client_id] || "Paciente",
      amount: Number(p.price),
      kind: "Pacote",
    }));

    return [...packageItems, ...avulsoItems]
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [completedAvulsos, paidPackagesInRange, clientMap]);

  const pendingItems = useMemo(() => {
    const avulsoItems = completedAvulsos
      .filter((a) => a.payment_status === "pendente")
      .map((a, index) => ({
        id: `pending-appt-${a.client_id}-${a.appointment_date}-${a.service}-${index}`,
        date: a.appointment_date,
        label: a.service || "Sessão avulsa",
        clientName: clientMap[a.client_id] || "Paciente",
        amount: Number(a.price),
        kind: "Avulso",
      }));

    const packageItems = pendingPackages.map((p) => ({
      id: `pending-pkg-${p.id}`,
      date: format(new Date(p.created_at), "yyyy-MM-dd"),
      label: p.name || p.service || "Pacote",
      clientName: clientMap[p.client_id] || "Paciente",
      amount: Number(p.price),
      kind: "Pacote",
    }));

    return [...packageItems, ...avulsoItems]
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [completedAvulsos, pendingPackages, clientMap]);

  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return days.map((d) => {
      const ds = format(d, "yyyy-MM-dd");
      const avulso = completedAvulsos
        .filter((a) => a.payment_status === "pago" && a.appointment_date === ds)
        .reduce((s, a) => s + Number(a.price), 0);
      const pacote = paidPackagesInRange
        .filter((p) => format(new Date(p.paid_at || p.created_at), "yyyy-MM-dd") === ds)
        .reduce((s, p) => s + Number(p.price), 0);
      return { day: format(d, "dd/MM"), value: Number((avulso + pacote).toFixed(2)) };
    });
  }, [range, completedAvulsos, paidPackagesInRange]);

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground capitalize">
            {format(range.from, "dd MMM", { locale: ptBR })} — {format(range.to, "dd MMM", { locale: ptBR })}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <Card className="rounded-sm">
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Período</Label>
                <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                  <SelectTrigger className="rounded-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tudo</SelectItem>
                    <SelectItem value="day">Dia</SelectItem>
                    <SelectItem value="week">Semana</SelectItem>
                    <SelectItem value="month">Mês</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Paciente</Label>
                <Select value={filterClient} onValueChange={setFilterClient}>
                  <SelectTrigger className="rounded-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Serviço/Pacote</Label>
                <Select value={filterService} onValueChange={setFilterService}>
                  <SelectTrigger className="rounded-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {period === "custom" && (
                <div className="grid grid-cols-2 gap-1 col-span-2 sm:col-span-1">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider">De</Label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-sm h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider">Até</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-sm h-9" />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-sm border-border">
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Receita recebida</p>
            <p className="mt-1 text-4xl font-semibold">R$ {grossRevenue.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sessionsDone} sessão(ões) · Ticket médio R$ {avgTicket.toFixed(2)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-sm bg-secondary/40 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avulsos</p>
                <p className="font-semibold">R$ {revenueAvulsoPaid.toFixed(2)}</p>
              </div>
              <div className="rounded-sm bg-secondary/40 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pacotes</p>
                <p className="font-semibold">R$ {revenuePackagesPaid.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card className="rounded-sm">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-warning">
                <AlertCircle className="h-4 w-4" />
                <p className="text-[10px] font-semibold uppercase tracking-wider">Pendente</p>
              </div>
              <p className="text-xl font-semibold">R$ {pending.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-sm">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-[10px] font-semibold uppercase tracking-wider">Recebido</p>
              </div>
              <p className="text-xl font-semibold">R$ {grossRevenue.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-sm">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                <p className="text-[10px] font-semibold uppercase tracking-wider">Pacotes</p>
              </div>
              <p className="text-xl font-semibold">{activePackages}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Receita por dia</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 12 }}
                  formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, "Receita"]}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="rounded-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Entradas recebidas</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{receivedItems.length} lançamento(s)</p>
              </div>
              {receivedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum recebimento no período.</p>
              ) : (
                <div className="space-y-2">
                  {receivedItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-sm border border-border/70 p-3">
                      <div>
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.clientName} · {item.kind} · {format(new Date(`${item.date}T12:00:00`), "dd/MM/yyyy")}</p>
                      </div>
                      <p className="text-sm font-semibold">R$ {item.amount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Em aberto</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{pendingItems.length} lançamento(s)</p>
              </div>
              {pendingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada pendente agora.</p>
              ) : (
                <div className="space-y-2">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-sm border border-border/70 p-3">
                      <div>
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.clientName} · {item.kind} · {format(new Date(`${item.date}T12:00:00`), "dd/MM/yyyy")}</p>
                      </div>
                      <p className="text-sm font-semibold">R$ {item.amount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Financial;
