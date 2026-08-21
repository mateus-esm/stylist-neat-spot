import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

const AcceptInvite = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase parses the invite token from URL hash on load
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Convite invalido ou expirado");
      }
      setReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Senha precisa ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("Senhas nao coincidem");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Acesso ativado");
    navigate("/meu-app", { replace: true });
  };

  if (!ready) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm rounded-sm">
        <CardContent className="space-y-6 p-6">
          <BrandLogo size="md" />
          <div>
            <h1 className="text-xl font-semibold">Bem-vindo</h1>
            <p className="text-sm text-muted-foreground">Defina sua senha para acessar o portal.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} className="rounded-sm" />
            </div>
            <Button type="submit" disabled={saving} className="w-full rounded-sm">
              {saving ? "Salvando..." : "Ativar acesso"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
