import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import AthleteProfileEditor from "@/components/profile/AthleteProfileEditor";

const PROFILE_HREF = "/dashboard/athlete-dashboard/profile";

export default async function AthleteProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={`${profile.first_name} ${profile.last_name}`} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6">
          <Link
            href={PROFILE_HREF}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7ae0] transition hover:underline"
          >
            <span aria-hidden>←</span> Back to profile
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Athlete Profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Edit profile</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">Update how brands see you on ConnectNIL.</p>
        </div>

        <AthleteProfileEditor
          redirectAfterSave={PROFILE_HREF}
          profile={{
            first_name: profile.first_name as string,
            last_name: profile.last_name as string,
            phone: profile.phone as string,
            school: profile.school as string,
            graduation_year: profile.graduation_year as number,
            sport: profile.sport as string,
            team: profile.team as string,
            bio: (profile.bio as string | null) ?? null,
            instagram_handle: (profile.instagram_handle as string | null) ?? null,
            tiktok_handle: (profile.tiktok_handle as string | null) ?? null,
            twitter_handle: (profile.twitter_handle as string | null) ?? null,
            snapchat_handle: (profile.snapchat_handle as string | null) ?? null,
            instagram_followers: (profile.instagram_followers as number | null) ?? null,
            tiktok_followers: (profile.tiktok_followers as number | null) ?? null,
            twitter_followers: (profile.twitter_followers as number | null) ?? null,
            snapchat_followers: (profile.snapchat_followers as number | null) ?? null,
          }}
        />
      </main>
    </div>
  );
}
