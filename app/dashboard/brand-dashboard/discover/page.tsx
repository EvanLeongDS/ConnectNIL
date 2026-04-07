import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import DiscoverInterestButton from "@/components/discover/DiscoverInterestButton";
import {
  scoreTeamForBrand,
  matchLabel,
  type TeamRow,
  type BrandContext,
} from "@/lib/discover/matchScore";
import { getStruckTeamIdsForBrand } from "@/lib/discover/struckDeals";

export default async function BrandDiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select(
      "company_name, first_name, last_name, state, preferred_sports, preferred_schools, campaign_types"
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  const service = createServiceClient();
  const struckTeamIds = await getStruckTeamIdsForBrand(service, user.id);
  const { data: teams } = await service
    .from("team_profiles")
    .select(
      "id, school, team_name, sport, division, num_players, availability, preferred_deals"
    )
    .eq("onboarding_complete", true);

  const ctx: BrandContext = {
    preferred_sports: profile.preferred_sports,
    preferred_schools: profile.preferred_schools,
    campaign_types: profile.campaign_types,
    state: profile.state,
  };

  const scored = (teams ?? []).map((t) => ({
    team: t as TeamRow,
    score: scoreTeamForBrand(t as TeamRow, ctx),
  }));
  scored.sort((a, b) => {
    const aStruck = struckTeamIds.has(a.team.id) ? 1 : 0;
    const bStruck = struckTeamIds.has(b.team.id) ? 1 : 0;
    if (aStruck !== bStruck) return aStruck - bStruck;
    return b.score - a.score;
  });

  const name = profile.company_name || `${profile.first_name} ${profile.last_name}`.trim() || "Brand";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Discover</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Team Recommendations
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Teams ranked by how well they match your preferred sports, schools, and deal types.
          </p>
        </div>

        {scored.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white p-12 text-center dark:border-white/10 dark:bg-[#161b27]">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 font-semibold text-black/50 dark:text-white/40">No teams found yet</p>
            <p className="mt-1 text-sm text-black/30 dark:text-white/25">
              Once team managers complete their profiles, they&apos;ll appear here with match scores.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scored.map(({ team, score }) => {
              const ml = matchLabel(score);
              const sportMatch = profile.preferred_sports?.some(
                (s: string) => s.toLowerCase() === team.sport.toLowerCase()
              );
              const schoolMatch = profile.preferred_schools?.some(
                (s: string) => s.toLowerCase() === team.school.toLowerCase()
              );
              return (
                <div
                  key={team.id}
                  className="group relative flex flex-col rounded-2xl border border-black/6 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-white/6 dark:bg-[#161b27]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ml.color}`}>
                      {ml.text} · {score}%
                    </span>
                    {team.division && (
                      <span className="text-xs font-semibold text-black dark:text-white">{team.division}</span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold leading-snug text-black dark:text-white">
                    {team.school} {team.team_name}
                  </h3>

                  {/* Stats row */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-black/8 bg-[#f9fafb] p-3 dark:border-white/12 dark:bg-[#222833]">
                      <p className="text-xs font-medium text-black/50 dark:text-white/55">Roster Size</p>
                      <p className="mt-0.5 text-lg font-black text-black dark:text-white">{team.num_players}</p>
                    </div>
                    <div className="rounded-lg border border-black/8 bg-[#f9fafb] p-3 dark:border-white/12 dark:bg-[#222833]">
                      <p className="text-xs font-medium text-black/50 dark:text-white/55">Availability</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-black dark:text-white capitalize">
                        {team.availability || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Match highlights */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sportMatch && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        Sport match
                      </span>
                    )}
                    {schoolMatch && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        School match
                      </span>
                    )}
                    {team.preferred_deals?.slice(0, 2).map((d) => (
                      <span
                        key={d}
                        className="rounded-full bg-[#1f7ae0]/10 px-2 py-0.5 text-[11px] font-medium text-[#1f7ae0]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto pt-4">
                    <DiscoverInterestButton
                      viewerRole="brand-manager"
                      subjectType="team"
                      subjectId={team.id}
                      subjectTitle={`${team.school} ${team.team_name}`}
                      opportunitiesHref="/dashboard/brand-dashboard/opportunities#your-outreach"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
