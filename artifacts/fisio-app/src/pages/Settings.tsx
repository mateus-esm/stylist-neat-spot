import { BrandLogo } from "@/components/BrandLogo";
import ServiceManager from "@/components/ServiceManager";
import PackageTemplateManager from "@/components/PackageTemplateManager";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import TeamManager from "@/components/TeamManager";
import WhatsappSettings from "@/components/WhatsappSettings";
import { useRole } from "@/hooks/useRole";

const Settings = () => {
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Configurações</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4">
        <TeamManager />
        {isAdmin && <WhatsappSettings />}
        <Card className="rounded-sm cursor-pointer hover:bg-secondary/40" onClick={() => navigate("/disponibilidade")}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Disponibilidade e horários</p>
                <p className="text-xs text-muted-foreground">Abrir slots individuais ou em lote (recorrente / lista)</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <section>
          <h1 className="text-xl font-semibold">Catálogo de serviços</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tipos de atendimento usados ao agendar sessões.
          </p>
        </section>
        <ServiceManager />

        <section className="pt-4">
          <h2 className="text-xl font-semibold">Pacotes-padrão</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Modelos como LCA, Menisco, Lombalgia. Usados ao criar um novo pacote para o paciente.
          </p>
        </section>
        <PackageTemplateManager />
      </main>
    </div>
  );
};

export default Settings;
