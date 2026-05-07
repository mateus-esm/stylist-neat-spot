import { useState, useEffect } from "react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      else toast({ title: "Cliente atualizado!" });
    } else {
      const { error } = await supabase.from("clients").insert(data);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else toast({ title: "Cliente cadastrado!" });
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-2">
            <Label>Instagram</Label>
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: gosta de degradê baixo" />
          </div>
          <div className="space-y-2">
            <Label>Frequência de retorno (dias)</Label>
            <Input type="number" min="1" value={returnDays} onChange={(e) => setReturnDays(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : client ? "Salvar" : "Cadastrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ClientForm;
