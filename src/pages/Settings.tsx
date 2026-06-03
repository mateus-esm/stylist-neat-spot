import { BrandLogo } from "@/components/BrandLogo";
import ServiceManager from "@/components/ServiceManager";

const Settings = () => {
  return (
    <div className="pb-24">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <BrandLogo size="sm" />
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Configurações</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4">
        <section>
          <h1 className="text-xl font-semibold">Catálogo de serviços</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os tipos de atendimento usados ao agendar sessões.
          </p>
        </section>
        <ServiceManager />
      </main>
    </div>
  );
};

export default Settings;
