import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import Index from "./pages/Index";
import Patients from "./pages/Patients";
import Returns from "./pages/Returns";
import Financial from "./pages/Financial";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Availability from "./pages/Availability";
import PatientPortal from "./pages/PatientPortal";
import PatientSession from "./pages/PatientSession";
import AcceptInvite from "./pages/AcceptInvite";
import BottomNav from "./components/BottomNav";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, allow }: { children: React.ReactNode; allow?: "admin" | "patient" }) => {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  if (loading || roleLoading) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Conta sem permissão</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta ainda não tem um papel atribuído. Solicite acesso ao administrador.
          </p>
        </div>
      </div>
    );
  }
  if (allow && role !== allow) return <Navigate to={role === "patient" ? "/meu-app" : "/"} replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  if (loading || (user && roleLoading)) return null;
  if (user && role) return <Navigate to={role === "patient" ? "/meu-app" : "/"} replace />;
  return <>{children}</>;
};

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    {children}
    <BottomNav />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/aceitar-convite" element={<AcceptInvite />} />

              {/* Admin */}
              <Route path="/" element={<ProtectedRoute allow="admin"><AppLayout><Index /></AppLayout></ProtectedRoute>} />
              <Route path="/pacientes" element={<ProtectedRoute allow="admin"><AppLayout><Patients /></AppLayout></ProtectedRoute>} />
              <Route path="/clientes" element={<Navigate to="/pacientes" replace />} />
              <Route path="/retornos" element={<ProtectedRoute allow="admin"><AppLayout><Returns /></AppLayout></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute allow="admin"><AppLayout><Financial /></AppLayout></ProtectedRoute>} />
              <Route path="/disponibilidade" element={<ProtectedRoute allow="admin"><AppLayout><Availability /></AppLayout></ProtectedRoute>} />

              {/* Patient */}
              <Route path="/meu-app" element={<ProtectedRoute allow="patient"><AppLayout><PatientPortal /></AppLayout></ProtectedRoute>} />
              <Route path="/meu-app/sessao/:id" element={<ProtectedRoute allow="patient"><AppLayout><PatientSession /></AppLayout></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
