import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import ProfilePageActions from "@/components/profile/ProfilePageActions";

const dealTypeLabel: Record<string, string> = {
  social_media: "Social Media",
  events: "Events",
  content_creation: "Content Creation",
};

const availabilityLabel: Record<string, string> = {
  low: "Low — 1–2 deals per semester",
  medium: "Medium — 3–5 deals per semester",
  high: "High — 6+ deals per semester",
};

type TeamProfile = {
  school: string;
  team_name: string;
  sport: string;
  division: string | null;
  num_players: number;
  manager_first_name: string;
  manager_last_name: string;
  phone: string;
  athlete_emails: string[] | null;
  interested_brands: string[] | null;
  preferred_deals: string[] | null;
  availability: string;
  created_at?: string;
  updated_at?: string;
};

export default async function TeamManagerProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: raw } = await supabase
    .from("team_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!raw) redirect("/onboarding/team-manager");

  const profile = raw as TeamProfile;
  const displayName =
    [profile.manager_first_name, profile.manager_last_name].filter(Boolean).join(" ") || "Team Manager";

  const completionChecks = [
    !!profile.school?.trim(),
    !!profile.team_name?.trim(),
    !!profile.sport?.trim(),
    typeof profile.num_players === "number" && profile.num_players >= 1,
    !!profile.manager_first_name?.trim(),
    !!profile.manager_last_name?.trim(),
    !!profile.phone?.trim(),
    (profile.interested_brands?.length ?? 0) > 0,
    (profile.preferred_deals?.length ?? 0) > 0,
    !!profile.availability?.trim(),
  ];
  const filled = completionChecks.filter(Boolean).length;
  const pct = Math.round((filled / completionChecks.length) * 100);

  const athleteEmails = profile.athlete_emails ?? [];

  function formatTs(iso: string | undefined) {
    if (!iso) return undefined;
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={displayName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Team Manager Profile</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
              {profile.team_name}
            </h1>
            <p className="mt-1 text-sm text-black/45 dark:text-white/40">
              {profile.sport}
              {profile.division ? ` · ${profile.division}` : ""}
              {` · ${profile.school}`}
            </p>
          </div>
          <ProfilePageActions editHref="/dashboard/team-dashboard/profile/edit" />
        </div>

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
              Complete all team and partnership fields so brands see an accurate profile in Discover.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <Section title="Team">
            <Row label="School" value={profile.school} />
            <Row label="Team name" value={profile.team_name} />
            <Row label="Sport" value={profile.sport} />
            <Row label="Division" value={profile.division ?? undefined} />
            <Row label="Roster size" value={String(profile.num_players)} />
          </Section>

          <Section title="Manager contact">
            <Row label="First name" value={profile.manager_first_name} />
            <Row label="Last name" value={profile.manager_last_name} />
            <Row label="Email" value={user.email ?? undefined} />
            <Row label="Phone" value={profile.phone} />
          </Section>

          <Section title="Partnership preferences">
            {(profile.interested_brands?.length ?? 0) > 0 ? (
              <ChipGroup label="Interested brand types" items={profile.interested_brands ?? []} />
            ) : (
              <p className="text-sm italic text-black/30 dark:text-white/25">No brand types selected.</p>
            )}
            {(profile.preferred_deals?.length ?? 0) > 0 ? (
              <ChipGroup
                label="Preferred deal types"
                items={(profile.preferred_deals ?? []).map((d) => dealTypeLabel[d] ?? d)}
              />
            ) : (
              <p className="text-sm italic text-black/30 dark:text-white/25">No deal types selected.</p>
            )}
            <Row
              label="Deal availability"
              value={availabilityLabel[profile.availability] ?? profile.availability}
            />
          </Section>

          <Section title="Roster emails (onboarding)">
            {athleteEmails.length > 0 ? (
              <ul className="space-y-2">
                {athleteEmails.map((email) => (
                  <li
                    key={email}
                    className="rounded-lg border border-black/8 bg-[#f9fafb] px-3 py-2 text-sm font-medium text-black dark:border-white/8 dark:bg-[#1c2333] dark:text-white"
                  >
                    {email}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-black/45 dark:text-white/40">
                No emails were added during onboarding. Invite athletes from the{" "}
                <a href="/dashboard/team-dashboard/roster" className="font-semibold text-[#1f7ae0] underline-offset-2 hover:underline">
                  Roster
                </a>{" "}
                page.
              </p>
            )}
          </Section>

          {(profile.created_at || profile.updated_at) && (
            <Section title="Account">
              {profile.created_at && <Row label="Profile created" value={formatTs(profile.created_at)} />}
              {profile.updated_at && <Row label="Last updated" value={formatTs(profile.updated_at)} />}
            </Section>
          )}
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
