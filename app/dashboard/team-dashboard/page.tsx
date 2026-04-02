import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partnership {
  id: string;
  title: string;
  deal_type: string;
  status: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  brand_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const dealTypeLabel: Record<string, string> = {
  social_media: "Social Media",
  events: "Events",
  content_creation: "Content Creation",
};

const statusColor: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TeamDashboard() {
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

  const { data: partnerships } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, value, start_date, end_date, brand_id")
    .eq("team_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals  = deals.filter((d) => d.status === "active");
  const pendingDeals = deals.filter((d) => d.status === "pending");

  const athleteEmails: string[] = profile.athlete_emails ?? [];
  const totalEarned = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.value ?? 0), 0);

  // "Athlete participation" = athletes invited / roster size
  const invitesSent     = athleteEmails.length;
  const participationPct = profile.num_players > 0
    ? Math.min(100, Math.round((invitesSent / profile.num_players) * 100))
    : 0;

  const interestedBrands: string[] = profile.interested_brands ?? [];
  const preferredDeals:   string[] = profile.preferred_deals ?? [];

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={[profile.manager_first_name, profile.manager_last_name].filter(Boolean).join(" ") || "Team Manager"} />

      <main className="mx-auto max-w-7xl px-6 py-10 md:px-10">

        {/* ── Header ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Team Dashboard</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            {profile.team_name}
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            {profile.sport}
            {profile.division ? ` · ${profile.division}` : ""}
            {` · ${profile.school}`}
          </p>
        </div>

        {/* ── Stat row ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Roster Size"     value={String(profile.num_players)} sub="Registered players" />
          <StatCard label="Invites Sent"    value={String(invitesSent)} sub={`${participationPct}% of roster`} accent={invitesSent > 0} />
          <StatCard label="Active Deals"    value={String(activeDeals.length)} sub={activeDeals.length ? "In progress" : "None yet"} accent={activeDeals.length > 0} />
          <StatCard label="Total Earned"    value={totalEarned > 0 ? formatCurrency(totalEarned) : "—"} sub="Completed deals" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column ── */}
          <div className="space-y-6 lg:col-span-1">

            {/* Team info */}
            <Card title="Team Info">
              <div className="space-y-3">
                <ProfileRow label="School"      value={profile.school} />
                <ProfileRow label="Team"        value={profile.team_name} />
                <ProfileRow label="Sport"       value={profile.sport} />
                {profile.division && <ProfileRow label="Division" value={profile.division} />}
                <ProfileRow label="Players"     value={String(profile.num_players)} />
                <ProfileRow label="Availability" value={profile.availability} />
              </div>
            </Card>

            {/* Partnership preferences */}
            <Card title="Partnership Preferences">
              <div className="space-y-4">
                {interestedBrands.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-black/40 dark:text-white/35">Interested brands</p>
                    <div className="flex flex-wrap gap-2">
                      {interestedBrands.map((b) => <Chip key={b}>{b}</Chip>)}
                    </div>
                  </div>
                )}
                {preferredDeals.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-black/40 dark:text-white/35">Preferred deal types</p>
                    <div className="flex flex-wrap gap-2">
                      {preferredDeals.map((d) => <Chip key={d}>{dealTypeLabel[d] ?? d}</Chip>)}
                    </div>
                  </div>
                )}
                {interestedBrands.length === 0 && preferredDeals.length === 0 && (
                  <p className="text-sm text-black/35 dark:text-white/30">No preferences set.</p>
                )}
              </div>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Active brand deals */}
            <Card title="Active Brand Deals">
              {activeDeals.length === 0 ? (
                <EmptyState
                  icon="🤝"
                  text="No active brand deals yet."
                  sub="Brands will reach out once your team profile is visible."
                />
              ) : (
                <div className="space-y-3">
                  {activeDeals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              )}
            </Card>

            {/* Roster / invites */}
            <Card title="Roster & Invites">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-black text-black dark:text-white">{invitesSent}</p>
                  <p className="text-xs text-black/40 dark:text-white/35">
                    of {profile.num_players} athletes invited
                  </p>
                </div>
                {/* Participation bar */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-semibold text-[#1f7ae0]">{participationPct}% coverage</span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#1f7ae0] transition-all"
                      style={{ width: `${participationPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {athleteEmails.length === 0 ? (
                <EmptyState
                  icon="📋"
                  text="No athletes invited yet."
                  sub="Add athlete emails in your profile to build your roster."
                />
              ) : (
                <ul className="mt-4 space-y-2">
                  {athleteEmails.map((email) => (
                    <li key={email} className="flex items-center gap-3 rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-2.5 dark:border-white/5 dark:bg-[#1c2333]">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-xs font-bold text-[#1f7ae0]">
                        {email[0].toUpperCase()}
                      </div>
                      <span className="truncate text-sm text-black/70 dark:text-white/65">{email}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400">
                        Invited
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Pending + history */}
            {(pendingDeals.length > 0 || deals.filter((d) => d.status === "completed").length > 0) && (
              <Card title="Deal History">
                <div className="space-y-3">
                  {deals
                    .filter((d) => d.status !== "active")
                    .map((deal) => (
                      <DealRow key={deal.id} deal={deal} />
                    ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
      <h2 className="mb-5 text-sm font-bold uppercase tracking-wider text-black/40 dark:text-white/35">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
      <p className="text-xs font-medium text-black/40 dark:text-white/35">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${accent ? "text-[#1f7ae0]" : "text-black dark:text-white"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-black/35 dark:text-white/30">{sub}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-black/40 dark:text-white/35">{label}</span>
      <span className="text-right text-sm font-medium text-black dark:text-white">
        {value ?? <span className="text-black/25 dark:text-white/20">Not set</span>}
      </span>
    </div>
  );
}

function DealRow({ deal }: { deal: Partnership }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-3 dark:border-white/5 dark:bg-[#1c2333]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-black dark:text-white">{deal.title}</p>
        <p className="text-xs text-black/40 dark:text-white/35">
          {dealTypeLabel[deal.deal_type] ?? deal.deal_type}
          {deal.start_date && ` · ${formatDate(deal.start_date)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {deal.value != null && (
          <span className="text-sm font-semibold text-black dark:text-white">{formatCurrency(deal.value)}</span>
        )}
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[deal.status] ?? ""}`}>
          {deal.status}
        </span>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-black/8 bg-[#f9fafb] px-3 py-1 text-xs font-medium text-black/60 dark:border-white/8 dark:bg-[#1c2333] dark:text-white/70">
      {children}
    </span>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="py-6 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="text-sm font-medium text-black/50 dark:text-white/45">{text}</p>
      {sub && <p className="mt-1 text-xs text-black/30 dark:text-white/25">{sub}</p>}
    </div>
  );
}
