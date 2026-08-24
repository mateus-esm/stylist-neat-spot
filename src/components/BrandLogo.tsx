import { cn } from "@/lib/utils";
import soloLogoDarkText from "@/assets/solo-ventures-logo-dark-text.png";
import soloLogoLightText from "@/assets/solo-ventures-logo.png";
import oneSymbol from "@/assets/one-symbol.png";
import oneLockup from "@/assets/one-lockup.png";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { mark: "h-7", title: "text-base", sub: "text-[8px]", gap: "gap-2" },
  md: { mark: "h-9", title: "text-xl", sub: "text-[9px]", gap: "gap-2.5" },
  lg: { mark: "h-12", title: "text-2xl", sub: "text-[10px]", gap: "gap-3" },
};

/**
 * Marca da One Fisioterapia Esportiva.
 *
 * `sm` e `md` combinam o símbolo com o logotipo em texto — assim a marca
 * acompanha o tema claro/escuro e permanece nítida em qualquer tamanho.
 * `lg` usa o lockup original da identidade, para os momentos de marca
 * (login e aceite de convite).
 */
export const BrandLogo = ({ className, size = "md" }: BrandLogoProps) => {
  const s = sizes[size];

  if (size === "lg") {
    return (
      <img
        src={oneLockup}
        alt="One Fisioterapia Esportiva"
        className={cn("h-auto w-40 select-none", className)}
      />
    );
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <img
        src={oneSymbol}
        alt=""
        aria-hidden="true"
        className={cn("w-auto select-none", s.mark)}
      />
      <div className="leading-none">
        <p className={cn("font-display font-bold tracking-tight text-primary", s.title)}>
          ONE
        </p>
        <p
          className={cn(
            "mt-0.5 uppercase tracking-[0.18em] text-muted-foreground",
            s.sub
          )}
        >
          Fisioterapia Esportiva
        </p>
      </div>
      <span className="sr-only">One Fisioterapia Esportiva</span>
    </div>
  );
};

export const SoloVenturesBadge = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col items-center gap-1.5 opacity-70", className)}>
    <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">powered by</span>
    <img src={soloLogo} alt="Solo Ventures" className="h-5 w-auto dark:invert dark:opacity-90" />
  </div>
);

export default BrandLogo;
