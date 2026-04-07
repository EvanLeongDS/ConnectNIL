import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import DealRespondButtons from "@/components/deals/DealRespondButtons";
import DeliverableProofView from "@/components/deals/DeliverableProofView";
import {
  DealRow,
  DealPaymentRow,
  DeliverableRow,
  DeliverableFrequency,
  DELIVERABLE_FREQUENCY_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_LABELS,
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  formatCurrency,
  formatDate,
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
  searchParams: Promise<{ proof?: string }>;
}

export default async function TeamDealDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { proof } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "team-manager") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("team_name, school, manager_first_name, manager_last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding/team-manager");

  const { data: deal } = await supabase
    .from("partnerships")
    .select("*")
    .eq("id", id)
    .eq("team_id", user.id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as DealRow;

  const { data: deliverableRows } = await supabase
    .from("deliverables")
    .select(
      "id, title, description, due_date, frequency, status, created_at, proof_description, proof_image_urls, submitted_at"
    )
    .eq("partnership_id", id)
    .order("created_at");
  const deliverables = (deliverableRows ?? []) as DeliverableRow[];

  const proofHref = (deliverableId: string) =>
    `/dashboard/team-dashboard/deals/${id}/deliverables/${deliverableId}`;

  const { data: paymentRows } = await supabase
    .from("deal_payments")
    .select("*")
    .eq("partnership_id", id)
    .order("created_at");
  const payments = (paymentRows ?? []) as DealPaymentRow[];
  const paidPayments = payments.filter((p) => p.status === "paid");

  const isActive = d.status === "active";
  const managerName = `${profile.manager_first_name} ${profile.manager_last_name}`.trim();

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="team-manager" name={managerName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/team-dashboard/deals"
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            Deals
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <span className="text-black/60 dark:text-white/50">{d.title}</span>
        </div>

        {proof === "submitted" && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            Proof submitted. The brand will review this deliverable.
          </div>
        )}

        {/* Status banner for non-pending deals */}
        {d.status !== "pending" && (
          <div
            className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 ${
              d.status === "active"
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20"
                : "border-black/8 bg-black/3 dark:border-white/8 dark:bg-white/3"
            }`}
          >
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${DEAL_STATUS_COLORS[d.status]}`}
            >
              {DEAL_STATUS_LABELS[d.status]}
            </span>
            <p className="text-sm text-black/55 dark:text-white/45">
              {d.status === "active" &&
                d.team_signed_at &&
                `Accepted ${formatDate(d.team_signed_at)}`}
              {d.status === "completed" && "This partnership has been completed."}
              {d.status === "cancelled" && "This deal was declined or cancelled."}
            </p>
          </div>
        )}

        {/* Contract document */}
        <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          {/* Header */}
          <div className="border-b border-black/6 bg-black/2 px-8 py-6 dark:border-white/6 dark:bg-white/3">
            <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
              NIL Partnership Agreement
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">
              {d.title}
            </h1>
            {d.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-black/55 dark:text-white/45">
                {d.description}
              </p>
            )}
            {d.status === "pending" && (
              <span className="mt-3 inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                Awaiting your review
              </span>
            )}
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            {/* Parties */}
            <ContractSection label="1. Parties">
              <ContractRow k="Brand / Company" v={d.brand_display_name ?? "—"} />
              <ContractRow k="Team" v={d.team_display_name ?? `${profile.school} ${profile.team_name}`} />
              {d.season && <ContractRow k="Season" v={d.season} />}
              {d.deal_type && (
                <ContractRow
                  k="Partnership category"
                  v={DEAL_CATEGORY_LABELS[d.deal_type] ?? d.deal_type}
                />
              )}
            </ContractSection>

            {/* Term */}
            <ContractSection label="2. Term">
              <ContractRow k="Effective from" v={formatDate(d.start_date)} />
              <ContractRow k="Through" v={formatDate(d.end_date)} />
              <p className="mt-2 text-xs leading-relaxed text-black/45 dark:text-white/35">
                The Company may not use the team&apos;s NIL after this term without a new written agreement.
              </p>
            </ContractSection>

            {/* NIL Use */}
            <ContractSection label="3. License — NIL use">
              <p className="text-sm leading-relaxed text-black/70 dark:text-white/65">
                {d.nil_use_description ??
                  "The Company is granted a non-exclusive license to use athlete names, images, and likenesses for promotional purposes as agreed between the parties."}
              </p>
              {d.requires_opt_in && (
                <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  This deal requires each participating athlete to individually opt in before being included.
                </p>
              )}
            </ContractSection>

            {/* Deliverables */}
            <ContractSection label="4. Team obligations — deliverables">
              {deliverables.length > 0 ? (
                <ol className="space-y-4">
                  {deliverables.map((del, i) => {
                    const freq = normalizeFrequency(del.frequency);
                    const statusInfo = DELIVERABLE_STATUS_LABELS[del.status] ?? DELIVERABLE_STATUS_LABELS.pending;
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
                          </div>
                          <span className="font-semibold text-black dark:text-white">{del.title}</span>
                          {del.description && (
                            <span className="ml-1 text-black/55 dark:text-white/45"> — {del.description}</span>
                          )}
                          <p className="mt-1 text-xs leading-relaxed text-black/45 dark:text-white/35">
                            {freq === "one_time" && "Single deliverable."}
                            {freq === "daily" && "Repeats each day during the agreement term."}
                            {freq === "weekly" && "Repeats each week during the agreement term."}
                            {freq === "monthly" && "Repeats each month during the agreement term."}
                            {freq === "season" && "One obligation for the full season (as described)."}
                          </p>
                          {del.due_date && (
                            <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                              {freq === "one_time" ? "Due " : "First / milestone: "}
                              {formatDate(del.due_date)}
                            </p>
                          )}
                          <DeliverableProofView
                            description={del.proof_description}
                            imageUrls={del.proof_image_urls}
                            className="mt-2"
                          />
                          {isActive && (del.status === "pending" || del.status === "rejected") && (
                            <div className="mt-2">
                              <Link
                                href={proofHref(del.id)}
                                className="inline-flex rounded-lg bg-[#1f7ae0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a6bc9]"
                              >
                                {del.status === "rejected" ? "Resubmit proof" : "Submit proof"}
                              </Link>
                            </div>
                          )}
                          {isActive && del.status === "submitted" && (
                            <p className="mt-1.5 text-xs text-black/40 dark:text-white/35">
                              Awaiting brand review…
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-black/45 dark:text-white/35">
                  No specific deliverables listed — to be agreed upon between parties.
                </p>
              )}
            </ContractSection>

            {/* Compensation */}
            <ContractSection label="5. Compensation">
              <ContractRow k="Total value" v={formatCurrency(d.total_value)} />
              <ContractRow k="Payment structure" v={PAYMENT_TYPE_LABELS[d.payment_type] ?? d.payment_type} />
              {d.payment_terms && <ContractRow k="Payment terms" v={d.payment_terms} />}
              <p className="mt-2 text-xs leading-relaxed text-black/45 dark:text-white/35">
                The Company shall provide compensation as stated above in exchange for the team&apos;s NIL and services under this agreement.
              </p>
            </ContractSection>

            {/* Exclusivity */}
            {d.exclusivity_clause && (
              <ContractSection label="6. Exclusivity">
                <p className="text-sm leading-relaxed text-black/70 dark:text-white/65">
                  {d.exclusivity_clause}
                </p>
              </ContractSection>
            )}

            {/* Standard terms */}
            <ContractSection label={`${d.exclusivity_clause ? "7" : "6"}. Standard terms`}>
              <div className="space-y-2.5 text-sm leading-relaxed text-black/65 dark:text-white/55">
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">Non-disparagement.</span>{" "}
                  The team and its athletes shall not make damaging or harmful statements about the Company or its products during the term.
                </p>
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">Independent contractor.</span>{" "}
                  Athletes are independent contractors. Nothing in this agreement establishes an employer/employee relationship.
                </p>
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">Termination.</span>{" "}
                  Either party may terminate this agreement for any reason by providing 14 days written notice. Immediate termination is permitted upon material breach.
                </p>
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">Force majeure.</span>{" "}
                  Neither party will be responsible for failing to meet obligations due to extraordinary events beyond their control.
                </p>
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">Confidentiality.</span>{" "}
                  The terms of this agreement are confidential and shall not be shared with third parties without mutual written consent.
                </p>
                <p>
                  <span className="font-semibold text-black/80 dark:text-white/70">NCAA/institutional compliance.</span>{" "}
                  This agreement is subject to the approval requirements of the athlete&apos;s educational institution as required by applicable law.
                </p>
              </div>
            </ContractSection>

            {/* Signing info */}
            <ContractSection label="Signatures">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-black/35 dark:text-white/30">
                    Brand
                  </p>
                  <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                    {d.brand_display_name ?? "—"}
                  </p>
                  {d.brand_signer_name && (
                    <p className="mt-1 text-sm text-black/70 dark:text-white/60">
                      Signed: <span className="font-semibold text-black dark:text-white">{d.brand_signer_name}</span>
                    </p>
                  )}
                  {d.brand_signed_at && (
                    <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                      {formatDate(d.brand_signed_at)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-black/35 dark:text-white/30">
                    Team
                  </p>
                  <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                    {d.team_display_name ?? `${profile.school} ${profile.team_name}`}
                  </p>
                  {d.team_signed_at ? (
                    <>
                      {d.team_signer_name && (
                        <p className="mt-1 text-sm text-black/70 dark:text-white/60">
                          Signed:{" "}
                          <span className="font-semibold text-black dark:text-white">{d.team_signer_name}</span>
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                        {formatDate(d.team_signed_at)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-xs text-black/35 dark:text-white/30">Pending your signature</p>
                  )}
                </div>
              </div>
            </ContractSection>
          </div>
        </div>

        {/* Accept / Decline */}
        {d.status === "pending" && (
          <div className="mt-8 rounded-2xl border border-black/8 bg-white p-6 shadow-sm dark:border-white/8 dark:bg-[#161b27]">
            <h2 className="mb-1 text-base font-bold text-black dark:text-white">
              Your response
            </h2>
            <p className="mb-5 text-sm text-black/50 dark:text-white/40">
              Review the full agreement above, then accept or decline.
            </p>
            <DealRespondButtons dealId={d.id} />
          </div>
        )}

        {/* Payment status (active / completed deals) */}
        {(isActive || d.status === "completed") && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
            <div className="border-b border-black/6 bg-black/2 px-8 py-5 dark:border-white/6 dark:bg-white/3">
              <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                Payment Status
              </p>
            </div>
            <div className="px-8 py-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-sm text-black/50 dark:text-white/40">Total value</p>
                  <p className="text-xl font-black tracking-tight text-black dark:text-white">
                    {formatCurrency(d.total_value)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-black/50 dark:text-white/40">Received so far</p>
                  <p className="text-xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(d.paid_cents / 100)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
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
                    ? "Partially paid"
                    : "Awaiting payment"}
                </span>
              </div>

              {paidPayments.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                    Transactions
                  </p>
                  {paidPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-black/2 px-4 py-2.5 dark:bg-white/3">
                      <p className="text-sm text-black/70 dark:text-white/60">
                        {p.payment_type === "monthly" && p.installment_number
                          ? `Installment #${p.installment_number}`
                          : p.payment_type === "per_deliverable"
                          ? "Deliverable payment"
                          : "One-time payment"}{" "}
                        · {formatDate(p.paid_at)}
                      </p>
                      <span className="text-sm font-semibold text-black dark:text-white">
                        {formatCurrency(p.net_cents / 100)}
                        <span className="ml-1 text-xs font-normal text-black/40 dark:text-white/35">
                          (net)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ContractSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-8 py-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
        {label}
      </p>
      {children}
    </div>
  );
}

function ContractRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-0.5 text-sm">
      <span className="w-40 shrink-0 text-black/40 dark:text-white/35">{k}</span>
      <span className="font-medium text-black/80 dark:text-white/70">{v}</span>
    </div>
  );
}
