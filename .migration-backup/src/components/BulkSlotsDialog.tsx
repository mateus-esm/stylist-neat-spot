import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
const WEEKDAYS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" },
  { v: 3, l: "Qua" }, { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sab" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

const BulkSlotsDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string>("none");

  // Recurring
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [startHour, setStartHour] = useState("08:00");
  const [endHour, setEndHour] = useState("12:00");
  const [duration, setDuration] = useState("60");
  const [weeks, setWeeks] = useState("4");
  const [recurStart, setRecurStart] = useState(format(new Date(), "yyyy-MM-dd"));

  // Multi
  const [entries, setEntries] = useState<{ date: string; start: string; end: string }[]>([
    { date: format(new Date(), "yyyy-MM-dd"), start: "08:00", end: "09:00" },
  ]);

  useEffect(() => {
    if (open) db.from("clients").select("id, name").order("name").then(({ data }: any) => setClients(data || []));
  }, [open]);

  const toggleDay = (d: number) =>
    setDays((curr) => curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d].sort());

  const addEntry = () => setEntries([...entries, { date: format(new Date(), "yyyy-MM-dd"), start: "08:00", end: "09:00" }]);
  const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, k: string, v: string) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));

  const buildSlot = (slot_date: string, start_time: string, end_time: string) => {
    const reserved = clientId !== "none";
    return {
      user_id: user!.id,
      slot_date,
      start_time,
      end_time,
      status: reserved ? "reservado" : "aberto",
      reserved_for_client_id: reserved ? clientId : null,
    };
  };

  const submitRecurring = async () => {
    if (!user) return;
    if (!days.length) return toast.error("Selecione ao menos um dia");
    const [sh, sm] = startHour.split(":").map(Number);
    const [eh, em] = endHour.split(":").map(Number);
    const dur = Number(duration);
    const totalMinStart = sh * 60 + sm;
    const totalMinEnd = eh * 60 + em;
    if (dur <= 0 || totalMinEnd <= totalMinStart) return toast.error("Faixa horária inválida");

    const rows: any[] = [];
    const base = new Date(recurStart + "T12:00:00");
    const total = Number(weeks) * 7;
    for (let i = 0; i < total; i++) {
      const d = addDays(base, i);
      if (!days.includes(d.getDay())) continue;
      const dateStr = format(d, "yyyy-MM-dd");
      for (let t = totalMinStart; t + dur <= totalMinEnd; t += dur) {
        const s = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const eMin = t + dur;
        const e = `${String(Math.floor(eMin / 60)).padStart(2, "0")}:${String(eMin % 60).padStart(2, "0")}`;
        rows.push(buildSlot(dateStr, s, e));
      }
    }
    if (!rows.length) return toast.error("Nenhum slot gerado");
    const { error } = await db.from("availability_slots").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} horários criados`);
    onCreated();
    onOpenChange(false);
  };

  const submitMulti = async () => {
    if (!user) return;
    const rows = entries
      .filter((e) => e.date && e.start && e.end)
      .map((e) => buildSlot(e.date, e.start, e.end));
    if (!rows.length) return toast.error("Adicione ao menos um horário");
    const { error } = await db.from("availability_slots").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} horários criados`);
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-sm">
        <DialogHeader><DialogTitle>Abrir horários em lote</DialogTitle></DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Reservar para paciente (opcional)</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aberto a todos</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="recur" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recur">Recorrente</TabsTrigger>
            <TabsTrigger value="multi">Lista</TabsTrigger>
          </TabsList>

          <TabsContent value="recur" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <label key={d.v} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={days.includes(d.v)} onCheckedChange={() => toggleDay(d.v)} />
                    {d.l}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} className="rounded-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} className="rounded-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Duração (min)</Label>
                <Input type="number" min="15" step="15" value={duration} onChange={(e) => setDuration(e.target.value)} className="rounded-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Semanas</Label>
                <Input type="number" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="rounded-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">A partir de</Label>
                <Input type="date" value={recurStart} onChange={(e) => setRecurStart(e.target.value)} className="rounded-sm" />
              </div>
            </div>
            <Button onClick={submitRecurring} className="w-full rounded-sm">Criar horários</Button>
          </TabsContent>

          <TabsContent value="multi" className="space-y-2 mt-3">
            {entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 items-end">
                <Input type="date" value={e.date} onChange={(ev) => updateEntry(i, "date", ev.target.value)} className="rounded-sm" />
                <Input type="time" value={e.start} onChange={(ev) => updateEntry(i, "start", ev.target.value)} className="rounded-sm" />
                <Input type="time" value={e.end} onChange={(ev) => updateEntry(i, "end", ev.target.value)} className="rounded-sm" />
                <Button variant="ghost" size="icon" onClick={() => removeEntry(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEntry} className="rounded-sm gap-1">
              <Plus className="h-3 w-3" /> Adicionar linha
            </Button>
            <Button onClick={submitMulti} className="w-full rounded-sm">Criar horários</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default BulkSlotsDialog;
