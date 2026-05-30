import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Check } from "lucide-react";
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
  order_index: number;
}

const emptyForm = { name: "", sets: "", reps: "", load: "", notes: "" };

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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {exercises.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Nenhum exercício prescrito.</p>
        )}
        {exercises.map((ex) => (
          <div
            key={ex.id}
            className={cn(
              "rounded-lg border border-border bg-card p-3",
              ex.completed_at && "border-success/40 bg-success/5"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{ex.name}</p>
                  {ex.completed_at && <Check className="h-3.5 w-3.5 text-success" />}
                </div>
                <p className="text-xs text-muted-foreground font-mono-data mt-0.5">
                  {[
                    ex.sets && `${ex.sets} séries`,
                    ex.reps && `${ex.reps} reps`,
                    ex.load && ex.load,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                {ex.notes && <p className="text-xs text-muted-foreground mt-1">{ex.notes}</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(ex.id)}
                className="h-7 w-7 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Adicionar exercício
        </Label>
        <Input
          placeholder="Nome do exercício"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Séries"
            type="number"
            value={form.sets}
            onChange={(e) => setForm({ ...form, sets: e.target.value })}
          />
          <Input
            placeholder="Reps"
            value={form.reps}
            onChange={(e) => setForm({ ...form, reps: e.target.value })}
          />
          <Input
            placeholder="Carga"
            value={form.load}
            onChange={(e) => setForm({ ...form, load: e.target.value })}
          />
        </div>
        <Textarea
          placeholder="Observações (opcional)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
        />
        <Button onClick={add} disabled={saving} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" /> Adicionar
        </Button>
      </div>
    </div>
  );
};

export default PrescriptionTab;
