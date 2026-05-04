import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the currently signed-in user has the `admin` role in
 * `public.user_roles`. Returns `false` for signed-out users.
 *
 * RLS on user_roles allows users to read their own role rows, so this client
 * query is safe and respects security boundaries.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function check(userId: string | null) {
      if (!userId) {
        if (active) { setIsAdmin(false); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!active) return;
      setIsAdmin(!error && !!data);
      setLoading(false);
    }

    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      check(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoading(true);
      check(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isAdmin, loading };
}
