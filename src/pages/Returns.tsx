import { useState, useEffect } from "react";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Copy, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

interface ClientReturn {
  id: string;
  name: string;
  phone: string | null;
  return_days: number;
  last: string;
  days_since: number;
  overdue_by: number;
}

const Returns = () => {
  const { user } = useAuth();
  const [returns, setReturns] = useState<ClientReturn[]>([]);

  useEffect(() => { if (user) fetchReturns(); }, [user]);

  const fetchReturns = async () => {
    const { data: clients } = await supabase.from("clients").select("*");
    if (!clients) return;
    const { data: appts } = await supabase
      .from("appointments")
      .select("client_id, appointment_date")
      .eq("status", "atendido")
      .order("appointment_date", { ascending: false });

    const lastByClient: Record<string, string> = {};
    appts?.forEach((a) => {
      if (a.client_id && !lastByClient[a.client_id]) lastByClient[a.client_id] = a.appointment_date;
    });

    const list: ClientReturn[] = [];
    for (const c of clients) {
      const last = lastByClient[c.id];
      if (!last) continue;
      const daysSince = differenceInDays(new Date(), new Date(last + "T12:00:00"));
      const targetDays = c.return_days || 30;
      if (daysSince >= targetDays) {
        list.push({
          id: c.id, name: c.name, phone: c.phone,
          return_days: targetDays, last,
          days_since: daysSince, overdue_by: daysSince - targetDays,
        });
      }
    }
    list.sort((a, b) => b.overdue_by - a.overdue_by);
    setReturns(list);
  };

  const message = (name: string) =>
    `Olá ${name}! Faz um tempo desde seu último corte. Que tal agendar? ✂️ — Duda Hair`;

  const openWhatsApp = (phone: string, name: string) => {
    const clean = phone.replace(/\D/g, "");
    const full = clean.startsWith("55") ? clean : `55${clean}`;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(message(name))}`, "_blank");
  };

  const copyMsg = (name: string) => {
    navigator.clipboard.writeText(message(name));
    toast.success("Mensagem copiada");
  };

  const urgency = (overdueBy: number) => {
    if (overdueBy >= 30) return { label: "Crítico", color: "text-destructive bg-destructive/15 border-destructive/40" };
    if (overdueBy >= 14) return { label: "Atrasado", color: "text-warning bg-warning/15 border-warning/40" };
    return { label: "No prazo", color: "text-primary bg-primary/15 border-primary/40" };
  };

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <div className="text-right">
            <p className="text-2xl font-bold text-gradient-brand">{returns.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">retornos</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-2 px-4 pt-4">
        {returns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">Tudo em dia ✨</p>
            </CardContent>
          </Card>
        ) : (
          returns.map((r) => {
            const u = urgency(r.overdue_by);
            return (
              <Card key={r.id} className="border-border/60">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border", u.color)}>
                    <span className="text-lg font-bold leading-none">{r.days_since}</span>
                    <span className="text-[8px] uppercase">dias</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Último: {format(new Date(r.last + "T12:00:00"), "dd MMM", { locale: ptBR })} • +{r.overdue_by}d atraso
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => copyMsg(r.name)} className="h-9 w-9">
                      <Copy className="h-4 w-4" />
                    </Button>
                    {r.phone && (
                      <Button
                        size="icon"
                        onClick={() => openWhatsApp(r.phone!, r.name)}
                        className="h-9 w-9 bg-success text-success-foreground hover:bg-success/90"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Returns;