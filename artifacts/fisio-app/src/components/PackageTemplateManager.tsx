import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const PackageTemplateManager = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("10");
  const [price, setPrice] = useState("0");
  const [service, setService] = useState("");

  const load = async () => {
    const { data } = await db.from("package_templates").select("*").order("name");
    setItems(data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!user || !name) { toast.error("Informe o nome"); return; }
    const { error } = await db.from("package_templates").insert({
      user_id: user.id,
      name,
      default_sessions: Number(sessions),
      default_price: Number(price),
      default_service: service || null,
    });
    if (error) { toast.error(error.message); return; }
    setName(""); setSessions("10"); setPrice("0"); setService("");
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await db.from("package_templates").update({ active: !active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await db.from("package_templates").delete().eq("id", id);
    load();
  };

  return (
    <Card className="rounded-sm">
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 items-end">
          <Input placeholder="Nome (ex: LCA)" value={name} onChange={(e) => setName(e.target.value)} className="rounded-sm" />
          <Input type="number" placeholder="Sessões" value={sessions} onChange={(e) => setSessions(e.target.value)} className="rounded-sm" />
          <Input type="number" step="0.01" placeholder="Preço" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-sm" />
          <Input placeholder="Serviço" value={service} onChange={(e) => setService(e.target.value)} className="rounded-sm" />
          <Button onClick={add} size="icon" className="rounded-sm"><Plus className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum pacote-padrão cadastrado.</p>
          ) : items.map((t) => (
            <div key={t.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-sm border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-[11px] text-muted-foreground">{t.default_sessions} sessões · R$ {Number(t.default_price).toFixed(2)}{t.default_service ? ` · ${t.default_service}` : ""}</p>
              </div>
              <Badge variant={t.active ? "default" : "secondary"} className="rounded-sm cursor-pointer" onClick={() => toggle(t.id, t.active)}>
                {t.active ? "Ativo" : "Inativo"}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PackageTemplateManager;
