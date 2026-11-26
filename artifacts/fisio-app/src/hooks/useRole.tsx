import { useAuth } from "./useAuth";
import { useGetClinicSession } from "@workspace/api-client-react";

export type AppRole = "owner" | "admin" | "physiotherapist" | "patient";

export const useRole = () => {
  const { user, loading: authLoading } = useAuth();

  // Skip query if no user is signed in to avoid 401s
  const { data: session, isLoading: sessionLoading } = useGetClinicSession({
    query: {
      enabled: !!user && !authLoading,
      queryKey: ["/api/clinic/me", user?.id],
    },
  });

  const role = user ? (session?.role as AppRole | null) ?? null : null;

  return {
    role,
    loading: authLoading || sessionLoading,
    isAdmin: role === "owner" || role === "admin",
    isStaff: role === "owner" || role === "admin" || role === "physiotherapist",
    isPatient: role === "patient",
  };
};
