import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BrandLogo } from "@/components/BrandLogo";
import { Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { forecastPackageEnd } from "@/lib/packageForecast";

const db = supabase as any;

interface Pkg {
  id: string;
  client_id: string;
  name: string;
  service: string | null;
  total_sessions: number;
  completed_sessions: number;
  price: number;
  status: string;
  payment_status: string;
  paid_at: string | null;
  started_at: string | null;
  created_at: string;
}

const Packages = () => {
  const { user } = useAuth();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("ativo");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    template_id: "custom",
    name: "",
    service: "",
    total_sessions: "10",
    price: "0",
    payment_status: "pendente",
  });

  const [forecasts, setForecasts] = useState<Record<string, Date | null>>({});
  const [closeTarget, setCloseTarget] = useState<Pkg | null>(null);

  const load = async () => {
    const [{ data: pkg }, { data: cli }, { data: svc }, { data: tpl }] = await Promise.all([
      db.from("patient_packages").select("*").order("created_at", { ascending: false }),
      db.from("clients").select("id, name").order("name"),
      db.from("services").select("name").eq("active", true).order("name"),
      db.from("package_templates").select("*").eq("active", true).order("name"),
    ]);
    setPackages(pkg || []);
    setClients(cli || []);
    setServices(svc || []);
    setTemplates(tpl || []);
  };

  useEffect(() => { load(); }, []);

  // Compute forecasts whenever packages change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, Date | null> = {};
      await Promise.all(
        packages
          .filter((p) => p.status === "ativo")
          .map(async (p) => {
            map[p.id] = await forecastPackageEnd(p);
          })
      );
      if (!cancelled) setForecasts(map);
    })();
    return () => { cancelled = true; };
  }, [packages]);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  const filtered = useMemo(() => packages.filter((p) =>
    (filterClient === "all" || p.client_id === filterClient)
    && (filterService === "all" || p.service === filterService)
    && (filterStatus === "all" || p.status === filterStatus)
  ), [packages, filterClient, filterService, filterStatus]);

  const totals = useMemo(() => {
    const now = new Date();
    const ativos = packages.filter((p) => p.status === "ativo");
    const pagoMes = packages
      .filter((p) => {
        if (p.payment_status !== "pago" || !p.paid_at) return false;
        const d = new Date(p.paid_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, p) => s + Number(p.price), 0);
    const pendente = ativos.filter((p) => p.payment_status === "pendente").reduce((s, p) => s + Number(p.price), 0);
    return { ativos: ativos.length, pagoMes, pendente };
  }, [packages]);

  const create = async () => {
    if (!user) return;
    if (!form.client_id || !form.name) { toast.error("Cliente e nome são obrigatórios"); return; }
    const { error } = await db.from("patient_packages").insert({
      user_id: user.id,
      client_id: form.client_id,
      name: form.name,
      service: form.service || null,
      total_sessions: Number(form.total_sessions),
      price: Number(form.price),
      payment_status: form.payment_status,
      paid_at: form.payment_status === "pago" ? new Date().toISOString() : null,
      started_at: new Date().toISOString(),
      status: "ativo",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote criado");
    setOpen(false);
    setForm({ client_id: "", template_id: "custom", name: "", service: "", total_sessions: "10", price: "0", payment_status: "pendente" });
    load();
  };

  const markPaid = async (p: Pkg) => {
    const { error } = await db.from("patient_packages")
      .update({ payment_status: "pago", paid_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const confirmClose = async () => {
    if (!closeTarget) return;
    const { error } = await db.from("patient_packages")
      .update({ status: "encerrado", finished_at: new Date().toISOString() })
      .eq("id", closeTarget.id);
    setCloseTarget(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote encerrado");
    load();
  };

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Pacotes</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="rounded-sm"><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Em execução</p>
            <p className="text-2xl font-semibold">{totals.ativos}</p>
          </CardContent></Card>
          <Card className="rounded-sm"><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recebido (mês)</p>
            <p className="text-2xl font-semibold">R$ {totals.pagoMes.toFixed(0)}</p>
          </CardContent></Card>
          <Card className="rounded-sm"><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pendente</p>
            <p className="text-2xl font-semibold">R$ {totals.pendente.toFixed(0)}</p>
          </CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="rounded-sm flex-1 min-w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos pacientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterService} onValueChange={setFilterService}>
            <SelectTrigger className="rounded-sm flex-1 min-w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos serviços</SelectItem>
              {services.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-sm flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="encerrado">Encerrados</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setOpen(true)} className="rounded-sm gap-2">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card className="rounded-sm border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">Sem pacotes.</CardContent></Card>
          ) : (
            filtered.map((p) => {
              const pct = (p.completed_sessions / p.total_sessions) * 100;
              const f = forecasts[p.id] || null;
              return (
                <Card key={p.id} className="rounded-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{clientName(p.client_id)}{p.service ? ` · ${p.service}` : ""}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="rounded-sm">{p.completed_sessions}/{p.total_sessions}</Badge>
                        <Badge
                          variant={p.payment_status === "pago" ? "default" : "outline"}
                          className="rounded-sm text-[10px] capitalize"
                        >
                          {p.payment_status}
                        </Badge>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>R$ {Number(p.price).toFixed(2)}</span>
                      {f && p.status === "ativo" && (
                        <span>Previsão: {format(f, "dd MMM yyyy", { locale: ptBR })}</span>
                      )}
                    </div>
                    {p.status === "ativo" && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {p.payment_status !== "pago" && (
                          <Button size="sm" variant="outline" className="rounded-sm gap-1" onClick={() => markPaid(p)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pago
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="rounded-sm text-destructive" onClick={() => setCloseTarget(p)}>
                          Encerrar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-sm">
          <DialogHeader><DialogTitle>Novo pacote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modelo (pacote-padrão)</Label>
              <Select
                value={form.template_id}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setForm({ ...form, template_id: v });
                  } else {
                    const t = templates.find((x) => x.id === v);
                    if (t) {
                      setForm({
                        ...form,
                        template_id: v,
                        name: t.name,
                        service: t.default_service || form.service,
                        total_sessions: String(t.default_sessions),
                        price: String(t.default_price),
                      });
                    }
                  }
                }}
              >
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome do pacote</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm" placeholder="Ex: Reabilitação LCA - 10 sessões" />
            </div>
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select value={form.service} onValueChange={(v) => setForm({ ...form, service: v })}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Sessões</Label>
                <Input type="number" min="1" value={form.total_sessions} onChange={(e) => setForm({ ...form, total_sessions: e.target.value })} className="rounded-sm" />
              </div>
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pagamento</Label>
              <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={create} className="w-full rounded-sm">Criar pacote</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTarget && `"${closeTarget.name}" será marcado como encerrado. Sessões já realizadas permanecem no histórico.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>Encerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Packages;
