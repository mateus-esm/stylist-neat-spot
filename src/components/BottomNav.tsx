import { CalendarDays, Users, DollarSign, RotateCcw } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", icon: CalendarDays, label: "Agenda" },
  { path: "/clientes", icon: Users, label: "Clientes" },
  { path: "/retornos", icon: RotateCcw, label: "Retornos" },
  { path: "/financeiro", icon: DollarSign, label: "Financeiro" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-b-full bg-gradient-brand" />
              )}
              <tab.icon className={cn("h-5 w-5", active && "text-primary")} />
              <span className={cn(active && "font-semibold")}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
