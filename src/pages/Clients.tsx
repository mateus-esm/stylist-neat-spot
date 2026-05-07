import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, Instagram, ChevronDown, ChevronRight, Edit3, Star } from "lucide-react";
import ClientForm from "@/components/ClientForm";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const Clients = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, any[]>>({});
  const [stats, setStats] = useState<Record<string, { total: number; last: string | null }>>({});

  const fetchClients = async () => {
    if (!user) return;
    let q = supabase.from("clients").select("*").order("name");
    if (search) q = q.ilike("name", `%${search}%`);
    const { data } = await q;
    if (!data) return;
    setClients(data);

    // batch stats
    const { data: appts } = await supabase
      .from("appointments")
      .select("client_id, appointment_date, status")
      .eq("status", "atendido");
    const s: Record<string, { total: number; last: string | null }> = {};
    appts?.forEach((a) => {
      if (!a.client_id) return;
      if (!s[a.client_id]) s[a.client_id] = { total: 0, last: null };
      s[a.client_id].total++;
      if (!s[a.client_id].last || a.appointment_date > s[a.client_id].last!)
        s[a.client_id].last = a.appointment_date;
    });
    setStats(s);
  };

  useEffect(() => { fetchClients(); }, [user, search]);

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!history[id]) {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("client_id", id)
        .order("appointment_date", { ascending: false })
        .limit(20);
      setHistory({ ...history, [id]: data || [] });
    }
  };

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl px-4 py-3">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-center justify-between">
            <BrandLogo size="sm" />
            <Badge variant="outline" className="text-xs">{clients.length} clientes</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-2 px-4 pt-4">
        {clients.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <p className="text-sm">Nenhum cliente cadastrado</p>
            </CardContent>
          </Card>
        ) : (
          clients.map((c) => {
            const st = stats[c.id] || { total: 0, last: null };
            const isOpen = expanded === c.id;
            return (
              <Card key={c.id} className="overflow-hidden border-border/60 transition-colors hover:border-primary/30">
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-primary-foreground">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.instagram && <span className="flex items-center gap-1"><Instagram className="h-3 w-3" />{c.instagram}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm font-bold text-gradient-brand">
                      <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                      {st.total}
                    </div>
                    <p className="text-[10px] text-muted-foreground">visitas</p>
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border/60 bg-secondary/20 p-4">
                    {c.notes && (
                      <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
                        <span className="font-semibold text-warning">⚠ </span>{c.notes}
                      </div>
                    )}
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Histórico</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setEditingClient(c); setFormOpen(true); }}
                        className="h-7 gap-1 text-xs"
                      >
                        <Edit3 className="h-3 w-3" /> Editar
                      </Button>
                    </div>
                    {(history[c.id] || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem histórico ainda</p>
                    ) : (
                      <ol className="relative space-y-2 border-l border-border/60 pl-4">
                        {history[c.id].map((h) => (
                          <li key={h.id} className="relative">
                            <span className={cn(
                              "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full",
                              h.status === "atendido" ? "bg-success" : h.status === "faltou" ? "bg-destructive" : "bg-muted-foreground"
                            )} />
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div>
                                <p className="font-medium">{h.service}</p>
                                <p className="text-muted-foreground">
                                  {format(new Date(h.appointment_date + "T12:00:00"), "dd MMM yyyy", { locale: ptBR })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-primary">R$ {Number(h.price).toFixed(2)}</p>
                                {h.satisfaction && (
                                  <div className="flex justify-end">
                                    {Array.from({ length: h.satisfaction }).map((_, i) => (
                                      <Star key={i} className="h-2.5 w-2.5 fill-accent text-accent" />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}

        <Button
          onClick={() => { setEditingClient(null); setFormOpen(true); }}
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      <ClientForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchClients}
        client={editingClient}
      />
    </div>
  );
};

export default Clients;