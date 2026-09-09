import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  scoreBrandForAthlete,
  matchLabel,
  type BrandRow,
  type AthleteContext,
} from "@/lib/discover/matchScore";

export default async function AthleteDiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("first_name, last_name, school, sport")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  const service = createServiceClient();
  const { data: brands } = await service
    .from("brand_profiles")
    .select(
      "id, company_name, city, state, industry, budget_range, company_description, target_audience, preferred_sports, preferred_schools, campaign_types, website_url, social_instagram, social_x, social_linkedin"
    )
    .eq("onboarding_complete", true);

  const ctx: AthleteContext = {
    school: profile.school,
    sport: profile.sport,
  };

  const scored = (brands ?? []).map((b) => ({
    brand: b as BrandRow,
    score: scoreBrandForAthlete(b as BrandRow, ctx),
  }));
  scored.sort((a, b) => b.score - a.score);

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Athlete";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Discover</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Brand Recommendations
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Brands ranked by how well they match your sport, school, and location. This is a
            reference list — brands and team managers start the conversation, so reach out
            through the links on a card if you see a fit.
          </p>
        </div>

        {scored.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white p-12 text-center dark:border-white/10 dark:bg-[#161b27]">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 font-semibold text-black/50 dark:text-white/40">No brands found yet</p>
            <p className="mt-1 text-sm text-black/30 dark:text-white/25">
              Once brands complete their profiles, they&apos;ll appear here with match scores.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scored.map(({ brand, score }) => {
              const ml = matchLabel(score);
              return (
                <div
                  key={brand.id}
                  className="group relative flex flex-col rounded-2xl border border-black/6 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-white/6 dark:bg-[#161b27]"
                >
                  {/* Score badge */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ml.color}`}>
                      {ml.text} · {score}%
                    </span>
                    <span className="text-right text-xs font-medium text-black dark:text-white">{brand.industry}</span>
                  </div>

                  <h3 className="text-lg font-bold text-black dark:text-white">{brand.company_name}</h3>
                  <p className="mt-0.5 text-xs text-black/45 dark:text-white/40">
                    {brand.city}, {brand.state}
                    {brand.budget_range ? ` · ${brand.budget_range}` : ""}
                  </p>

                  {brand.company_description && (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-black/60 dark:text-white/50">
                      {brand.company_description}
                    </p>
                  )}

                  {(brand.preferred_sports?.length || brand.campaign_types?.length) ? (
                    <div className="mt-4 space-y-3">
                      {brand.preferred_sports && brand.preferred_sports.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-black/50 dark:text-white/45">
                            Preferred sports
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {brand.preferred_sports.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  s.toLowerCase() === profile.sport.toLowerCase()
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                    : "bg-black/5 text-black dark:bg-white/10 dark:text-white"
                                }`}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {brand.campaign_types && brand.campaign_types.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-black/50 dark:text-white/45">
                            Campaign types
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {brand.campaign_types.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-md border border-[#1f7ae0]/35 bg-[#1f7ae0]/8 px-2 py-0.5 text-[11px] font-medium text-[#1560b3] dark:border-[#1f7ae0]/45 dark:bg-[#1f7ae0]/15 dark:text-[#8ec5ff]"
                              >
                                {t
                                  .split(/[_\s]+/)
                                  .filter(Boolean)
                                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                                  .join(" ")}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Socials */}
                  <div className="mt-auto flex items-center gap-3 pt-4">
                    {brand.website_url && (
                      <a
                        href={brand.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1f7ae0] hover:underline"
                      >
                        Website
                      </a>
                    )}
                    {brand.social_instagram && (
                      <a
                        href={`https://instagram.com/${brand.social_instagram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
                      >
                        @{brand.social_instagram.replace(/^@/, "")}
                      </a>
                    )}
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
