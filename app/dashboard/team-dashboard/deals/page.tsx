import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  DealStatus,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_LABELS,
  DEAL_CATEGORY_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

export const dynamic = "force-dynamic";

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: DealStatus;
  total_value: number | null;
  brand_display_name: string | null;
  season: string | null;
  start_date: string | null;
  end_date: string | null;
}

export default async function TeamDealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("team_name, manager_first_name, manager_last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/team-manager");

  const { data: rows, error: dealsError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, brand_display_name, season, start_date, end_date, created_at")
    .eq("team_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (rows ?? []) as Partnership[];

  const totalEarned = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const activeEarning = deals
    .filter((d) => d.status === "active")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const statusGroups: DealStatus[] = ["active", "pending", "completed", "cancelled"];

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={`${profile.manager_first_name} ${profile.manager_last_name}`} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        {dealsError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-semibold">Could not load deals</p>
            <p className="mt-1 text-red-700 dark:text-red-400">{dealsError.message}</p>
            <p className="mt-2 text-xs text-red-600/90 dark:text-red-400/80">
              Confirm Supabase migration <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">011_deals_v2.sql</code> is applied so{" "}
              <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">total_value</code> and related columns exist.
            </p>
          </div>
        )}

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Team Deals</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
            Brand Deals
          </h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            All partnerships for {profile.team_name}.
          </p>
        </div>

        {/* Summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total deals",  value: String(deals.length) },
            { label: "Pending",      value: String(deals.filter((d) => d.status === "pending").length) },
            { label: "Active value", value: formatCurrency(activeEarning) },
            { label: "Total earned", value: formatCurrency(totalEarned) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-black dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Grouped list */}
        {statusGroups.map((status) => {
          const group = deals.filter((d) => d.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="mb-8">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">
                {DEAL_STATUS_LABELS[status]}
              </h2>
              <div className="space-y-3">
                {group.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/dashboard/team-dashboard/deals/${deal.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 shadow-sm transition-colors hover:bg-black/1 dark:border-white/6 dark:bg-[#161b27] dark:hover:bg-white/3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-black dark:text-white">{deal.title}</p>
                      <p className="mt-0.5 text-sm text-black/40 dark:text-white/35">
                        {deal.brand_display_name ?? "—"}
                        {deal.season ? ` · ${deal.season}` : ""}
                        {deal.deal_type ? ` · ${DEAL_CATEGORY_LABELS[deal.deal_type] ?? deal.deal_type}` : ""}
                        {deal.start_date && ` · ${formatDate(deal.start_date)}`}
                        {deal.end_date   && ` → ${formatDate(deal.end_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-black dark:text-white">{formatCurrency(deal.total_value)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DEAL_STATUS_COLORS[status]}`}>
                        {DEAL_STATUS_LABELS[status]}
                      </span>
                      {status === "pending" && (
                        <span className="text-xs font-semibold text-[#1f7ae0]">Review →</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {deals.length === 0 && !dealsError && (
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/6 dark:bg-[#161b27]">
            <p className="text-4xl">🤝</p>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No brand deals yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              When a brand sends a proposal to your team through Discover, it will appear here for review.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
