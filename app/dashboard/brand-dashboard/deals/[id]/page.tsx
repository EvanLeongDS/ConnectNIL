import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import InitiatePaymentButton from "@/components/deals/InitiatePaymentButton";
import { DeliverableReviewButtons } from "@/components/deals/DeliverableActions";
import DeliverableProofView from "@/components/deals/DeliverableProofView";
import DealParticipantList from "@/components/deals/DealParticipantList";
import {
  countDealParticipants,
  resolveDealParticipants,
} from "@/lib/athletes/visibility";
import {
  DealRow,
  DeliverableRow,
  DealPaymentRow,
  DeliverableFrequency,
  DELIVERABLE_FREQUENCY_LABELS,
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_LABELS,
  formatCurrency,
  formatDate,
  computeNumMonths,
  installmentAmountCents,
} from "@/lib/deals/types";

const DELIVERABLE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400" },
  submitted: { label: "Submitted", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400" },
  approved:  { label: "Approved",  cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400" },
  rejected:  { label: "Rejected",  cls: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400" },
};

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; payment?: string }>;
}

export default async function BrandDealDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { updated, payment } = await searchParams;
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

  const { data: deal } = await supabase
    .from("partnerships")
    .select("*")
    .eq("id", id)
    .eq("brand_id", user.id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as DealRow;

  const { data: deliverableRows, error: deliverablesError } = await supabase
    .from("deliverables")
    .select(
      "id, title, description, due_date, frequency, status, created_at, proof_description, proof_image_urls, submitted_at, proof_analysis, proof_review_flag"
    )
    .eq("partnership_id", id)
    .order("created_at");
  if (deliverablesError) {
    // Most likely migration 019 has not been applied yet. Left unlogged, this renders
    // the deal with no deliverables at all, which reads as data loss rather than as a
    // missing column.
    console.error("deal detail: deliverables query failed:", deliverablesError);
  }
  const deliverables = (deliverableRows ?? []) as DeliverableRow[];

  // Fetch payments via service client (bypasses RLS edge cases)
  const service = createServiceClient();
  const { data: paymentRows } = await service
    .from("deal_payments")
    .select("*")
    .eq("partnership_id", id)
    .order("created_at");
  const payments = (paymentRows ?? []) as DealPaymentRow[];

  /* Athletes on this deal. resolveDealParticipants re-reads the partnership and requires
     this brand to own it before returning anyone — the check lives there rather than
     relying on the `.eq("brand_id", user.id)` filter above, so the two cannot drift apart.
     The service client is mandatory: athlete_profiles RLS is self-only, so the brand's own
     client would return an empty list with no error. */
  const participants = await resolveDealParticipants(service, id, {
    id: user.id,
    role: "brand-manager",
  });
  const participantTotal = await countDealParticipants(service, id);

  const name =
    profile.company_name || `${profile.first_name} ${profile.last_name}`.trim() || "Brand";

  const isActive = d.status === "active";
  const numMonths = computeNumMonths(d.start_date, d.end_date);

  // Build a map: deliverable_id → paid payment (for per_deliverable)
  const paidByDeliverable = new Map<string, DealPaymentRow>();
  const processingByDeliverable = new Map<string, DealPaymentRow>();
  payments.forEach((p) => {
    if (p.deliverable_id) {
      if (p.status === "paid") paidByDeliverable.set(p.deliverable_id, p);
      else if (p.status === "processing" || p.status === "pending")
        processingByDeliverable.set(p.deliverable_id, p);
    }
  });

  // Build a map: installment_number → payment (for monthly)
  const paidInstallments = new Map<number, DealPaymentRow>();
  const processingInstallments = new Map<number, DealPaymentRow>();
  payments.forEach((p) => {
    if (p.installment_number != null) {
      if (p.status === "paid") paidInstallments.set(p.installment_number, p);
      else if (p.status === "processing" || p.status === "pending")
        processingInstallments.set(p.installment_number, p);
    }
  });

  // For one_time
  const oneTimePaid = payments.find((p) => p.status === "paid");
  const oneTimeInProgress = !oneTimePaid && payments.find((p) => p.status === "processing" || p.status === "pending");

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="brand-manager" name={name} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">

        {/* Breadcrumb + edit link */}
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

        {/* Flash messages */}
        {updated === "1" && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
            Your proposal was updated. The team will see the latest version when they review it.
          </div>
        )}
        {payment === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
            Payment received! Thank you — we&apos;ve recorded the transaction.
          </div>
        )}
        {payment === "cancelled" && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700 dark:border-yellow-800/50 dark:bg-yellow-900/20 dark:text-yellow-400">
            Payment was cancelled. You can try again below.
          </div>
        )}

        {/* Status badge */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${DEAL_STATUS_COLORS[d.status]}`}>
            {DEAL_STATUS_LABELS[d.status]}
          </span>
          <span className="text-sm text-black/45 dark:text-white/40">
            Sent {formatDate(d.created_at)}
            {d.team_display_name ? ` · ${d.team_display_name}` : ""}
          </span>
          {isActive && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                d.payment_status === "paid"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
                  : d.payment_status === "partial"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400"
                  : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400"
              }`}
            >
              {d.payment_status === "paid"
                ? "Fully paid"
                : d.payment_status === "partial"
                ? `Partial — ${formatCurrency(d.paid_cents / 100)} paid`
                : "Payment due"}
            </span>
          )}
        </div>

        {/* ── Contract document ─────────────────────────────────────────── */}
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
              {d.deal_type && <Row k="Category" v={DEAL_CATEGORY_LABELS[d.deal_type] ?? d.deal_type} />}
            </Block>

            {/* The athletes whose NIL this deal licenses. Until now a brand saw only the
                team name here, so the people actually on the contract were invisible. */}
            <Block label="Athletes">
              <DealParticipantList
                participants={participants}
                total={participantTotal}
                emptyHint="This deal is with the team as a whole — no individual athletes have been added."
              />
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

            {/* Deliverables — with approve/reject for active per_deliverable deals */}
            <Block label="Deliverables">
              {deliverables.length > 0 ? (
                <ol className="space-y-4">
                  {deliverables.map((del, i) => {
                    const freq = normalizeFrequency(del.frequency);
                    const statusInfo = DELIVERABLE_STATUS_LABELS[del.status] ?? DELIVERABLE_STATUS_LABELS.pending;
                    const delPaid = paidByDeliverable.get(del.id);
                    const delInProgress = processingByDeliverable.get(del.id);

                    return (
                      <li key={del.id} className="flex gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f7ae0]/10 text-xs font-bold text-[#1f7ae0]">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1f7ae0] dark:text-[#8ec5ff]">
                              {DELIVERABLE_FREQUENCY_LABELS[freq]}
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.cls}`}>
                              {statusInfo.label}
                            </span>
                            {delPaid && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
                                Paid
                              </span>
                            )}
                          </div>
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

                          <DeliverableProofView
                            description={del.proof_description}
                            imageUrls={del.proof_image_urls}
                            analysis={del.proof_analysis}
                            showAnalysis
                            className="mt-3"
                          />
                          {isActive && del.status === "submitted" && (
                            <div className="mt-3">
                              <DeliverableReviewButtons dealId={id} deliverableId={del.id} />
                            </div>
                          )}

                          {/* Pay button for approved deliverables on per_deliverable deals */}
                          {isActive &&
                            d.payment_type === "per_deliverable" &&
                            del.status === "approved" &&
                            !delPaid &&
                            !delInProgress && (
                              <div className="mt-2">
                                <InitiatePaymentButton
                                  dealId={id}
                                  amountCents={Math.floor(
                                    ((d.total_value ?? 0) * 100) / Math.max(1, deliverables.length)
                                  )}
                                  deliverableId={del.id}
                                  label={`Pay for this deliverable`}
                                />
                              </div>
                            )}

                          {delInProgress && !delPaid && (
                            <p className="mt-1.5 text-xs text-black/45 dark:text-white/40">
                              Payment in progress…
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

        {/* ── Payment Panel (active deals only) ─────────────────────────── */}
        {isActive && d.payment_type !== "per_deliverable" && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
            <div className="border-b border-black/6 bg-black/2 px-8 py-5 dark:border-white/6 dark:bg-white/3">
              <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                Payments
              </p>
              <p className="mt-1 text-sm text-black/50 dark:text-white/40">
                5% platform fee retained by ConnectNIL; remainder distributed to the team and participating athletes.
              </p>
            </div>

            <div className="px-8 py-6">
              {/* one_time */}
              {d.payment_type === "one_time" && (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-black dark:text-white">
                      One-time payment
                    </p>
                    <p className="mt-0.5 text-xl font-black tracking-tight text-black dark:text-white">
                      {formatCurrency(d.total_value)}
                    </p>
                    <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                      ConnectNIL fee (5%): {formatCurrency((d.total_value ?? 0) * 0.05)} &nbsp;·&nbsp;
                      Net to team: {formatCurrency((d.total_value ?? 0) * 0.95)}
                    </p>
                  </div>
                  {oneTimePaid ? (
                    <span className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
                      ✓ Paid {formatDate(oneTimePaid.paid_at)}
                    </span>
                  ) : oneTimeInProgress ? (
                    <span className="text-sm text-black/45 dark:text-white/40">Payment in progress…</span>
                  ) : (
                    <InitiatePaymentButton
                      dealId={id}
                      amountCents={Math.round((d.total_value ?? 0) * 100)}
                    />
                  )}
                </div>
              )}

              {/* monthly */}
              {d.payment_type === "monthly" && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-black dark:text-white">
                    {numMonths} monthly installment{numMonths !== 1 ? "s" : ""} ·{" "}
                    {formatCurrency(d.total_value)} total
                  </p>
                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {Array.from({ length: numMonths }, (_, i) => {
                      const n = i + 1;
                      const amtCents = installmentAmountCents(d.total_value ?? 0, numMonths, n);
                      const paid = paidInstallments.get(n);
                      const inProgress = processingInstallments.get(n);

                      return (
                        <div key={n} className="flex items-center justify-between gap-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-black dark:text-white">
                              Installment {n}
                            </p>
                            <p className="text-xs text-black/45 dark:text-white/40">
                              {formatCurrency(amtCents / 100)} &nbsp;·&nbsp;
                              Net: {formatCurrency((amtCents * 0.95) / 100)}
                            </p>
                          </div>
                          {paid ? (
                            <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
                              ✓ Paid
                            </span>
                          ) : inProgress ? (
                            <span className="text-xs text-black/45 dark:text-white/40">In progress…</span>
                          ) : (
                            <InitiatePaymentButton
                              dealId={id}
                              amountCents={amtCents}
                              installmentNumber={n}
                              label={`Pay installment ${n}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Payment history ───────────────────────────────────────────── */}
        {payments.filter((p) => p.status === "paid").length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
            <div className="border-b border-black/6 bg-black/2 px-8 py-5 dark:border-white/6 dark:bg-white/3">
              <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                Payment History
              </p>
            </div>
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {payments
                .filter((p) => p.status === "paid")
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 px-8 py-4">
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">
                        {p.payment_type === "monthly" && p.installment_number
                          ? `Installment #${p.installment_number}`
                          : p.payment_type === "per_deliverable"
                          ? "Deliverable payment"
                          : "One-time payment"}
                      </p>
                      <p className="text-xs text-black/40 dark:text-white/35">
                        {formatDate(p.paid_at)} · Net: {formatCurrency(p.net_cents / 100)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-black dark:text-white">
                      {formatCurrency(p.amount_cents / 100)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {d.status !== "pending" && d.status !== "active" && (
          <p className="mt-6 text-center text-sm text-black/45 dark:text-white/40">
            This deal is no longer editable.{" "}
            <Link
              href="/dashboard/brand-dashboard/deals/new"
              className="font-semibold text-[#1f7ae0] hover:underline"
            >
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
