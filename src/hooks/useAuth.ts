import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AppRole = "admin" | "user";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export { AuthContext };

export function useAuthProvider(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[useAuth] fetchRole error:", error.message);
      }
      setRole((data?.role as AppRole) ?? "user");
    } catch (e) {
      console.warn("[useAuth] fetchRole exception:", e);
      setRole("user");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety net: never let the spinner spin forever
    const safetyTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // Listen FIRST so we don't miss events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Defer async work outside the callback to avoid deadlocks
          setTimeout(() => {
            if (mounted) fetchRole(currentUser.id);
          }, 0);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    // Then get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Fire and forget — don't block loading on this
          fetchRole(currentUser.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("[useAuth] getSession failed:", e);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    setUser(null);
    setRole(null);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  return {
    user,
    role,
    loading,
    signOut,
    isAdmin: role === "admin",
  };
}
