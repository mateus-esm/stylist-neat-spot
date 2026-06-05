import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CalendarClock, Layers } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import BulkSlotsDialog from "@/components/BulkSlotsDialog";

const db = supabase as any;

const Availability = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [status, setStatus] = useState<"aberto" | "bloqueado">("aberto");
  const [reason, setReason] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const fetchSlots = async () => {
    const { data } = await db
      .from("availability_slots")
      .select("*")
      .gte("slot_date", today)
      .order("slot_date")
      .order("start_time");
    setSlots(data || []);
  };

  useEffect(() => { fetchSlots(); }, [user]);

  const addSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await db.from("availability_slots").insert({
      user_id: user.id,
      slot_date: date,
      start_time: start,
      end_time: end,
      status,
      reason: reason || null,
    });
    if (error) return toast.error(error.message);
    toast.success(status === "bloqueado" ? "Horario bloqueado" : "Slot adicionado");
    setReason("");
    fetchSlots();
  };

  const removeSlot = async (id: string) => {
    if (!confirm("Remover este horario?")) return;
    const { error } = await db.from("availability_slots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    fetchSlots();
  };

  const grouped = slots.reduce((acc: Record<string, any[]>, s) => {
    (acc[s.slot_date] = acc[s.slot_date] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <Badge variant="outline" className="rounded-sm text-[10px] uppercase tracking-wider">Disponibilidade</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <Button onClick={() => setBulkOpen(true)} variant="outline" className="w-full rounded-sm gap-2">
          <Layers className="h-4 w-4" /> Abrir horários em lote
        </Button>
        <Card className="rounded-sm">
          <CardContent className="p-4">
            <form onSubmit={addSlot} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-primary" /> Novo slot
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="rounded-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required className="rounded-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required className="rounded-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberto">Disponivel</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-sm" placeholder="Ex: almoco" />
                </div>
              </div>
              <Button type="submit" className="w-full rounded-sm gap-1"><Plus className="h-4 w-4" /> Adicionar</Button>
            </form>
          </CardContent>
        </Card>

        {Object.keys(grouped).length === 0 ? (
          <Card className="rounded-sm border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Sem horarios cadastrados.</CardContent></Card>
        ) : (
          (Object.entries(grouped) as [string, any[]][]).map(([day, daySlots]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {format(new Date(day + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
              {daySlots.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-sm border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</p>
                    {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
                  </div>
                  <Badge variant={s.status === "aberto" ? "default" : s.status === "reservado" ? "outline" : "secondary"} className="rounded-sm capitalize">{s.status}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => removeSlot(s.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                </div>
              ))}
            </div>
          ))
        )}
      </main>
    </div>
  );
};

export default Availability;
