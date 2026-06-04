import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, Check, Smile, Meh, Frown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  appointmentId: string;
}

interface Exercise {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  load: string | null;
  notes: string | null;
  completed_at: string | null;
  performance: string | null;
  order_index: number;
}

const emptyForm = { name: "", sets: "", reps: "", load: "", notes: "" };

const perfMeta: Record<string, { label: string; icon: any; cls: string }> = {
  good: { label: "Bom", icon: Smile, cls: "text-success" },
  neutral: { label: "Neutro", icon: Meh, cls: "text-muted-foreground" },
  bad: { label: "Difícil", icon: Frown, cls: "text-destructive" },
};

const PrescriptionTab = ({ appointmentId }: Props) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchEx = async () => {
    const { data } = await supabase
      .from("session_exercises")
      .select("*")
      .eq("appointment_id", appointmentId)
      .order("order_index");
    setExercises((data as any) || []);
  };

  useEffect(() => {
    if (appointmentId) fetchEx();
  }, [appointmentId]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const { error } = await supabase.from("session_exercises").insert({
      appointment_id: appointmentId,
      name: form.name.trim(),
      sets: form.sets ? Number(form.sets) : null,
      reps: form.reps || null,
      load: form.load || null,
      notes: form.notes || null,
      order_index: exercises.length,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setForm(emptyForm);
    fetchEx();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("session_exercises").delete().eq("id", id);
    if (error) return toast.error(error.message);
    fetchEx();
  };

  const toggleDone = async (ex: Exercise) => {
    const completed_at = ex.completed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("session_exercises").update({ completed_at }).eq("id", ex.id);
    if (error) return toast.error(error.message);
    setExercises((rows) => rows.map((r) => (r.id === ex.id ? { ...r, completed_at } : r)));
  };

  const setPerf = async (ex: Exercise, performance: string) => {
    const next = ex.performance === performance ? null : performance;
    const { error } = await supabase.from("session_exercises").update({ performance: next }).eq("id", ex.id);
    if (error) return toast.error(error.message);
    setExercises((rows) => rows.map((r) => (r.id === ex.id ? { ...r, performance: next } : r)));
  };

  const doneCount = exercises.filter((e) => e.completed_at).length;
  const pct = exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {exercises.length > 0 && (
        <div className="rounded-sm border border-border bg-secondary/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Conclusão da sessão</span>
            <span className="font-semibold">{doneCount}/{exercises.length} · {pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      <div className="space-y-2">
        {exercises.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Nenhum exercício prescrito.</p>
        )}
        {exercises.map((ex) => {
          const perf = ex.performance ? perfMeta[ex.performance] : null;
          const Icon = perf?.icon;
          return (
            <div
              key={ex.id}
              className={cn(
                "rounded-sm border border-border bg-card p-3 space-y-2",
                ex.completed_at && "border-success/40 bg-success/5"
              )}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={!!ex.completed_at}
                  onCheckedChange={() => toggleDone(ex)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn("text-sm font-semibold", ex.completed_at && "line-through text-muted-foreground")}>{ex.name}</p>
                    {ex.completed_at && <Check className="h-3.5 w-3.5 text-success" />}
                    {Icon && perf && (
                      <span className={cn("flex items-center gap-1 text-[10px] uppercase tracking-wider", perf.cls)}>
                        <Icon className="h-3 w-3" /> {perf.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      ex.sets && `${ex.sets} séries`,
                      ex.reps && `${ex.reps} reps`,
                      ex.load && ex.load,
                    ].filter(Boolean).join(" • ")}
                  </p>
                  {ex.notes && <p className="text-xs text-muted-foreground mt-1">{ex.notes}</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(ex.id)} className="h-7 w-7 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex gap-2 pl-6">
                {(["good", "neutral", "bad"] as const).map((key) => {
                  const meta = perfMeta[key];
                  const MetaIcon = meta.icon;
                  const active = ex.performance === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPerf(ex, key)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-sm border px-2 py-1.5 text-[11px] uppercase tracking-wider transition",
                        active ? `${meta.cls} border-current bg-secondary/40` : "border-border text-muted-foreground hover:border-foreground/40"
                      )}
                    >
                      <MetaIcon className="h-3.5 w-3.5" /> {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-sm border border-dashed border-border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Adicionar exercício</Label>
        <Input placeholder="Nome do exercício" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="Séries" type="number" value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} />
          <Input placeholder="Reps" value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} />
          <Input placeholder="Carga" value={form.load} onChange={(e) => setForm({ ...form, load: e.target.value })} />
        </div>
        <Textarea placeholder="Observações (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        <Button onClick={add} disabled={saving} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" /> Adicionar
        </Button>
      </div>
    </div>
  );
};

export default PrescriptionTab;
