import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import MagicBubbleShell from "@/components/MagicBubbleShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  brand_id: string;
}

interface Deliverable {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  partnership_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function profileCompletion(p: Record<string, unknown>): number {
  const fields = [
    "first_name", "last_name", "phone", "school",
    "graduation_year", "sport", "team", "instagram_handle",
    "bio", "tiktok_handle", "twitter_handle", "snapchat_handle",
  ];
  const filled = fields.filter((f) => !!p[f]).length;
  return Math.round((filled / fields.length) * 100);
}

function formatCurrency(v: number | null) {
  if (!v) return "—";
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
  mixed: "Full Sponsorship",
};

const statusColor: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
  submitted: "bg-purple-50 text-purple-700 dark:bg-purple-900/25 dark:text-purple-400",
  approved:  "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  rejected:  "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AthleteDashboard() {
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

  const { data: partnerships, error: partnershipsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, brand_id")
    .eq("athlete_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (partnerships ?? []) as Partnership[];
  const activeDeals = deals.filter((d) => d.status === "active");

  // Fetch deliverables for active partnerships
  const activeIds = activeDeals.map((d) => d.id);
  const { data: deliverableRows } = activeIds.length
    ? await supabase
        .from("deliverables")
        .select("id, title, due_date, status, partnership_id")
        .in("partnership_id", activeIds)
        .neq("status", "approved")
        .order("due_date", { ascending: true })
    : { data: [] };

  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const pendingDelivs = deliverables.filter((d) => d.status === "pending" || d.status === "submitted");

  const totalEarned = deals
    .filter((d) => d.status === "completed" || d.status === "active")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const completion = profileCompletion(profile as Record<string, unknown>);

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Athlete"} />

      <main className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        {partnershipsError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-semibold">Could not load your deals</p>
            <p className="mt-1 text-red-700 dark:text-red-400">{partnershipsError.message}</p>
          </div>
        )}

        {/* ── Header ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Athlete Dashboard</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Hey, {profile.first_name ?? "Athlete"} 👋
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            {profile.team} · {profile.school} · Class of {profile.graduation_year}
          </p>
        </div>

        {/* ── Stat row ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Profile Complete" value={`${completion}%`} sub={completion === 100 ? "All done!" : "Keep filling in"} accent={completion === 100} />
          <StatCard label="Active Deals" value={String(activeDeals.length)} sub={activeDeals.length ? "In progress" : "None yet"} />
          <StatCard label="Pending Tasks" value={String(pendingDelivs.length)} sub={pendingDelivs.length ? "Need attention" : "All clear"} warn={pendingDelivs.length > 0} />
          <StatCard label="Total Earnings" value={formatCurrency(totalEarned)} sub="Across all deals" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column ── */}
          <div className="space-y-6 lg:col-span-1">

            {/* Profile card */}
            <Card title="Your Profile">
              <div className="space-y-3">
                <ProfileRow label="Sport"    value={profile.sport} />
                <ProfileRow label="Team"     value={profile.team} />
                <ProfileRow label="School"   value={profile.school} />
                <ProfileRow label="Grad year" value={String(profile.graduation_year)} />
                <ProfileRow label="Instagram" value={profile.instagram_handle ? `@${profile.instagram_handle}` : undefined} />
                {profile.tiktok_handle && (
                  <ProfileRow label="TikTok" value={`@${profile.tiktok_handle}`} />
                )}
                {profile.twitter_handle && (
                  <ProfileRow label="X (Twitter)" value={`@${profile.twitter_handle}`} />
                )}
                {profile.snapchat_handle && (
                  <ProfileRow label="Snapchat" value={`@${profile.snapchat_handle}`} />
                )}
              </div>

              {/* Completion bar */}
              <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/5">
                <div className="mb-2 flex items-center justify-between text-xs text-black/50 dark:text-white/40">
                  <span>Profile completion</span>
                  <span className="font-semibold text-black dark:text-white">{completion}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-[#30363d]">
                  <div
                    className="h-full rounded-full bg-[#1f7ae0] transition-all"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                {completion < 100 && (
                  <p className="mt-2 text-xs text-black/40 dark:text-white/35">
                    Complete your profile to attract more brands.
                  </p>
                )}
              </div>
            </Card>

            {/* Pending deliverables */}
            <Card title="Pending Deliverables">
              {pendingDelivs.length === 0 ? (
                <EmptyState icon="✅" text="No pending tasks right now." />
              ) : (
                <ul className="space-y-3">
                  {pendingDelivs.map((d) => (
                    <li key={d.id} className="flex items-start gap-3">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[d.status] ?? ""}`}>
                        {d.status}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-black dark:text-white">{d.title}</p>
                        {d.due_date && (
                          <p className="text-xs text-black/40 dark:text-white/35">Due {formatDate(d.due_date)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Active partnerships */}
            <Card title="Active Partnerships">
              {activeDeals.length === 0 ? (
                <EmptyState
                  icon="🤝"
                  text="No active deals yet."
                  sub="Once a brand partners with you, it'll show here."
                />
              ) : (
                <div className="space-y-3">
                  {activeDeals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              )}
            </Card>

            {/* All deals */}
            {deals.filter((d) => d.status !== "active").length > 0 && (
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

            {/* Payment status */}
            <Card title="Payment Overview">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat
                  label="Completed deals"
                  value={String(deals.filter((d) => d.status === "completed").length)}
                />
                <MiniStat
                  label="Pending payment"
                  value={formatCurrency(
                    activeDeals.reduce((s, d) => s + (d.total_value ?? 0), 0)
                  )}
                />
                <MiniStat
                  label="Total earned"
                  value={formatCurrency(totalEarned)}
                />
                <MiniStat
                  label="Deals in pipeline"
                  value={String(deals.filter((d) => d.status === "pending").length)}
                />
              </div>
              {deals.length === 0 && (
                <p className="mt-4 text-center text-sm text-black/35 dark:text-white/30">
                  Payments will appear here once you have active deals.
                </p>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <MagicBubbleShell className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
      <h2 className="mb-5 text-sm font-bold uppercase tracking-wider text-black/40 dark:text-white/35">{title}</h2>
      {children}
    </MagicBubbleShell>
  );
}

function StatCard({ label, value, sub, accent, warn }: {
  label: string; value: string; sub: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <MagicBubbleShell className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
      <p className="text-xs font-medium text-black/40 dark:text-white/35">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${accent ? "text-[#1f7ae0]" : warn ? "text-amber-500" : "text-black dark:text-white"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-black/35 dark:text-white/30">{sub}</p>
    </MagicBubbleShell>
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
      href={`/dashboard/athlete-dashboard/deals/${deal.id}`}
      className="flex items-center gap-4 rounded-xl border border-black/5 bg-[#f9fafb] px-4 py-3 transition-colors hover:border-black/10 hover:bg-black/[0.02] dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.07]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-black dark:text-white">{deal.title}</p>
        <p className="text-xs text-black/40 dark:text-white/35">
          {(deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal"}
          {deal.start_date && ` · Started ${formatDate(deal.start_date)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {deal.total_value != null && deal.total_value > 0 && (
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
    <div className="rounded-xl border border-black/8 bg-black/[0.03] p-4 dark:border-white/8 dark:bg-white/[0.04]">
      <p className="text-xs text-black/45 dark:text-white/45">{label}</p>
      <p className="mt-1 text-xl font-black text-black dark:text-white">{value}</p>
    </div>
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
