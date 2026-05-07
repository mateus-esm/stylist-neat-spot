import { cn } from "@/lib/utils";
import soloLogo from "@/assets/solo-ventures-logo.png";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { mark: "h-6 w-6 text-[10px]", title: "text-sm", sub: "text-[8px]" },
  md: { mark: "h-8 w-8 text-xs", title: "text-base", sub: "text-[9px]" },
  lg: { mark: "h-12 w-12 text-base", title: "text-2xl", sub: "text-[10px]" },
};

export const BrandLogo = ({ className, size = "md" }: BrandLogoProps) => {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-sm bg-foreground text-background font-display font-semibold",
          s.mark
        )}
      >
        LR
      </div>
      <div className="leading-tight">
        <p className={cn("font-display font-semibold tracking-tight", s.title)}>
          Lucas Rocha <span className="text-primary">Fisio</span>
        </p>
        {size !== "sm" && (
          <p className={cn("uppercase tracking-[0.32em] text-muted-foreground", s.sub)}>
            Clinical Operations
          </p>
        )}
      </div>
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
