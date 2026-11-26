import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
const Index = lazy(() => import("./pages/Index"));
const Patients = lazy(() => import("./pages/Patients"));
const Returns = lazy(() => import("./pages/Returns"));
const Financial = lazy(() => import("./pages/Financial"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Availability = lazy(() => import("./pages/Availability"));
const Settings = lazy(() => import("./pages/Settings"));
const Packages = lazy(() => import("./pages/Packages"));
const Planning = lazy(() => import("./pages/Planning"));
const PatientPortal = lazy(() => import("./pages/PatientPortal"));
const PatientSession = lazy(() => import("./pages/PatientSession"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
import BottomNav from "./components/BottomNav";
import { localReturnPath, signInRedirectUrl } from "./lib/authRedirect";

import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const ProtectedRoute = ({ children, allow }: { children: React.ReactNode; allow?: "staff" | "patient" | "admin" }) => {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const location = useLocation();
  if (loading || roleLoading) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  if (!user) return <Navigate to={signInRedirectUrl(location.pathname, location.search, location.hash)} replace />;
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
  if (allow === "admin" && role !== "owner" && role !== "admin") return <Navigate to={role === "patient" ? "/meu-app" : "/"} replace />;
  const allowed = !allow || (allow === "patient" ? role === "patient" : role !== "patient");
  if (!allowed) return <Navigate to={role === "patient" ? "/meu-app" : "/"} replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  if (loading || (user && roleLoading)) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  if (user && role) return <Navigate to={localReturnPath(new URLSearchParams(window.location.search).get("redirect"), role === "patient" ? "/meu-app" : "/")} replace />;
  if (user && !role) return <Navigate to="/" replace />; // Let ProtectedRoute handle the no-role screen
  return <>{children}</>;
};

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    {children}
    <BottomNav />
  </div>
);

const App = () => (
  <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    signInUrl="/sign-in"
    signUpUrl="/sign-up"
  >
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div role="status" className="p-6 text-center text-sm">Carregando…</div>}>
            <Routes>
              <Route path="/auth" element={<Navigate to="/sign-in" replace />} />
              <Route path="/sign-in/*" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/sign-up/*" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/aceitar-convite" element={<AcceptInvite />} />

              {/* Admin */}
              <Route path="/" element={<ProtectedRoute allow="staff"><AppLayout><Index /></AppLayout></ProtectedRoute>} />
              <Route path="/pacientes" element={<ProtectedRoute allow="staff"><AppLayout><Patients /></AppLayout></ProtectedRoute>} />
              <Route path="/clientes" element={<Navigate to="/pacientes" replace />} />
              <Route path="/retornos" element={<ProtectedRoute allow="staff"><AppLayout><Returns /></AppLayout></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute allow="admin"><AppLayout><Financial /></AppLayout></ProtectedRoute>} />
              <Route path="/disponibilidade" element={<ProtectedRoute allow="staff"><AppLayout><Availability /></AppLayout></ProtectedRoute>} />
              <Route path="/pacotes" element={<ProtectedRoute allow="staff"><AppLayout><Packages /></AppLayout></ProtectedRoute>} />
              <Route path="/planejamento" element={<ProtectedRoute allow="staff"><AppLayout><Planning /></AppLayout></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute allow="staff"><AppLayout><Settings /></AppLayout></ProtectedRoute>} />

              {/* Patient */}
              <Route path="/meu-app" element={<ProtectedRoute allow="patient"><AppLayout><PatientPortal /></AppLayout></ProtectedRoute>} />
              <Route path="/meu-app/sessao/:id" element={<ProtectedRoute allow="patient"><AppLayout><PatientSession /></AppLayout></ProtectedRoute>} />
              <Route path="/meu-app/agenda/:id" element={<ProtectedRoute allow="patient"><AppLayout><PatientPortal /></AppLayout></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </ClerkProvider>
);

export default App;
