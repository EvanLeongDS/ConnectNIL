import type { AppRouterInstance } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

/**
 * After signUp: if Supabase returns a session, email confirmation is off (or user already confirmed).
 * If confirmation is required, session is null — show "Check your email" instead.
 * @returns true if we navigated away (logged-in path)
 */
export function navigateAfterSignUp(session: Session | null, router: AppRouterInstance): boolean {
  if (session) {
    router.refresh();
    router.push("/dashboard");
    return true;
  }
  return false;
}
