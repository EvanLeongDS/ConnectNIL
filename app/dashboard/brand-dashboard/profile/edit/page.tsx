import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import BrandProfileEditor from "@/components/profile/BrandProfileEditor";

const PROFILE_HREF = "/dashboard/brand-dashboard/profile";

export default async function BrandProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={profile.company_name as string} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6">
          <Link
            href={PROFILE_HREF}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7ae0] transition hover:underline"
          >
            <span aria-hidden>←</span> Back to profile
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Brand Profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Edit profile</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">Update company details and targeting preferences.</p>
        </div>

        <BrandProfileEditor
          redirectAfterSave={PROFILE_HREF}
          profile={{
            company_name: profile.company_name as string,
            first_name: profile.first_name as string,
            last_name: profile.last_name as string,
            phone: ((profile as { phone?: string | null }).phone as string | null) ?? null,
            city: profile.city as string,
            state: profile.state as string,
            industry: profile.industry as string,
            budget_range: profile.budget_range as string,
            company_description: profile.company_description as string,
            team_description: (profile.team_description as string | null) ?? null,
            target_audience: (profile.target_audience as string[] | null) ?? [],
            preferred_sports: (profile.preferred_sports as string[] | null) ?? [],
            preferred_schools: (profile.preferred_schools as string[] | null) ?? [],
            campaign_types: (profile.campaign_types as string[] | null) ?? [],
            website_url: ((profile as { website_url?: string | null }).website_url as string | null) ?? null,
            social_instagram: ((profile as { social_instagram?: string | null }).social_instagram as string | null) ?? null,
            social_x: ((profile as { social_x?: string | null }).social_x as string | null) ?? null,
            social_linkedin: ((profile as { social_linkedin?: string | null }).social_linkedin as string | null) ?? null,
          }}
        />
      </main>
    </div>
  );
}
