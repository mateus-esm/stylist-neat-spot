import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface ClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  client?: any;
}

const ClientForm = ({ open, onOpenChange, onSuccess, client }: ClientFormProps) => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [notes, setNotes] = useState("");
  const [returnDays, setReturnDays] = useState("30");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setPhone(client.phone || "");
      setInstagram(client.instagram || "");
      setNotes(client.notes || "");
      setReturnDays(String(client.return_days || 30));
    } else if (open) {
      setName("");
      setPhone("");
      setInstagram("");
      setNotes("");
      setReturnDays("30");
    }
  }, [open, client]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setLoading(true);

    const data = {
      user_id: user.id,
      name,
      phone: phone || null,
      instagram: instagram || null,
      notes: notes || null,
      return_days: parseInt(returnDays) || 30,
    };

    if (client) {
      const { error } = await supabase.from("clients").update(data).eq("id", client.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Paciente atualizado" });
    } else {
      const { error } = await supabase.from("clients").insert(data);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Paciente cadastrado" });
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-sm">
        <DialogHeader>
          <DialogTitle>{client ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} required className="rounded-sm" />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 99999-9999" className="rounded-sm" />
          </div>
          <div className="space-y-2">
            <Label>Instagram</Label>
            <Input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@usuario" className="rounded-sm" />
          </div>
          <div className="space-y-2">
            <Label>Observacoes operacionais</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Restricoes, preferencias de horario ou alerta administrativo"
              className="rounded-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Janela de retorno clinico (dias)</Label>
            <Input type="number" min="1" value={returnDays} onChange={(event) => setReturnDays(event.target.value)} className="rounded-sm" />
          </div>
          <Button type="submit" className="w-full rounded-sm" disabled={loading}>
            {loading ? "Salvando..." : client ? "Salvar" : "Cadastrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ClientForm;
