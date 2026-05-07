import { cn } from "@/lib/utils";
import soloLogo from "@/assets/solo-ventures-logo.png";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { wrap: "gap-2", dot: "h-6 w-6", text: "text-base" },
  md: { wrap: "gap-2.5", dot: "h-8 w-8", text: "text-xl" },
  lg: { wrap: "gap-3", dot: "h-12 w-12", text: "text-3xl" },
};

export const BrandLogo = ({ className, size = "md" }: BrandLogoProps) => {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center", s.wrap, className)}>
      <div className={cn("relative flex items-center justify-center rounded-full bg-gradient-brand shadow-brand", s.dot)}>
        <span className="absolute inset-[3px] rounded-full bg-background" />
        <span className={cn("relative font-bold text-gradient-brand", size === "lg" ? "text-lg" : "text-xs")}>
          D
        </span>
      </div>
      <div className="leading-none">
        <p className={cn("font-bold tracking-tight", s.text)}>
          Duda <span className="text-gradient-brand">Hair</span>
        </p>
        {size !== "sm" && (
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            APP
          </p>
        )}
      </div>
    </div>
  );
};

export const SoloVenturesBadge = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col items-center gap-1.5 opacity-70", className)}>
    <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">powered by</span>
    <img src={soloLogo} alt="Solo Ventures" className="h-5 w-auto dark:invert-0 dark:opacity-90" />
  </div>
);

export default BrandLogo;