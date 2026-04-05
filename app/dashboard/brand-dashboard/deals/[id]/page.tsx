import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import {
  DealRow,
  DeliverableRow,
  DeliverableFrequency,
  DELIVERABLE_FREQUENCY_LABELS,
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
}

export default async function BrandDealDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { updated } = await searchParams;
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

  const { data: deal } = await supabase.from("partnerships").select("*").eq("id", id).eq("brand_id", user.id).maybeSingle();
  if (!deal) notFound();

  const d = deal as DealRow;

  const { data: deliverableRows } = await supabase
    .from("deliverables")
    .select("id, title, description, due_date, frequency, status, created_at")
    .eq("partnership_id", id)
    .order("created_at");

  const deliverables = (deliverableRows ?? []) as DeliverableRow[];

  const name =
    profile.company_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "Brand";

  const showUpdated = updated === "1";

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard/brand-dashboard/deals"
              className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
            >
              Deals
            </Link>
            <span className="text-black/25 dark:text-white/20">/</span>
            <span className="text-black/60 dark:text-white/50">{d.title}</span>
          </div>
          {d.status === "pending" && (
            <Link
              href={`/dashboard/brand-dashboard/deals/${id}/edit`}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-black/3 dark:border-white/10 dark:bg-[#161b27] dark:text-white dark:hover:bg-white/5"
            >
              Edit proposal
            </Link>
          )}
        </div>

        {showUpdated && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
            Your proposal was updated. The team will see the latest version when they review it.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${DEAL_STATUS_COLORS[d.status]}`}>
            {DEAL_STATUS_LABELS[d.status]}
          </span>
          <span className="text-sm text-black/45 dark:text-white/40">
            Sent {formatDate(d.created_at)}
            {d.team_display_name ? ` · ${d.team_display_name}` : ""}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <div className="border-b border-black/6 bg-black/2 px-8 py-6 dark:border-white/6 dark:bg-white/3">
            <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
              NIL Partnership Agreement
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">{d.title}</h1>
            {d.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-black/55 dark:text-white/45">{d.description}</p>
            )}
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            <Block label="Parties">
              <Row k="Team" v={d.team_display_name ?? "—"} />
              {d.season && <Row k="Season" v={d.season} />}
              {d.deal_type && (
                <Row k="Category" v={DEAL_CATEGORY_LABELS[d.deal_type] ?? d.deal_type} />
              )}
            </Block>

            <Block label="Term">
              <Row k="Start" v={formatDate(d.start_date)} />
              <Row k="End" v={formatDate(d.end_date)} />
            </Block>

            <Block label="Compensation">
              <Row k="Total value" v={formatCurrency(d.total_value)} />
              <Row k="Payment" v={PAYMENT_TYPE_LABELS[d.payment_type] ?? d.payment_type} />
              {d.payment_terms && <Row k="Payment terms" v={d.payment_terms} />}
            </Block>

            <Block label="NIL use">
              <p className="text-sm leading-relaxed text-black/70 dark:text-white/65">
                {d.nil_use_description ?? "—"}
              </p>
              {d.requires_opt_in && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  Requires individual athlete opt-in.
                </p>
              )}
            </Block>

            {d.exclusivity_clause && (
              <Block label="Exclusivity">
                <p className="text-sm leading-relaxed text-black/70 dark:text-white/65">{d.exclusivity_clause}</p>
              </Block>
            )}

            <Block label="Deliverables">
              {deliverables.length > 0 ? (
                <ol className="space-y-3">
                  {deliverables.map((del, i) => {
                    const freq = normalizeFrequency(del.frequency);
                    return (
                      <li key={del.id} className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f7ae0]/10 text-xs font-bold text-[#1f7ae0]">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#1f7ae0] dark:text-[#8ec5ff]">
                            {DELIVERABLE_FREQUENCY_LABELS[freq]}
                          </p>
                          <span className="font-semibold text-black dark:text-white">{del.title}</span>
                          {del.description && (
                            <span className="text-black/55 dark:text-white/45"> — {del.description}</span>
                          )}
                          {del.due_date && (
                            <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                              {freq === "one_time" ? "Due " : "Milestone: "}
                              {formatDate(del.due_date)}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-black/45 dark:text-white/35">No deliverables listed.</p>
              )}
            </Block>

            <Block label="Signatures">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Brand</p>
                  {d.brand_signer_name && (
                    <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.brand_signer_name}</p>
                  )}
                  {d.brand_signed_at && (
                    <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.brand_signed_at)}</p>
                  )}
                  {!d.brand_signer_name && !d.brand_signed_at && (
                    <p className="text-xs text-black/35 dark:text-white/30">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Team</p>
                  {d.team_signer_name ? (
                    <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.team_signer_name}</p>
                  ) : (
                    <p className="text-xs text-black/35 dark:text-white/30">
                      {d.status === "pending" ? "Awaiting acceptance" : "—"}
                    </p>
                  )}
                  {d.team_signed_at && (
                    <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.team_signed_at)}</p>
                  )}
                </div>
              </div>
            </Block>
          </div>
        </div>

        {d.status !== "pending" && (
          <p className="mt-6 text-center text-sm text-black/45 dark:text-white/40">
            This deal is no longer editable.{" "}
            <Link href="/dashboard/brand-dashboard/deals/new" className="font-semibold text-[#1f7ae0] hover:underline">
              Propose another deal
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-8 py-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">{label}</p>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-0.5 text-sm">
      <span className="w-36 shrink-0 text-black/40 dark:text-white/35">{k}</span>
      <span className="font-medium text-black/80 dark:text-white/70">{v}</span>
    </div>
  );
}
