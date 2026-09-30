import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import TeamRosterClient from "@/components/dashboard/TeamRosterClient";
import { resolveTeamRoster } from "@/lib/athletes/visibility";

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

  /* Real identities for the athletes who actually joined.
     MUST be the service client: athlete_profiles RLS is self-only (`auth.uid() = id`), so
     the manager's cookie-backed client returns an empty array with NO error — a silent
     failure that reads as "nobody has joined yet". resolveTeamRoster does the team-scoping
     (`.eq("team_id", …)`) and resolves only ACCEPTED invites, so a pending invite can never
     surface a stranger's photo just because the addresses match. `user.id` here is the
     verified session, which is what makes that scoping an authorization boundary. */
  const service = createServiceClient();
  const roster = await resolveTeamRoster(service, user.id);

  /* Keyed by email so the client can look up an athlete for a row it already renders,
     without changing how it derives the list or the invite statuses. */
  const membersByEmail = Object.fromEntries(
    roster
      .filter((r) => r.athlete)
      .map((r) => [
        r.email,
        {
          firstName: r.athlete!.firstName,
          lastName: r.athlete!.lastName,
          fullName: r.athlete!.fullName,
          sport: r.athlete!.sport,
          graduationYear: r.athlete!.graduationYear,
          photoUrl: r.athlete!.photoUrl,
        },
      ])
  );


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
          membersByEmail={membersByEmail}
        />
      </main>
    </div>
  );
}
