import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";

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

const dealTypeLabel: Record<string, string> = {
  social_media: "Social Media",
  in_person: "In-Person",
  content_creation: "Content Creation",
};

const statusColor: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

function formatCurrency(v: number | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function BrandCampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("company_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  const { data: rows, error: loadError } = await supabase
    .from("partnerships")
    .select("id, title, deal_type, status, total_value, start_date, end_date, athlete_id, team_id")
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (rows ?? []) as Partnership[];

  const totalBudget = deals.reduce((s, d) => s + (d.total_value ?? 0), 0);
  const spent = deals
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  const statusGroups = ["active", "pending", "completed", "cancelled"] as const;

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={profile.company_name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        {loadError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-semibold">Could not load campaigns</p>
            <p className="mt-1 text-red-700 dark:text-red-400">{loadError.message}</p>
          </div>
        )}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Brand Campaigns</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">Campaigns</h1>
            <p className="mt-1 text-sm text-black/45 dark:text-white/40">Track all your NIL partnerships here.</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total campaigns", value: String(deals.length) },
            { label: "Active",          value: String(deals.filter((d) => d.status === "active").length) },
            { label: "Total committed", value: formatCurrency(totalBudget) },
            { label: "Spent",           value: formatCurrency(spent) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-black dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Groups */}
        {statusGroups.map((status) => {
          const group = deals.filter((d) => d.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="mb-8">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">
                {status}
              </h2>
              <div className="space-y-3">
                {group.map((deal) => (
                  <div key={deal.id} className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-black dark:text-white">{deal.title}</p>
                      <p className="mt-0.5 text-sm text-black/40 dark:text-white/35">
                        {(deal.deal_type && (dealTypeLabel[deal.deal_type] ?? deal.deal_type)) || "Deal"}
                        {deal.team_id    && " · Team deal"}
                        {deal.athlete_id && !deal.team_id && " · Athlete deal"}
                        {deal.start_date && ` · ${formatDate(deal.start_date)}`}
                        {deal.end_date   && ` → ${formatDate(deal.end_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-black dark:text-white">
                        {formatCurrency(deal.total_value)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[status]}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {deals.length === 0 && (
          <div className="rounded-2xl border border-black/6 bg-white py-16 text-center shadow-sm dark:border-white/6 dark:bg-[#161b27]">
            <p className="text-4xl">📢</p>
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No campaigns yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              Start reaching out to athletes and teams to create your first deal.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
