import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "patient";

export const useRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        setRole((data?.role as AppRole) ?? null);
        setLoading(false);
      });
  }, [user, authLoading]);

  return { role, loading: authLoading || loading, isAdmin: role === "admin", isPatient: role === "patient" };
};
