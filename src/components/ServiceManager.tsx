import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

interface Service {
  id: string;
  name: string;
  default_duration_min: number;
  default_price: number;
  active: boolean;
}

const ServiceManager = () => {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({ name: "", default_duration_min: "60", default_price: "0" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await db.from("services").select("*").order("name");
    setServices(data || []);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const { error } = await db.from("services").insert({
      user_id: user.id,
      name: form.name.trim(),
      default_duration_min: Number(form.default_duration_min) || 60,
      default_price: Number(form.default_price) || 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setForm({ name: "", default_duration_min: "60", default_price: "0" });
    load();
  };

  const toggle = async (s: Service) => {
    const { error } = await db.from("services").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover serviço?")) return;
    const { error } = await db.from("services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhum serviço cadastrado.</p>
        ) : (
          services.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {s.default_duration_min} min · R$ {Number(s.default_price).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.active} onCheckedChange={() => toggle(s)} />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-sm border border-dashed border-border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Novo serviço</Label>
        <Input placeholder="Nome (ex: Liberação Miofascial)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm" />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Duração (min)" value={form.default_duration_min} onChange={(e) => setForm({ ...form, default_duration_min: e.target.value })} className="rounded-sm" />
          <Input type="number" step="0.01" placeholder="Preço padrão" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} className="rounded-sm" />
        </div>
        <Button onClick={add} disabled={saving} size="sm" className="w-full rounded-sm">
          <Plus className="h-4 w-4 mr-2" /> Adicionar
        </Button>
      </div>
    </div>
  );
};

export default ServiceManager;
