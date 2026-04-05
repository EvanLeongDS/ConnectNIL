import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  athlete_id: string | null;
  team_id: string | null;
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
  in_person: "In-Person",
  content_creation: "Content Creation",
  events: "Events",
  mixed: "Full Sponsorship",
};

const statusColor: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BrandDashboard() {
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

  const { data: partnerships, error: partnershipsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, athlete_id, team_id")
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals  = deals.filter((d) => d.status === "active");
  const pendingDeals = deals.filter((d) => d.status === "pending");

  // Unique partners (athletes + teams)
  const uniqueAthletes = new Set(deals.filter((d) => d.athlete_id).map((d) => d.athlete_id)).size;
  const uniqueTeams    = new Set(deals.filter((d) => d.team_id).map((d) => d.team_id)).size;
  const totalPartners  = uniqueAthletes + uniqueTeams;

  const totalSpent = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const activeSpend = activeDeals.reduce((s, d) => s + (d.total_value ?? 0), 0);

  // Campaign type breakdown from profile prefs
  const campaignTypes: string[] = profile.campaign_types ?? [];

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={profile.company_name ?? "Brand"} />

      <main className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        {partnershipsError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-semibold">Could not load your deals</p>
            <p className="mt-1 text-red-700 dark:text-red-400">{partnershipsError.message}</p>
          </div>
        )}

        {/* ── Header ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Brand Dashboard</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            {profile.company_name}
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            {profile.industry} · {profile.city}, {profile.state}
          </p>
        </div>

        {/* ── Stat row ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Active Campaigns" value={String(activeDeals.length)} sub={activeDeals.length ? "In progress" : "None yet"} accent={activeDeals.length > 0} />
          <StatCard label="Partners" value={String(totalPartners)} sub={`${uniqueAthletes} athletes · ${uniqueTeams} teams`} />
          <StatCard label="Active Spend" value={activeSpend > 0 ? formatCurrency(activeSpend) : "—"} sub="Across active deals" />
          <StatCard label="Total Spent" value={totalSpent > 0 ? formatCurrency(totalSpent) : "—"} sub="Completed deals" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column ── */}
          <div className="space-y-6 lg:col-span-1">

            {/* Company profile */}
            <Card title="Company Profile">
              <div className="space-y-3">
                <ProfileRow label="Industry"    value={profile.industry} />
                <ProfileRow label="Budget range" value={profile.budget_range} />
                <ProfileRow label="Location"    value={`${profile.city}, ${profile.state}`} />
                <ProfileRow label="Contact"     value={`${profile.first_name} ${profile.last_name}`} />
              </div>

              {profile.company_description && (
                <div className="mt-4 rounded-xl border border-black/5 bg-[#f9fafb] p-3 dark:border-white/5 dark:bg-[#1c2333]">
                  <p className="text-xs font-medium text-black/40 dark:text-white/35">About</p>
                  <p className="mt-1 text-sm leading-6 text-black/70 dark:text-white/60 line-clamp-4">
                    {profile.company_description}
                  </p>
                </div>
              )}
            </Card>

            {/* Campaign preferences */}
            <Card title="Campaign Preferences">
              <div className="space-y-4">
                {profile.preferred_sports?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-black/40 dark:text-white/35">Preferred sports</p>
                    <div className="flex flex-wrap gap-2">
                      {(profile.preferred_sports as string[]).map((s) => (
                        <Chip key={s}>{s}</Chip>
                      ))}
                    </div>
                  </div>
                )}
                {campaignTypes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-black/40 dark:text-white/35">Campaign types</p>
                    <div className="flex flex-wrap gap-2">
                      {campaignTypes.map((c) => (
                        <Chip key={c}>{dealTypeLabel[c] ?? c}</Chip>
                      ))}
                    </div>
                  </div>
                )}
                {profile.target_audience?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-black/40 dark:text-white/35">Target audience</p>
                    <div className="flex flex-wrap gap-2">
                      {(profile.target_audience as string[]).map((a) => (
                        <Chip key={a}>{a}</Chip>
                      ))}
                    </div>
                  </div>
                )}
                {campaignTypes.length === 0 && !profile.preferred_sports?.length && (
                  <p className="text-sm text-black/35 dark:text-white/30">No preferences set.</p>
                )}
              </div>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Active partnerships */}
            <Card title="Active Partnerships">
              {activeDeals.length === 0 ? (
                <EmptyState
                  icon="📢"
                  text="No active campaigns yet."
                  sub="Reach out to athletes or teams to start a partnership."
                />
              ) : (
                <div className="space-y-3">
                  {activeDeals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              )}
            </Card>

            {/* Teams / Athletes working with */}
            <Card title="Partners Overview">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Athletes working with" value={String(uniqueAthletes)} />
                <MiniStat label="Teams working with"    value={String(uniqueTeams)} />
                <MiniStat label="Pending proposals"     value={String(pendingDeals.length)} />
                <MiniStat label="Completed campaigns"   value={String(deals.filter((d) => d.status === "completed").length)} />
              </div>
              {deals.length === 0 && (
                <p className="mt-4 text-center text-sm text-black/35 dark:text-white/30">
                  Start reaching out to build partnerships.
                </p>
              )}
            </Card>

            {/* Spending overview */}
            <Card title="Spending Overview">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Active spend"   value={activeSpend > 0 ? formatCurrency(activeSpend) : "—"} />
                <MiniStat label="Total spent"    value={totalSpent > 0 ? formatCurrency(totalSpent) : "—"} />
                <MiniStat
                  label="Pending offers"
                  value={formatCurrency(pendingDeals.reduce((s, d) => s + (d.total_value ?? 0), 0))}
                />
                <MiniStat label="Deals total"    value={String(deals.length)} />
              </div>
              {deals.length === 0 && (
                <p className="mt-4 text-center text-sm text-black/35 dark:text-white/30">
                  Spending will be tracked once you create deals.
                </p>
              )}
            </Card>

            {/* Pending proposals — link to full Deals page for view/edit */}
            {pendingDeals.length > 0 && (
              <Card title="Pending proposals">
                <p className="mb-4 text-sm text-black/50 dark:text-white/40">
                  Awaiting team review.{" "}
                  <Link href="/dashboard/brand-dashboard/deals" className="font-semibold text-[#1f7ae0] hover:underline">
                    Open Deals
                  </Link>{" "}
                  to view or edit.
                </p>
                <div className="space-y-3">
                  {pendingDeals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              </Card>
            )}

            {/* Completed / cancelled (pending has its own card above) */}
            {deals.filter((d) => d.status !== "active" && d.status !== "pending").length > 0 && (
              <Card title="Past & other campaigns">
                <div className="space-y-3">
                  {deals
                    .filter((d) => d.status !== "active" && d.status !== "pending")
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

function StatCard({ label, value, sub, accent, warn }: {
  label: string; value: string; sub: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
      <p className="text-xs font-medium text-black/40 dark:text-white/35">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${accent ? "text-[#1f7ae0]" : warn ? "text-amber-500" : "text-black dark:text-white"}`}>
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
    <Link
      href={`/dashboard/brand-dashboard/deals/${deal.id}`}
      className="flex items-center gap-4 rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-3 transition-colors hover:border-black/10 hover:bg-black/[0.02] dark:border-white/5 dark:bg-[#1c2333] dark:hover:border-white/10 dark:hover:bg-white/[0.03]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-black dark:text-white">{deal.title}</p>
        <p className="text-xs text-black/40 dark:text-white/35">
          {(deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal"}
          {deal.team_id && " · Team deal"}
          {deal.athlete_id && !deal.team_id && " · Athlete deal"}
          {deal.start_date && ` · ${formatDate(deal.start_date)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {deal.total_value != null && (
          <span className="text-sm font-semibold text-black dark:text-white">
            {formatCurrency(deal.total_value)}
          </span>
        )}
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[deal.status] ?? ""}`}>
          {deal.status}
        </span>
      </div>
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-[#f9fafb] p-4 dark:border-white/5 dark:bg-[#1c2333]">
      <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
      <p className="mt-1 text-xl font-black text-black dark:text-white">{value}</p>
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
