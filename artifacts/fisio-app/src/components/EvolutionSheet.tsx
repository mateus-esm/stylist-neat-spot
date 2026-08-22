import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { completeAppointment } from "@/lib/appointmentCompletion";
import { finalizeAppointmentMedia } from "@workspace/api-client-react";

const db = supabase as any;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: any;
  onSuccess: () => void;
}

const EvolutionSheet = ({ open, onOpenChange, appointment, onSuccess }: Props) => {
  const { user } = useAuth();
  const [duration, setDuration] = useState("50");
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"pago" | "pendente">("pendente");
  const [packageId, setPackageId] = useState("avulso");
  const [packages, setPackages] = useState<any[]>([]);
  const [painScale, setPainScale] = useState("0");
  const [evolutionNotes, setEvolutionNotes] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;

    setDuration(String(appointment.duration_min || 50));
    setPrice(String(appointment.price || 0));
    setPaymentStatus(appointment.payment_status || "pendente");
    setPackageId(appointment.package_id || "avulso");
    setPainScale(String(appointment.pain_scale ?? 0));
    setEvolutionNotes(appointment.evolution_notes || appointment.observations || "");
    setMediaPreview(appointment.media_url || appointment.photo_url || null);
    setMediaFile(null);

    if (appointment.client_id) fetchPackages(appointment.client_id);
    else setPackages([]);
  }, [open, appointment]);

  const fetchPackages = async (clientId: string) => {
    const { data } = await db
      .from("patient_packages")
      .select("*")
      .eq("client_id", clientId)
      .in("status", ["ativo", "concluido"])
      .order("created_at", { ascending: false });
    setPackages(data || []);
  };

  const handleMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    if (file.type.startsWith("image/")) setMediaPreview(URL.createObjectURL(file));
    else setMediaPreview(null);
  };

  const uploadMedia = async () => {
    if (!user || !mediaFile || !appointment) return appointment?.media_url || appointment?.photo_url || null;

    const ext = mediaFile.name.split(".").pop();
    const path = `${user.id}/${appointment.id}-${Date.now()}.${ext}`;
    const { data: uploadData, error } = await supabase.storage
      .from("service-photos")
      .upload(path, mediaFile, { upsert: true, contentType: mediaFile.type });

    if (error || !uploadData) {
      toast.error("Midia nao enviada", { description: error?.message || "Erro" });
      return appointment?.media_url || appointment?.photo_url || null;
    }

    try {
      await finalizeAppointmentMedia(appointment.id, {
        objectPath: uploadData.path,
        mediaType: mediaFile.type.startsWith("video/") ? "video" : "image",
      });
    } catch (finalizeError) {
      toast.error("Mídia não vinculada à sessão", {
        description: "O arquivo foi enviado, mas não pôde ser associado com segurança.",
      });
      return appointment?.media_url || appointment?.photo_url || null;
    }

    const { data } = supabase.storage.from("service-photos").getPublicUrl(uploadData.path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!user || !appointment) return;
    setLoading(true);

    const selectedPackage = packages.find((pkg) => pkg.id === packageId);
    const packageSessionIndex = selectedPackage
      ? (appointment.package_session_index || Number(selectedPackage.completed_sessions || 0) + 1)
      : null;
    const packageTotal = selectedPackage ? Number(selectedPackage.total_sessions || 0) : null;

    // For package-linked sessions, force price=0 and don't override payment_status of the package.
    const effectivePrice = selectedPackage ? 0 : (parseFloat(price) || 0);
    const effectivePayment = selectedPackage ? "pago" : paymentStatus;

    const mediaUrl = await uploadMedia();
    const { error } = await db
      .from("appointments")
      .update({
        duration_min: parseInt(duration) || 50,
        price: effectivePrice,
        payment_status: effectivePayment,
        package_id: selectedPackage?.id || null,
        package_session_index: packageSessionIndex,
        package_total: packageTotal,
        pain_scale: parseInt(painScale) || 0,
        evolution_notes: evolutionNotes || null,
        observations: evolutionNotes || null,
        media_url: mediaUrl,
        photo_url: mediaUrl,
      })
      .eq("id", appointment.id);

    if (error) {
      setLoading(false);
      toast.error("Erro ao registrar evolucao", { description: error.message });
      return;
    }

    // Use shared helper to mark atendido + increment package counter idempotently
    const { error: completeErr } = await completeAppointment(appointment.id);
    setLoading(false);
    if (completeErr) {
      toast.error("Erro ao concluir sessão", { description: completeErr });
      return;
    }

    toast.success("Evolucao registrada", {
      description: effectivePayment === "pendente" ? "Fluxo operacional concluido; financeiro ficou pendente." : "Sessao e financeiro atualizados.",
    });
    onOpenChange(false);
    onSuccess();
  };

  if (!appointment) return null;

  const selectedPackage = packages.find((pkg) => pkg.id === packageId);
  const nextSession = selectedPackage ? Number(selectedPackage.completed_sessions || 0) + 1 : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Registrar evolucao clinica</SheetTitle>
          <SheetDescription>
            {appointment.client_name} - {appointment.service}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Duracao (min)</Label>
              <Input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Valor (R$)</Label>
              <Input type="number" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="rounded-sm" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vincular a plano</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger className="rounded-sm">
                <SelectValue placeholder="Avulso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avulso">Avulso</SelectItem>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} - sessao {Number(pkg.completed_sessions || 0) + 1} de {pkg.total_sessions}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPackage && (
              <Badge className="rounded-sm bg-foreground text-background">
                Sessao {nextSession} de {selectedPackage.total_sessions}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Financeiro</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pago", "pendente"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setPaymentStatus(status)}
                  className={cn(
                    "rounded-sm border px-3 py-2.5 text-sm font-medium capitalize transition-colors",
                    paymentStatus === status
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {status === "pago" ? "Pago" : "Pendente"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              A evolucao sempre conclui a sessao. Se nao recebeu, mantenha como pendente para o financeiro cobrar depois.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Escala de dor</Label>
            <Input type="number" min="0" max="10" value={painScale} onChange={(event) => setPainScale(event.target.value)} className="rounded-sm" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notas de evolucao</Label>
            <Textarea
              placeholder="Exercicios, cargas, amplitude, dor, conduta e resposta do paciente"
              value={evolutionNotes}
              onChange={(event) => setEvolutionNotes(event.target.value)}
              rows={6}
              className="rounded-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Midia clinica</Label>
            <label className="relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-secondary/40 transition-colors hover:border-foreground/40">
              {mediaPreview ? (
                <img src={mediaPreview} alt="Preview clinico" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">{mediaFile ? mediaFile.name : "Foto de postura ou video de exercicio"}</span>
                </div>
              )}
              <input type="file" accept="image/*,video/*" onChange={handleMedia} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full rounded-sm" size="lg">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="mr-2 h-5 w-5" /> Concluir sessao</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EvolutionSheet;
