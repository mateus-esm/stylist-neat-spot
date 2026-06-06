import { useEffect, useState } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { MessageCircle, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const Planning = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [exercises, setExercises] = useState("");
  const [scheduling, setScheduling] = useState("");
  const [tips, setTips] = useState("");

  const load = async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      db.from("clients").select("id, name, phone").order("name"),
      db.from("session_plans").select("*").order("week_start", { ascending: false }).limit(50),
    ]);
    setClients(c || []);
    setPlans(p || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!user || !clientId || !title) return toast.error("Paciente e título são obrigatórios");
    const { error } = await db.from("session_plans").insert({
      user_id: user.id, client_id: clientId, week_start: weekStart, title, content,
    });
    if (error) return toast.error(error.message);
    toast.success("Plano salvo");
    setTitle(""); setContent("");
    load();
  };

  const remove = async (id: string) => {
    await db.from("session_plans").delete().eq("id", id);
    load();
  };

  const notify = async (plan: any) => {
    const c = clients.find((x) => x.id === plan.client_id);
    const phone = c?.phone?.replace(/\D/g, "");
    if (!phone) return toast.error("Paciente sem telefone");
    const full = phone.startsWith("55") ? phone : `55${phone}`;
    const wk = format(new Date(plan.week_start + "T12:00:00"), "dd/MM");
    const msg = encodeURIComponent(
      `Olá ${c.name}! Seu plano da semana de ${wk}:\n\n*${plan.title}*\n${plan.content}\n\nNos vemos em breve — Lucas Rocha Fisio`
    );
    window.open(`https://wa.me/${full}?text=${msg}`, "_blank");
    await db.from("session_plans").update({ notified_at: new Date().toISOString() }).eq("id", plan.id);
    load();
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Planejamento</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <Card className="rounded-sm">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Novo plano da semana</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Paciente</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="rounded-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Semana iniciando</Label>
                <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Foco em fortalecimento posterior" className="rounded-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Conteúdo do plano</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Objetivos da semana, exercícios prioritários, observações para o paciente..."
                className="rounded-sm"
              />
            </div>
            <Button onClick={save} className="w-full rounded-sm">Salvar plano</Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Planos recentes</p>
          {plans.length === 0 ? (
            <Card className="rounded-sm border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum plano criado.</CardContent></Card>
          ) : plans.map((p) => (
            <Card key={p.id} className="rounded-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {clientName(p.client_id)} · semana de {format(new Date(p.week_start + "T12:00:00"), "dd 'de' MMM", { locale: ptBR })}
                    </p>
                  </div>
                  {p.notified_at && <Badge variant="outline" className="rounded-sm text-[10px]">Notificado</Badge>}
                </div>
                {p.content && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{p.content}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => notify(p)} variant="outline" size="sm" className="rounded-sm gap-2">
                    <MessageCircle className="h-3.5 w-3.5" /> Notificar WhatsApp
                  </Button>
                  <Button onClick={() => remove(p.id)} variant="ghost" size="sm" className="rounded-sm text-destructive gap-2">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Planning;
