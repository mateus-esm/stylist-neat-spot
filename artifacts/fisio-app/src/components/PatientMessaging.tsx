import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clinicApi } from "@/lib/clinicApi";
import { toast } from "sonner";

export default function PatientMessaging({ clientId, phone }: { clientId: string; phone?: string }) {
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setOptedIn(null);
    setError(false);
    clinicApi.getConsent(clientId).then((r) => { if (active) setOptedIn(!!r.optedIn); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [clientId, refresh]);

  async function change() {
    if (optedIn === null || busy) return;
    if (!optedIn && !window.confirm("O paciente autorizou receber convites e avisos de agendamento neste número?")) return;
    setBusy(true);
    try {
      const result = await clinicApi.consent({ clientId, optedIn: !optedIn });
      setOptedIn(result.optedIn);
      toast.success(result.optedIn ? "Autorização registrada" : "Avisos desativados");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-2 rounded-lg border p-3">
    <h3 className="text-sm font-semibold">WhatsApp do paciente</h3>
    <p className="break-words text-sm text-muted-foreground">{phone || "Cadastre um telefone para enviar avisos."}
      {phone && optedIn !== null && (optedIn ? " · Avisos autorizados" : " · Sem autorização registrada")}</p>
    {error ? <Button size="sm" variant="outline" onClick={() => setRefresh((n) => n + 1)}>Recarregar preferência</Button>
      : phone && <Button size="sm" variant="outline" disabled={busy || optedIn === null} onClick={change}>
        {optedIn ? "Desativar avisos" : "Registrar autorização"}
      </Button>}
  </section>;
}
