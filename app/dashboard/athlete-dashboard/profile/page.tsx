import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import ProfilePageActions from "@/components/profile/ProfilePageActions";
import AthleteAvatar from "@/components/dashboard/AthleteAvatar";
import { isS3Configured, presignAthletePhotoDownload } from "@/lib/aws/s3";
import { normalizePhotoKey } from "@/lib/athletes/photo";

export default async function AthleteProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  /* Guarded: credentials() throws when S3 is unconfigured, and this renders mid-page. */
  const photoKey = normalizePhotoKey(profile.photo_key);
  const photoUrl =
    photoKey && isS3Configured() ? await presignAthletePhotoDownload(photoKey) : null;

  const fields = [
    "first_name", "last_name", "phone", "school",
    "graduation_year", "sport", "team", "instagram_handle",
    "bio", "tiktok_handle", "twitter_handle", "snapchat_handle",
    // Counted toward completion, so the bar rewards adding a photo.
    "photo_key",
  ];
  const filled   = fields.filter((f) => !!(profile as Record<string, unknown>)[f]).length;
  const pct      = Math.round((filled / fields.length) * 100);

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={`${profile.first_name} ${profile.last_name}`} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <AthleteAvatar
              photoUrl={photoUrl}
              firstName={profile.first_name}
              lastName={profile.last_name}
              size="xl"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Athlete Profile</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="mt-1 text-sm text-black/45 dark:text-white/40">
                {profile.team} · {profile.school}
              </p>
            </div>
          </div>
          <ProfilePageActions editHref="/dashboard/athlete-dashboard/profile/edit" />
        </div>

        {/* Completion bar */}
        <div className="mb-6 rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-black dark:text-white">Profile completion</span>
            <span className="text-sm font-bold text-[#1f7ae0]">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-[#30363d]">
            <div className="h-full rounded-full bg-[#1f7ae0] transition-all" style={{ width: `${pct}%` }} />
          </div>
          {pct < 100 && (
            <p className="mt-2 text-xs text-black/40 dark:text-white/35">
              Fill in all fields to get the most brand visibility.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <Section title="Basic Info">
            <Row label="First name"  value={profile.first_name} />
            <Row label="Last name"   value={profile.last_name} />
            <Row label="Email"       value={user.email} />
            <Row label="Phone"       value={profile.phone} />
          </Section>

          <Section title="Academics & Athletics">
            <Row label="School"          value={profile.school} />
            <Row label="Graduation year" value={String(profile.graduation_year)} />
            <Row label="Sport"           value={profile.sport} />
            <Row label="Team"            value={profile.team} />
          </Section>

          <Section title="Brand Pitch">
            {profile.bio ? (
              <p className="text-sm leading-7 text-black/70 dark:text-white/60">{profile.bio}</p>
            ) : (
              <p className="text-sm text-black/35 dark:text-white/30 italic">No bio added yet.</p>
            )}
          </Section>

          <Section title="Social Media">
            <Row
              label="Instagram"
              value={profile.instagram_handle ? `@${profile.instagram_handle}` : undefined}
              extra={profile.instagram_followers ? `${profile.instagram_followers.toLocaleString()} followers` : undefined}
            />
            <Row
              label="TikTok"
              value={profile.tiktok_handle ? `@${profile.tiktok_handle}` : undefined}
              extra={profile.tiktok_followers ? `${profile.tiktok_followers.toLocaleString()} followers` : undefined}
            />
            <Row
              label="X (Twitter)"
              value={profile.twitter_handle ? `@${profile.twitter_handle}` : undefined}
              extra={profile.twitter_followers ? `${profile.twitter_followers.toLocaleString()} followers` : undefined}
            />
            <Row
              label="Snapchat"
              value={profile.snapchat_handle ? `@${profile.snapchat_handle}` : undefined}
              extra={profile.snapchat_followers ? `${profile.snapchat_followers.toLocaleString()} followers` : undefined}
            />
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value, extra }: { label: string; value?: string; extra?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-black/40 dark:text-white/35">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-black dark:text-white">
          {value ?? <span className="italic text-black/25 dark:text-white/20">Not set</span>}
        </span>
        {extra && <p className="text-xs text-black/35 dark:text-white/30">{extra}</p>}
      </div>
    </div>
  );
}
