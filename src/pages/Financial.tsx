import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const Financial = () => {
  const { user } = useAuth();
  const [appts, setAppts] = useState<any[]>([]);

  useEffect(() => { if (user) fetchData(); }, [user]);

  const fetchData = async () => {
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
    const { data } = await supabase
      .from("appointments")
      .select("appointment_date, price, status, payment_status")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd);
    setAppts(data || []);
  };

  const completed = appts.filter((a) => a.status === "atendido");
  const grossRevenue = completed.reduce((s, a) => s + Number(a.price), 0);
  const pending = completed.filter((a) => a.payment_status === "pendente").reduce((s, a) => s + Number(a.price), 0);
  const totalServices = completed.length;

  // chart data: revenue per day
  const days = eachDayOfInterval({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
  const chartData = days.map((d) => {
    const ds = format(d, "yyyy-MM-dd");
    const total = completed
      .filter((a) => a.appointment_date === ds)
      .reduce((s, a) => s + Number(a.price), 0);
    return { day: format(d, "dd"), value: Number(total.toFixed(2)) };
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
        {/* Hero card */}
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/40">
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Faturamento bruto</p>
            <p className="mt-1 text-4xl font-bold text-gradient-brand">
              R$ {grossRevenue.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{totalServices} atendimento{totalServices !== 1 ? "s" : ""} concluído{totalServices !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-warning">
                <AlertCircle className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-wider">Pendente</p>
              </div>
              <p className="text-2xl font-bold">R$ {pending.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-wider">Recebido</p>
              </div>
              <p className="text-2xl font-bold">R$ {(grossRevenue - pending).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Receita por dia</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <defs>
                  <linearGradient id="brandBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, "Receita"]}
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar dataKey="value" fill="url(#brandBar)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Financial;