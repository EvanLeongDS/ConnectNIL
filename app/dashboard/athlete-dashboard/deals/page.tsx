import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

import {
  DealStatus,
  DEAL_STATUS_COLORS,
  DEAL_CATEGORY_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

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

export default async function AthleteDealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "athlete") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/athlete");

  const { data: rows } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, brand_display_name, season, start_date, end_date")
    .eq("athlete_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (rows ?? []) as Partnership[];

  const tabs = [
    { label: "All",       filter: () => true },
    { label: "Active",    filter: (d: Partnership) => d.status === "active" },
    { label: "Pending",   filter: (d: Partnership) => d.status === "pending" },
    { label: "Completed", filter: (d: Partnership) => d.status === "completed" },
  ];

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={`${profile.first_name} ${profile.last_name}`} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">My Deals</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Partnerships</h1>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">All your brand deals in one place.</p>
        </div>

        {/* Summary strip */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total",     value: deals.length },
            { label: "Active",    value: deals.filter((d) => d.status === "active").length },
            { label: "Pending",   value: deals.filter((d) => d.status === "pending").length },
            { label: "Completed", value: deals.filter((d) => d.status === "completed").length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-white/3">
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-black dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Deals list grouped by status */}
        {tabs.slice(1).map(({ label, filter }) => {
          const group = deals.filter(filter);
          if (group.length === 0) return null;
          return (
            <section key={label} className="mb-8">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">{label}</h2>
              <div className="space-y-3">
                {group.map((deal) => (
                  <div key={deal.id} className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 shadow-sm dark:border-white/6 dark:bg-white/3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-black dark:text-white">{deal.title}</p>
                      <p className="mt-0.5 text-sm text-black/40 dark:text-white/35">
                        {deal.brand_display_name ?? ""}
                        {deal.deal_type ? ` · ${DEAL_CATEGORY_LABELS[deal.deal_type] ?? deal.deal_type}` : ""}
                        {deal.start_date && ` · Started ${formatDate(deal.start_date)}`}
                        {deal.end_date   && ` · Ends ${formatDate(deal.end_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-black dark:text-white">{formatCurrency(deal.total_value)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DEAL_STATUS_COLORS[deal.status] ?? ""}`}>
                        {deal.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {deals.length === 0 && (
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/6 dark:bg-white/3">
            <p className="text-4xl">🤝</p>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No deals yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              Once a brand partners with you, your deals will appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
