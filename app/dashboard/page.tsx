import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardRouter() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;

  // ── Athlete ──────────────────────────────────────────────────────────────
  if (role === "athlete") {
    const { data: profile } = await supabase
      .from("athlete_profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarding_complete) redirect("/onboarding/athlete");
    redirect("/dashboard/athlete-dashboard");
  }

  // ── Brand Manager ────────────────────────────────────────────────────────
  if (role === "brand-manager") {
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarding_complete) redirect("/onboarding/brand-manager");
    redirect("/dashboard/brand-dashboard");
  }

  // ── Team Manager ─────────────────────────────────────────────────────────
  if (role === "team-manager") {
    const { data: profile } = await supabase
      .from("team_profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarding_complete) redirect("/onboarding/team-manager");
    redirect("/dashboard/team-dashboard");
  }

  // ── Unknown role fallback ─────────────────────────────────────────────────
  redirect("/login");
}
