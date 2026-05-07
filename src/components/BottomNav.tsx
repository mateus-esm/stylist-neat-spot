import { CalendarDays, Users, LineChart, RotateCcw } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", icon: CalendarDays, label: "Agenda" },
  { path: "/pacientes", icon: Users, label: "Pacientes" },
  { path: "/retornos", icon: RotateCcw, label: "Retornos" },
  { path: "/financeiro", icon: LineChart, label: "Financeiro" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-3 text-[10px] uppercase tracking-[0.14em] transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 bg-primary" />
              )}
              <tab.icon className={cn("h-[18px] w-[18px]", active && "text-foreground")} strokeWidth={1.5} />
              <span className={cn(active && "font-semibold")}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
