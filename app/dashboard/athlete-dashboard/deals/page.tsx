import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

import {
  DealStatus,
  DEAL_STATUS_COLORS,
  DEAL_CATEGORY_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

type ParticipationStatus = "invited" | "accepted" | "declined";

interface Partnership {
  id: string;
  title: string;
  deal_type: string | null;
  status: DealStatus;
  total_value: number | null;
  brand_display_name: string | null;
  team_display_name: string | null;
  season: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  source: "direct" | "team";
  participationStatus?: ParticipationStatus;
}

export default async function AthleteDealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  const [{ data: directRows }, { data: partRows }] = await Promise.all([
    supabase
      .from("partnerships")
      .select(
        "id, title, deal_type, status, total_value, brand_display_name, team_display_name, season, start_date, end_date, created_at"
      )
      .eq("athlete_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("partnership_participants")
      .select("partnership_id, status")
      .eq("athlete_id", user.id),
  ]);

  const direct = (directRows ?? []) as Omit<Partnership, "source" | "participationStatus">[];
  const directIds = new Set(direct.map((d) => d.id));

  const participantLinks = partRows ?? [];
  const teamIds = participantLinks.map((p) => p.partnership_id).filter((id) => !directIds.has(id));

  let teamDeals: Omit<Partnership, "source" | "participationStatus">[] = [];
  if (teamIds.length > 0) {
    const { data: trows } = await supabase
      .from("partnerships")
      .select(
        "id, title, deal_type, status, total_value, brand_display_name, team_display_name, season, start_date, end_date, created_at"
      )
      .in("id", teamIds)
      .order("created_at", { ascending: false });
    teamDeals = (trows ?? []) as Omit<Partnership, "source" | "participationStatus">[];
  }

  const statusByPartnership = new Map<string, ParticipationStatus>();
  for (const p of participantLinks) {
    const st = p.status as ParticipationStatus;
    if (st === "invited" || st === "accepted" || st === "declined") {
      statusByPartnership.set(p.partnership_id, st);
    }
  }

  const deals: Partnership[] = [
    ...direct.map((d) => ({ ...d, source: "direct" as const })),
    ...teamDeals.map((d) => ({
      ...d,
      source: "team" as const,
      participationStatus: statusByPartnership.get(d.id),
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const tabs = [
    { label: "All", filter: () => true },
    { label: "Active", filter: (d: Partnership) => d.status === "active" },
    { label: "Pending", filter: (d: Partnership) => d.status === "pending" },
    { label: "Completed", filter: (d: Partnership) => d.status === "completed" },
  ];

  function participationBadge(d: Partnership) {
    if (d.source !== "team" || !d.participationStatus) return null;
    if (d.participationStatus === "invited") {
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Opt in needed
        </span>
      );
    }
    if (d.participationStatus === "accepted") {
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          Opted in
        </span>
      );
    }
    return (
      <span className="rounded-full bg-black/8 px-2 py-0.5 text-[11px] font-bold text-black/50 dark:bg-white/10 dark:text-white/45">
        Declined
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={`${profile.first_name} ${profile.last_name}`} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">My Deals</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Partnerships</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Direct brand deals and team partnerships you are invited to. Open a deal to opt in when your team is offered a
            partnership.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total", value: deals.length },
            { label: "Active", value: deals.filter((d) => d.status === "active").length },
            { label: "Pending", value: deals.filter((d) => d.status === "pending").length },
            { label: "Completed", value: deals.filter((d) => d.status === "completed").length },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none"
            >
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-black dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {tabs.slice(1).map(({ label, filter }) => {
          const group = deals.filter(filter);
          if (group.length === 0) return null;
          return (
            <section key={label} className="mb-8">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">{label}</h2>
              <div className="space-y-3">
                {group.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/dashboard/athlete-dashboard/deals/${deal.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 shadow-sm transition hover:border-black/12 dark:border-white/10 dark:bg-[#161b27] dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-black dark:text-white">{deal.title}</p>
                      <p className="mt-0.5 text-sm text-black/40 dark:text-white/35">
                        {deal.brand_display_name ?? ""}
                        {deal.team_display_name ? ` · ${deal.team_display_name}` : ""}
                        {deal.deal_type ? ` · ${DEAL_CATEGORY_LABELS[deal.deal_type] ?? deal.deal_type}` : ""}
                        {deal.start_date && ` · Started ${formatDate(deal.start_date)}`}
                        {deal.end_date && ` · Ends ${formatDate(deal.end_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      {participationBadge(deal)}
                      <span className="text-sm font-semibold text-black dark:text-white">
                        {formatCurrency(deal.total_value)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DEAL_STATUS_COLORS[deal.status] ?? ""}`}>
                        {deal.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {deals.length === 0 && (
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
            <p className="text-4xl">🤝</p>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No deals yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              When a brand partners with you directly or your team roster is included on a deal, it will show up here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
