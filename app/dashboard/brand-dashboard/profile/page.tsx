import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

const dealTypeLabel: Record<string, string> = {
  social_media: "Social Media",
  in_person: "In-Person",
  content_creation: "Content Creation",
};

export default async function BrandProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
      <DashboardNav role="brand-manager" name={profile.company_name} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Brand Profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            {profile.company_name}
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            {profile.industry} · {profile.city}, {profile.state}
          </p>
        </div>

        <div className="space-y-5">
          <Section title="Company Details">
            <Row label="Company name" value={profile.company_name} />
            <Row label="Industry"     value={profile.industry} />
            <Row label="City"         value={profile.city} />
            <Row label="State"        value={profile.state} />
            <Row label="Budget range" value={profile.budget_range} />
          </Section>

          <Section title="Contact">
            <Row label="First name" value={profile.first_name} />
            <Row label="Last name"  value={profile.last_name} />
            <Row label="Email"      value={user.email} />
            <Row label="Phone"      value={(profile as { phone?: string }).phone} />
          </Section>

          {((profile as { website_url?: string }).website_url ||
            (profile as { social_instagram?: string }).social_instagram ||
            (profile as { social_x?: string }).social_x ||
            (profile as { social_linkedin?: string }).social_linkedin) && (
            <Section title="Online">
              {(profile as { website_url?: string }).website_url && (
                <Row
                  label="Website"
                  value={(profile as { website_url?: string }).website_url}
                />
              )}
              {(profile as { social_instagram?: string }).social_instagram && (
                <Row
                  label="Instagram"
                  value={`@${(profile as { social_instagram?: string }).social_instagram}`}
                />
              )}
              {(profile as { social_x?: string }).social_x && (
                <Row
                  label="X"
                  value={`@${(profile as { social_x?: string }).social_x}`}
                />
              )}
              {(profile as { social_linkedin?: string }).social_linkedin && (
                <Row
                  label="LinkedIn"
                  value={(profile as { social_linkedin?: string }).social_linkedin}
                />
              )}
            </Section>
          )}

          <Section title="About">
            {profile.company_description ? (
              <p className="text-sm leading-7 text-black/70 dark:text-white/60">{profile.company_description}</p>
            ) : (
              <p className="italic text-sm text-black/30 dark:text-white/25">No description added.</p>
            )}
          </Section>

          {profile.team_description && (
            <Section title="Ideal Collegiate Team">
              <p className="text-sm leading-7 text-black/70 dark:text-white/60">{profile.team_description}</p>
            </Section>
          )}

          <Section title="Targeting & Preferences">
            {(profile.target_audience as string[] | null)?.length ? (
              <ChipGroup label="Target audience" items={profile.target_audience as string[]} />
            ) : null}
            {(profile.preferred_sports as string[] | null)?.length ? (
              <ChipGroup label="Preferred sports" items={profile.preferred_sports as string[]} />
            ) : null}
            {(profile.preferred_schools as string[] | null)?.length ? (
              <ChipGroup label="Preferred schools" items={profile.preferred_schools as string[]} />
            ) : null}
            {(profile.campaign_types as string[] | null)?.length ? (
              <ChipGroup
                label="Campaign types"
                items={(profile.campaign_types as string[]).map((c) => dealTypeLabel[c] ?? c)}
              />
            ) : null}
            {!profile.target_audience?.length &&
             !profile.preferred_sports?.length &&
             !profile.campaign_types?.length && (
              <p className="text-sm italic text-black/30 dark:text-white/25">No preferences set.</p>
            )}
          </Section>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-black/10 bg-white p-6 text-center dark:border-white/10 dark:bg-[#161b27]">
          <p className="text-sm font-medium text-black/50 dark:text-white/40">
            Profile editing coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-black/40 dark:text-white/35">{label}</span>
      <span className="text-right text-sm font-medium text-black dark:text-white">
        {value ?? <span className="italic text-black/25 dark:text-white/20">Not set</span>}
      </span>
    </div>
  );
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs text-black/40 dark:text-white/35">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-black/8 bg-[#f9fafb] px-3 py-1 text-xs font-medium text-black/60 dark:border-white/8 dark:bg-[#1c2333] dark:text-white/70"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
