import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clinicApi, type BookingRequest } from "@/lib/clinicApi";
import { appointmentStatusLabel } from "@/lib/statusLabels";

export default function PendingRequestsBanner({ onChange }: { onChange?: () => void }) {
  const [params, setParams] = useSearchParams();
  const target = params.get("solicitacao") || undefined;
  const [rows, setRows] = useState<BookingRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    const load = () => clinicApi.bookingRequests(target).then((result) => {
      if (active) { setRows(result); setError(""); setLoaded(true); }
    }).catch((err) => { if (active) setError(err.message); });
    void load();
    const timer = window.setInterval(reload, 30000);
    window.addEventListener("focus", reload);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", reload); };
  }, [target, refresh, reload]);

  async function review(id: string, decision: "approve" | "decline") {
    setBusy(true);
    try {
      await clinicApi.reviewBooking(id, decision);
      toast.success(decision === "approve" ? "Horário aprovado" : "Pedido recusado e horário liberado");
      onChange?.();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Tente novamente."); }
    finally { setBusy(false); reload(); }
  }
  if (error) return <div role="alert" className="mb-4 rounded-lg border p-3 text-sm">Não foi possível carregar os pedidos. <Button size="sm" variant="outline" onClick={reload}>Tentar novamente</Button></div>;
  if (!target && !rows.length) return null;
  return <section className="mb-4 space-y-2 rounded-lg border border-primary/40 bg-card p-4">
    {target ? <div className="flex items-center justify-between"><h2 className="font-semibold">Pedido de sessão</h2><Button variant="ghost" size="sm" onClick={() => {setExpanded(true); setParams({});}}>Ver todos</Button></div>
      : <button className="w-full py-2 text-left font-semibold" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Pedidos de sessão ({rows.length})</button>}
    {(target || expanded) && rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div><p className="font-semibold">{row.clientName}</p><p className="text-sm">{format(new Date(row.appointmentDate + "T12:00:00"), "EEE, dd/MM", { locale: ptBR })} · {row.appointmentTime.slice(0, 5)}</p></div>
      {row.status === "solicitado" ? <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => review(row.id, "decline")}>Recusar</Button><Button disabled={busy} onClick={() => review(row.id, "approve")}>Aprovar</Button></div> : <span className="text-sm">{appointmentStatusLabel(row.status)}</span>}
    </div>)}
    {target && !rows.length && <p className="text-sm text-muted-foreground">{loaded ? "Pedido indisponível nesta clínica." : "Carregando pedido…"}</p>}
  </section>;
}
