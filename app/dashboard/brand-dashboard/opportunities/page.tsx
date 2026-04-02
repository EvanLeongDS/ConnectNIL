import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import OpportunitiesSection from "@/components/opportunities/OpportunitiesSection";
import { TeamOpportunitiesPanel } from "@/components/opportunities/OpportunitiesPanels";
import {
  loadTeamInquiriesForBrand,
  loadTeamsYouReachedOutTo,
} from "@/lib/discover/opportunities";

export default async function BrandOpportunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("company_name, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  const service = createServiceClient();
  const [incoming, outgoing] = await Promise.all([
    loadTeamInquiriesForBrand(service, user.id),
    loadTeamsYouReachedOutTo(service, user.id),
  ]);

  const name =
    profile.company_name || `${profile.first_name} ${profile.last_name}`.trim() || "Brand";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">
            Opportunities
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Opportunities
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Teams and brands you connect with on Discover—who is interested in you and who you
            reached out to—with email and phone when someone marks real interest.
          </p>
        </div>

        <div className="flex flex-col gap-10 md:gap-12">
          <OpportunitiesSection
            id="interested-in-you"
            variant="incoming"
            title={`Interested in ${profile.company_name}`}
            description='Team managers who marked "ready to pursue a partnership" or "interested, still deciding" toward your brand.'
          >
            <TeamOpportunitiesPanel rows={incoming} variant="incoming" canPropose />
          </OpportunitiesSection>

          <OpportunitiesSection
            id="your-outreach"
            variant="outgoing"
            title="Teams you reached out to"
            description="Teams you marked with positive interest on Discover—manager contact info for follow-up."
          >
            <TeamOpportunitiesPanel rows={outgoing} variant="outgoing" canPropose />
          </OpportunitiesSection>
        </div>
      </main>
    </div>
  );
}
