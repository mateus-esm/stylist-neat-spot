import { SignUp } from "@clerk/react";
import { BrandLogo } from "@/components/BrandLogo";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

const AcceptInvite = () => {
  const { theme } = useTheme();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[280px] w-[280px] rounded-full bg-accent/15 blur-[120px]" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <BrandLogo size="md" className="mb-8" />
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Bem-vindo(a)</h1>
          <p className="text-sm text-muted-foreground">Complete seu cadastro para acessar o portal.</p>
        </div>
        
        <SignUp
          routing="hash"
          signInUrl="/auth#sign-in"
          fallbackRedirectUrl="/meu-app"
          appearance={{
            theme: theme === "dark" ? dark : undefined,
            elements: {
              card: "bg-card/80 backdrop-blur-xl border border-border/60 shadow-elevated rounded-xl",
              headerTitle: "text-foreground font-display",
              headerSubtitle: "text-muted-foreground",
              socialButtonsBlockButton: "bg-secondary/40 border-border hover:bg-secondary/60 text-foreground",
              socialButtonsBlockButtonText: "text-foreground font-medium",
              dividerLine: "bg-border",
              dividerText: "text-muted-foreground",
              formFieldLabel: "text-foreground",
              formFieldInput: "bg-input border-border text-foreground",
              formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-brand",
              footerActionText: "text-muted-foreground",
              footerActionLink: "text-primary hover:text-primary/90",
              identityPreviewText: "text-foreground",
              identityPreviewEditButton: "text-primary hover:text-primary/90",
            }
          }}
        />
      </div>
    </div>
  );
};

export default AcceptInvite;
