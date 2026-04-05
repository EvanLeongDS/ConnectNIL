import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import TeamProfileEditor from "@/components/profile/TeamProfileEditor";

const PROFILE_HREF = "/dashboard/team-dashboard/profile";

type TeamProfile = {
  school: string;
  team_name: string;
  sport: string;
  division: string | null;
  num_players: number;
  manager_first_name: string;
  manager_last_name: string;
  phone: string;
  interested_brands: string[] | null;
  preferred_deals: string[] | null;
  availability: string;
};

export default async function TeamProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: raw } = await supabase
    .from("team_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!raw) redirect("/onboarding/team-manager");

  const profile = raw as TeamProfile;
  const displayName =
    [profile.manager_first_name, profile.manager_last_name].filter(Boolean).join(" ") || "Team Manager";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={displayName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6">
          <Link
            href={PROFILE_HREF}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7ae0] transition hover:underline"
          >
            <span aria-hidden>←</span> Back to profile
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Team Manager Profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Edit profile</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">Update team info and partnership preferences.</p>
        </div>

        <TeamProfileEditor
          redirectAfterSave={PROFILE_HREF}
          profile={{
            school: profile.school,
            team_name: profile.team_name,
            sport: profile.sport,
            division: profile.division,
            num_players: profile.num_players,
            manager_first_name: profile.manager_first_name,
            manager_last_name: profile.manager_last_name,
            phone: profile.phone,
            interested_brands: profile.interested_brands ?? [],
            preferred_deals: profile.preferred_deals ?? [],
            availability: profile.availability,
          }}
        />
      </main>
    </div>
  );
}
