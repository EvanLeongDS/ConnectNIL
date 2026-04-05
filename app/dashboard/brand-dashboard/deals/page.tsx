import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  DealRow,
  DealStatus,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_LABELS,
  DEAL_CATEGORY_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

export const dynamic = "force-dynamic";

/** Pending first so brands see proposals awaiting team response at the top. */
const STATUS_GROUPS: DealStatus[] = ["pending", "active", "completed", "cancelled"];

export default async function BrandDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "brand-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("company_name, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/brand-manager");

  const { data: rows, error: dealsError } = await supabase
    .from("partnerships")
    .select(
      "id, title, description, team_display_name, season, deal_type, status, total_value, payment_type, start_date, end_date, created_at"
    )
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  const deals = (rows ?? []) as DealRow[];

  const params = await searchParams;
  const justSent = params.sent === "1";

  const name =
    profile.company_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "Brand";

  const totalPending = deals.filter((d) => d.status === "pending").length;
  const totalActive = deals.filter((d) => d.status === "active").length;
  const activeValue = deals
    .filter((d) => d.status === "active")
    .reduce((s, d) => s + (d.total_value ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">
              Brand Deals
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-black dark:text-white">
              Deals
            </h1>
            <p className="mt-1 text-sm text-black/45 dark:text-white/40">
              Every proposal you have sent appears below. Open a deal to review the full agreement; you can edit details
              while a proposal is still awaiting team review.
            </p>
          </div>
          <Link
            href="/dashboard/brand-dashboard/deals/new"
            className="shrink-0 rounded-xl bg-[#1f7ae0] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#1a6cc5]"
          >
            + Propose a deal
          </Link>
        </div>

        {justSent && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
            Deal proposal sent! The team manager will review it shortly.
          </div>
        )}

        {dealsError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-semibold">Could not load your deals</p>
            <p className="mt-1 text-red-700 dark:text-red-400">{dealsError.message}</p>
            <p className="mt-2 text-xs text-red-600/90 dark:text-red-400/80">
              If you recently ran database migrations, confirm <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">011_deals_v2.sql</code> is applied
              (column <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">total_value</code> replaces <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">value</code>).
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total deals", value: String(deals.length) },
            { label: "Pending review", value: String(totalPending) },
            { label: "Active", value: String(totalActive) },
            { label: "Active value", value: formatCurrency(activeValue) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]"
            >
              <p className="text-xs text-black/40 dark:text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-black dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {STATUS_GROUPS.map((status) => {
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
                    href={`/dashboard/brand-dashboard/deals/${deal.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-black/6 bg-white px-5 py-4 shadow-sm transition hover:border-black/12 dark:border-white/6 dark:bg-[#161b27] dark:hover:border-white/12"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-black dark:text-white">{deal.title}</p>
                      <p className="mt-0.5 text-sm text-black/40 dark:text-white/35">
                        <span className="text-black/50 dark:text-white/45">Sent {formatDate(deal.created_at)}</span>
                        {" · "}
                        {deal.team_display_name ?? "—"}
                        {deal.season ? ` · ${deal.season}` : ""}
                        {deal.deal_type
                          ? ` · ${DEAL_CATEGORY_LABELS[deal.deal_type] ?? deal.deal_type}`
                          : ""}
                        {deal.start_date ? ` · ${formatDate(deal.start_date)}` : ""}
                        {deal.end_date ? ` → ${formatDate(deal.end_date)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      {status === "pending" && (
                        <span className="text-xs font-semibold text-[#1f7ae0] dark:text-[#8ec5ff]">View / edit →</span>
                      )}
                      <span className="text-sm font-semibold text-black dark:text-white">
                        {formatCurrency(deal.total_value)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DEAL_STATUS_COLORS[status]}`}>
                        {DEAL_STATUS_LABELS[status]}
                      </span>
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
            <p className="mt-3 font-semibold text-black/60 dark:text-white/50">No deals yet</p>
            <p className="mt-1 text-sm text-black/35 dark:text-white/30">
              Propose your first NIL partnership to get started. After you send one, it will show up here and on your{" "}
              <Link href="/dashboard/brand-dashboard" className="font-semibold text-[#1f7ae0] hover:underline">
                brand overview
              </Link>
              .
            </p>
            <Link
              href="/dashboard/brand-dashboard/deals/new"
              className="mt-5 inline-block rounded-xl bg-[#1f7ae0] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1a6cc5]"
            >
              Propose a deal
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
