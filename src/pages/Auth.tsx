import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { BrandLogo, SoloVenturesBadge } from "@/components/BrandLogo";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Erro ao entrar", { description: error.message });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) toast.error("Erro ao cadastrar", { description: error.message });
      else toast.success("Conta criada!", { description: "Você já pode entrar." });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Erro no login Google");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-6">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[280px] w-[280px] rounded-full bg-accent/15 blur-[120px]" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <BrandLogo size="lg" className="mb-10" />

        <Card className="w-full border-border/60 bg-card/80 backdrop-blur-xl shadow-elevated">
          <CardContent className="p-6">
            <div className="mb-5 space-y-1">
              <h1 className="text-xl font-semibold">
                {isLogin ? "Entrar no estúdio" : "Criar conta"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLogin ? "Acesse seu painel de comando." : "Comece a organizar sua agenda."}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              className="w-full gap-2 bg-secondary/40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 11v3.4h5.4c-.2 1.4-1.6 4.1-5.4 4.1-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5L18.1 5C16.6 3.7 14.5 3 12 3 6.9 3 3 7 3 12s3.9 9 9 9c5.2 0 8.7-3.7 8.7-8.8 0-.6-.1-1-.1-1.5H12z"/>
              </svg>
              Continuar com Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              ou e-mail
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <Button type="submit" className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-90" disabled={loading}>
                {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            <button
              onClick={() => setIsLogin(!isLogin)}
              className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
            </button>
          </CardContent>
        </Card>

        <SoloVenturesBadge className="mt-8" />
      </div>
    </div>
  );
};

export default Auth;
