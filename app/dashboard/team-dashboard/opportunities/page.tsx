import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import OpportunitiesSection from "@/components/opportunities/OpportunitiesSection";
import { BrandOpportunitiesPanel } from "@/components/opportunities/OpportunitiesPanels";
import {
  loadBrandInquiriesForTeam,
  loadBrandsYouReachedOutTo,
} from "@/lib/discover/opportunities";

export default async function TeamOpportunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("manager_first_name, manager_last_name, school, team_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/team-manager");

  const service = createServiceClient();
  const [incoming, outgoing] = await Promise.all([
    loadBrandInquiriesForTeam(service, user.id),
    loadBrandsYouReachedOutTo(service, user.id),
  ]);

  const name =
    `${profile.manager_first_name} ${profile.manager_last_name}`.trim() || "Manager";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">
            Opportunities
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Opportunities
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Brands and teams you connect with on Discover—see who is interested in you and who you
            reached out to—including email and phone when either side marks real interest.
          </p>
        </div>

        <div className="flex flex-col gap-10 md:gap-12">
          <OpportunitiesSection
            id="interested-in-you"
            variant="incoming"
            title={`Interested in ${profile.school} ${profile.team_name}`}
            description='Brands that chose "ready to pursue a partnership" or "interested, still deciding" toward your team.'
          >
            <BrandOpportunitiesPanel rows={incoming} variant="incoming" />
          </OpportunitiesSection>

          <OpportunitiesSection
            id="your-outreach"
            variant="outgoing"
            title="Brands you reached out to"
            description="Brands you marked with positive interest on Discover—their contact details are below for follow-up."
          >
            <BrandOpportunitiesPanel rows={outgoing} variant="outgoing" />
          </OpportunitiesSection>
        </div>
      </main>
    </div>
  );
}
