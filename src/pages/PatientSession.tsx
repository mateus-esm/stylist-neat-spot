import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, PlayCircle, Save } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const PatientSession = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [pain, setPain] = useState<string>("");
  const [obs, setObs] = useState("");

  const load = async () => {
    if (!id) return;
    const { data: a } = await db.from("appointments").select("*").eq("id", id).maybeSingle();
    setAppointment(a);
    if (a) {
      setPain(a.pain_scale != null ? String(a.pain_scale) : "");
      setObs(a.observations ?? "");
    }
    const { data: ex } = await db.from("session_exercises").select("*").eq("appointment_id", id).order("order_index");
    setExercises(ex || []);
  };

  useEffect(() => { load(); }, [id]);

  const startSession = async () => {
    const { error } = await db.from("appointments").update({ status: "em_andamento" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Sessao iniciada");
    load();
  };

  const saveFeedback = async () => {
    const { error } = await db.from("appointments").update({
      pain_scale: pain === "" ? null : Number(pain),
      observations: obs || null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro salvo");
  };

  const toggleExercise = async (ex: any) => {
    const completed_at = ex.completed_at ? null : new Date().toISOString();
    const { error } = await db.from("session_exercises").update({ completed_at }).eq("id", ex.id);
    if (error) return toast.error(error.message);
    setExercises((rows) => rows.map((r) => (r.id === ex.id ? { ...r, completed_at } : r)));
  };

  if (!appointment) return <div className="p-6">Carregando...</div>;

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1 -ml-2">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground capitalize">
            {format(new Date(appointment.appointment_date + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })} · {appointment.appointment_time?.slice(0,5)}
          </p>
          <h1 className="text-xl font-semibold">{appointment.service}</h1>
          <Badge variant="outline" className="rounded-sm mt-1 capitalize">{appointment.status}</Badge>
        </div>

        {appointment.status === "agendado" && (
          <Button onClick={startSession} className="w-full rounded-sm gap-2">
            <PlayCircle className="h-4 w-4" /> Cheguei / Iniciar sessao
          </Button>
        )}

        <Card className="rounded-sm">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Exercicios prescritos</p>
            {exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum exercicio prescrito.</p>
            ) : (
              <ul className="space-y-2">
                {exercises.map((ex) => (
                  <li key={ex.id} className="flex items-start gap-3 rounded-sm border border-border p-3">
                    <Checkbox checked={!!ex.completed_at} onCheckedChange={() => toggleExercise(ex)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${ex.completed_at ? "line-through text-muted-foreground" : ""}`}>{ex.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[ex.sets && `${ex.sets}x`, ex.reps, ex.load && `· ${ex.load}`, ex.rest_seconds && `· ${ex.rest_seconds}s desc`].filter(Boolean).join(" ")}
                      </p>
                      {ex.notes && <p className="text-xs text-muted-foreground mt-1">{ex.notes}</p>}
                      {ex.video_url && <a href={ex.video_url} target="_blank" rel="noreferrer" className="text-xs text-primary">Ver video</a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-sm">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Como voce esta?</p>
            <div className="space-y-2">
              <Label className="text-xs">Dor (0 a 10)</Label>
              <Input type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Observacoes</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="rounded-sm" />
            </div>
            <Button onClick={saveFeedback} className="w-full rounded-sm gap-2"><Save className="h-4 w-4" /> Salvar</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PatientSession;
