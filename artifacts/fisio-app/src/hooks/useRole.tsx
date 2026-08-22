import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useGetClinicSession } from "@workspace/api-client-react";

export type AppRole = "admin" | "patient";

export const useRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);

  // Skip query if no user is signed in to avoid 401s
  const { data: session, isLoading: sessionLoading } = useGetClinicSession({
    query: {
      enabled: !!user && !authLoading,
      queryKey: ["/api/clinic/me"],
    },
  });

  useEffect(() => {
    if (session) {
      setRole(session.role as AppRole);
    } else if (!user && !authLoading) {
      setRole(null);
    }
  }, [session, user, authLoading]);

  return {
    role,
    loading: authLoading || sessionLoading,
    isAdmin: role === "admin",
    isPatient: role === "patient",
  };
};
