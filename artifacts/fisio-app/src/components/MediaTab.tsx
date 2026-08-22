import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { finalizeAppointmentMedia } from "@workspace/api-client-react";

const db = supabase as any;
const BUCKET = "session-media";

interface Props {
  appointmentId: string;
}

// Server returns snake_case (via rowToSnake) for both list GET and finalize POST.
interface MediaItem {
  id: string;
  storage_path: string;
  media_type: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
  signedUrl?: string;
}

const MediaTab = ({ appointmentId }: Props) => {
  const { user } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");

  const load = async () => {
    const { data } = await db
      .from("session_media")
      .select("*")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false });

    const withUrls: MediaItem[] = [];
    for (const m of (data || []) as MediaItem[]) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(m.storage_path, 3600);
      withUrls.push({ ...m, signedUrl: signed?.signedUrl });
    }
    setItems(withUrls);
  };

  useEffect(() => {
    if (appointmentId) load();
  }, [appointmentId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${appointmentId}/${crypto.randomUUID()}.${ext}`;
    const { data: uploadData, error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
    if (upErr || !uploadData) {
      setUploading(false);
      toast.error(upErr?.message || "Erro no upload");
      return;
    }
    const mediaType = file.type.startsWith("video") ? "video" : "image";
    let record: MediaItem;
    try {
      // finalizeAppointmentMedia returns ClinicRecord (generic object);
      // the server serializes it through rowToSnake so fields are snake_case.
      record = (await finalizeAppointmentMedia(appointmentId, {
        objectPath: uploadData.path,
        mediaType,
        caption: caption || undefined,
      })) as unknown as MediaItem;
    } catch (finalizeError: any) {
      setUploading(false);
      toast.error("Mídia não vinculada à sessão", {
        description:
          finalizeError?.message ||
          "O arquivo foi enviado, mas não pôde ser associado com segurança.",
      });
      return;
    }

    setUploading(false);
    setCaption("");
    e.target.value = "";
    toast.success("Mídia enviada");

    // Use the returned durable record; build its signed URL and prepend.
    if (record?.storage_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(record.storage_path, 3600);
      setItems((prev) => [{ ...record, signedUrl: signed?.signedUrl }, ...prev]);
    } else {
      load();
    }
  };

  const remove = async (item: MediaItem) => {
    if (!confirm("Remover esta mídia?")) return;
    await supabase.storage.from(BUCKET).remove([item.storage_path]);
    await db.from("session_media").delete().eq("id", item.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-dashed border-border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Enviar foto ou vídeo</Label>
        <Input
          placeholder="Legenda (opcional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="rounded-sm"
        />
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-border bg-secondary/40 py-3 text-sm font-medium hover:bg-secondary">
          <Upload className="h-4 w-4" />
          {uploading ? "Enviando..." : "Selecionar arquivo"}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nenhuma mídia anexada ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-sm border border-border overflow-hidden bg-card">
              {item.media_type === "video" ? (
                <video src={item.signedUrl} controls className="aspect-square w-full object-cover" />
              ) : (
                <img src={item.signedUrl} alt={item.caption || ""} className="aspect-square w-full object-cover" />
              )}
              {item.caption && (
                <p className="px-2 py-1 text-xs text-muted-foreground truncate">{item.caption}</p>
              )}
              {item.uploaded_by === user?.id && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(item)}
                  className="absolute top-1 right-1 h-7 w-7 bg-background/80 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaTab;
