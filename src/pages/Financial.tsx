import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2, Package } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const db = supabase as any;

const Financial = () => {
  const { user } = useAuth();
  const [appts, setAppts] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => { if (user) fetchData(); }, [user]);

  const fetchData = async () => {
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
    const [{ data: a }, { data: p }] = await Promise.all([
      db.from("appointments")
        .select("appointment_date, price, status, payment_status, package_id")
        .gte("appointment_date", monthStart)
        .lte("appointment_date", monthEnd),
      db.from("patient_packages").select("*"),
    ]);
    setAppts(a || []);
    setPackages(p || []);
  };

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  // Avulsos atendidos no mês (sem package_id)
  const completedAvulsos = appts.filter((a) => a.status === "atendido" && !a.package_id);

  // Pacotes pagos no mês corrente
  const pkgsPaidThisMonth = packages.filter((p) => {
    if (p.payment_status !== "pago" || !p.paid_at) return false;
    const d = new Date(p.paid_at);
    return d >= monthStart && d <= monthEnd;
  });

  const revenueAvulsoPaid = completedAvulsos
    .filter((a) => a.payment_status === "pago")
    .reduce((s, a) => s + Number(a.price), 0);
  const revenuePackagesPaid = pkgsPaidThisMonth.reduce((s, p) => s + Number(p.price), 0);
  const grossRevenue = revenueAvulsoPaid + revenuePackagesPaid;

  const pendingAvulso = completedAvulsos
    .filter((a) => a.payment_status === "pendente")
    .reduce((s, a) => s + Number(a.price), 0);
  const pendingPackages = packages
    .filter((p) => p.status === "ativo" && p.payment_status === "pendente")
    .reduce((s, p) => s + Number(p.price), 0);
  const pending = pendingAvulso + pendingPackages;

  const activePackages = packages.filter((p) => p.status === "ativo").length;
  const totalServices = completedAvulsos.length + appts.filter((a) => a.status === "atendido" && a.package_id).length;
  const avgTicket = totalServices > 0 ? grossRevenue / Math.max(completedAvulsos.length + pkgsPaidThisMonth.length, 1) : 0;

  // Chart: dia a dia (avulsos pagos pelo dia da sessão + pacotes pelo paid_at)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const chartData = days.map((d) => {
    const ds = format(d, "yyyy-MM-dd");
    const avulso = completedAvulsos
      .filter((a) => a.payment_status === "pago" && a.appointment_date === ds)
      .reduce((s, a) => s + Number(a.price), 0);
    const pacote = pkgsPaidThisMonth
      .filter((p) => format(new Date(p.paid_at), "yyyy-MM-dd") === ds)
      .reduce((s, p) => s + Number(p.price), 0);
    return { day: format(d, "dd"), value: Number((avulso + pacote).toFixed(2)) };
  });

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground capitalize">
            {format(new Date(), "MMMM yyyy", { locale: ptBR })}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <Card className="rounded-sm border-border">
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Receita recebida no mês</p>
            <p className="mt-1 text-4xl font-semibold">R$ {grossRevenue.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalServices} sessão(ões) realizada(s) · Ticket médio R$ {avgTicket.toFixed(2)}
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
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Financial;
