import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import TeamRosterClient from "@/components/dashboard/TeamRosterClient";

export default async function TeamRosterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/team-manager");

  const { data: invitationRows } = await supabase
    .from("team_athlete_invitations")
    .select("email, token, email_sent_at, opened_at, accepted_at")
    .eq("team_id", user.id);

  const invitations =
    invitationRows?.map((r) => ({
      email: r.email,
      token: r.token,
      email_sent_at: r.email_sent_at,
      opened_at: r.opened_at,
      accepted_at: r.accepted_at,
    })) ?? [];

  const siteBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  const athleteEmails: string[] = profile.athlete_emails ?? [];

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={`${profile.manager_first_name} ${profile.manager_last_name}`} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Team Roster</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            {profile.team_name} Roster
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            {profile.school} · {profile.sport}
            {profile.division ? ` · ${profile.division}` : ""}
          </p>
        </div>

        <TeamRosterClient
          initialEmails={athleteEmails}
          invitations={invitations}
          numPlayers={profile.num_players}
          siteBaseUrl={siteBaseUrl}
        />
      </main>
    </div>
  );
}
