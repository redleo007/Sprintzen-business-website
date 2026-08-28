import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "Admin" | "TeamLeader" | "TeamMember";

export type Profile = {
  id: string;
  name: string;
  email: string;
  avatar_color: string;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole;
  loading: boolean;
  canLead: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole>("TeamMember");
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async (userId: string) => {
    const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, avatar_color")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    setProfile((profileRow as Profile | null) ?? null);

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    setRole(
      roles.includes("Admin")
        ? "Admin"
        : roles.includes("TeamLeader")
          ? "TeamLeader"
          : "TeamMember",
    );
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session?.user) {
        void loadMeta(data.session.user.id).finally(() => active && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRole("TeamMember");
        return;
      }
      if (nextSession?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        void loadMeta(nextSession.user.id);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMeta]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    if (data.session?.user) await loadMeta(data.session.user.id);
  }, [loadMeta]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole("TeamMember");
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      role,
      loading,
      canLead: role === "Admin" || role === "TeamLeader",
      refresh,
      signOut,
    }),
    [session, profile, role, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
