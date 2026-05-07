import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Star, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: any;
  onSuccess: () => void;
}

const ServiceLogSheet = ({ open, onOpenChange, appointment, onSuccess }: Props) => {
  const { user } = useAuth();
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"pago" | "pendente">("pago");
  const [satisfaction, setSatisfaction] = useState<number>(5);
  const [observations, setObservations] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && appointment) {
      setDuration(String(appointment.duration_min || 30));
      setPrice(String(appointment.price || 0));
      setPaymentStatus(appointment.payment_status || "pago");
      setSatisfaction(appointment.satisfaction || 5);
      setObservations(appointment.observations || "");
      setPhotoPreview(appointment.photo_url || null);
      setPhotoFile(null);
    }
  }, [open, appointment]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!user || !appointment) return;
    setLoading(true);

    let photo_url = appointment.photo_url || null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${user.id}/${appointment.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("service-photos")
        .upload(path, photoFile, { upsert: true });
      if (upErr) {
        toast.error("Erro ao enviar foto", { description: upErr.message });
      } else {
        const { data } = supabase.storage.from("service-photos").getPublicUrl(path);
        photo_url = data.publicUrl;
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        status: "atendido",
        duration_min: parseInt(duration) || 30,
        price: parseFloat(price) || 0,
        payment_status: paymentStatus,
        satisfaction,
        observations: observations || null,
        photo_url,
      })
      .eq("id", appointment.id);

    setLoading(false);
    if (error) {
      toast.error("Erro ao registrar", { description: error.message });
      return;
    }
    toast.success("Atendimento registrado!");
    onOpenChange(false);
    onSuccess();
  };

  if (!appointment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-3xl border-border/60 sm:max-w-lg sm:mx-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Registrar atendimento</SheetTitle>
          <SheetDescription>
            {appointment.client_name} • {appointment.service}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Duração (min)</Label>
              <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Valor (R$)</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pago", "pendente"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPaymentStatus(s)}
                  className={cn(
                    "rounded-lg border-2 px-3 py-2.5 text-sm font-medium capitalize transition-all",
                    paymentStatus === s
                      ? s === "pago"
                        ? "border-success bg-success/15 text-success"
                        : "border-warning bg-warning/15 text-warning"
                      : "border-border bg-secondary/40 text-muted-foreground"
                  )}
                >
                  {s === "pago" ? "✓ Pago" : "⏱ Pendente"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Satisfação</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSatisfaction(n)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-8 w-8",
                      n <= satisfaction ? "fill-accent text-accent" : "text-muted"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Foto do corte</Label>
            <label className="relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-secondary/30 hover:border-primary/50 transition-colors">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">Toque para enviar</span>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Observações</Label>
            <Textarea
              placeholder="Ex: degradê 1, barba aparada..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90"
            size="lg"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Concluir atendimento"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ServiceLogSheet;