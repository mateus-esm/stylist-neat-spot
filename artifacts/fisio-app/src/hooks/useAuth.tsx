import { createContext, useContext, ReactNode } from "react";
import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/react";

interface AuthContextType {
  user: any;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded } = useClerkAuth();
  const { signOut } = useClerk();

  const loading = !userLoaded || !authLoaded;

  return (
    <AuthContext.Provider value={{ user: user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
