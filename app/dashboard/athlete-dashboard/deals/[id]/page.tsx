import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DashboardNav from "@/components/dashboard/DashboardNav";
import AthleteDealOptIn from "@/components/deals/AthleteDealOptIn";
import DeliverableProofView from "@/components/deals/DeliverableProofView";
import {
  DealRow,
  DealPaymentRow,
  DeliverableRow,
  DeliverableFrequency,
  DELIVERABLE_FREQUENCY_LABELS,
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  formatCurrency,
  formatCents,
  formatDate,
  deliverableStatusMeta,
  isAwaitingSubmission,
} from "@/lib/deals/types";

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proof?: string }>;
}

export default async function AthleteDealDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { proof } = await searchParams;
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

  // Use service client so RLS doesn't block team deals where the athlete
  // isn't yet in partnership_participants (the "not-added" case).
  const service = createServiceClient();
  const { data: deal } = await service
    .from("partnerships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as DealRow;

  const isDirectAthlete = d.athlete_id === user.id;
  const { data: participation } = await supabase
    .from("partnership_participants")
    .select("status")
    .eq("partnership_id", id)
    .eq("athlete_id", user.id)
    .maybeSingle();

  // For team deals, also check membership via team_athlete_invitations
  // (covers athletes who joined after the deal was proposed)
  let isOnTeam = false;
  if (!isDirectAthlete && !participation && d.team_id) {
    const userEmail = user.email?.toLowerCase();
    if (userEmail) {
      const { data: invite } = await service
        .from("team_athlete_invitations")
        .select("id")
        .eq("team_id", d.team_id)
        .eq("email", userEmail)
        .not("accepted_at", "is", null)
        .maybeSingle();
      isOnTeam = !!invite;
    }
  }

  if (!isDirectAthlete && !participation && !isOnTeam) notFound();

  const { data: deliverableRows, error: deliverablesError } = await service
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

  const { data: paymentRows } = await service
    .from("deal_payments")
    .select("*")
    .eq("partnership_id", id)
    .order("created_at");
  const payments = (paymentRows ?? []) as DealPaymentRow[];
  const paidPayments = payments.filter((p) => p.status === "paid");

  const isActive = d.status === "active";
  const athleteName = `${profile.first_name} ${profile.last_name}`.trim();
  // Show opt-in for: invited, or on team but not yet in partnership_participants
  const showTeamOptIn = Boolean(d.team_id && (participation || isOnTeam));
  const optInStatus: "invited" | "accepted" | "declined" =
    (participation?.status as "invited" | "accepted" | "declined") ?? "invited";
  const canSubmitDeliverables =
    isActive && (isDirectAthlete || participation?.status === "accepted");
  const proofHref = (deliverableId: string) =>
    `/dashboard/athlete-dashboard/deals/${id}/deliverables/${deliverableId}`;

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#0d1117]">
      <DashboardNav role="athlete" name={athleteName} />
      <main className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/athlete-dashboard/deals"
            className="text-black/40 hover:text-black dark:text-white/35 dark:hover:text-white"
          >
            Deals
          </Link>
          <span className="text-black/25 dark:text-white/20">/</span>
          <span className="text-black/60 dark:text-white/50">{d.title}</span>
        </div>

        {proof === "submitted" && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            Proof submitted. The brand will review your deliverable.
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
          <div className="border-b border-black/6 bg-black/2 px-8 py-6 dark:border-white/6 dark:bg-white/3">
            <p className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
              {d.team_id ? "Team NIL partnership" : "Your NIL partnership"}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-black dark:text-white">{d.title}</h1>
            {d.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-black/55 dark:text-white/45">{d.description}</p>
            )}
          </div>

          <div className="divide-y divide-black/5 dark:divide-white/5">
            <ContractSection label="Parties">
              <ContractRow k="Brand" v={d.brand_display_name ?? "—"} />
              {d.team_display_name && <ContractRow k="Team" v={d.team_display_name} />}
              {d.season && <ContractRow k="Season" v={d.season} />}
              {d.deal_type && (
                <ContractRow k="Category" v={DEAL_CATEGORY_LABELS[d.deal_type] ?? d.deal_type} />
              )}
            </ContractSection>

            <ContractSection label="Term">
              <ContractRow k="From" v={formatDate(d.start_date)} />
              <ContractRow k="Through" v={formatDate(d.end_date)} />
            </ContractSection>

            <ContractSection label="Compensation">
              <ContractRow k="Total value" v={formatCurrency(d.total_value)} />
              <ContractRow k="Payment" v={PAYMENT_TYPE_LABELS[d.payment_type] ?? d.payment_type} />
            </ContractSection>

            <ContractSection label="Deliverables">
              {(participation?.status === "invited" || isOnTeam) && d.team_id && (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  Accept the partnership below to unlock proof submission for these deliverables.
                </p>
              )}
              {deliverables.length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/35">No deliverables listed for this deal.</p>
              ) : (() => {
                // Number by position in the contract, not within the group — grouping is a
                // view, but "deliverable 3" has to mean the same thing to every party.
                const numbered = deliverables.map((del, i) => ({ del, index: i }));
                const notStarted      = numbered.filter((d) => isAwaitingSubmission(d.del.status));
                const pendingApproval = numbered.filter((d) => d.del.status === "submitted");
                const approved        = numbered.filter((d) => d.del.status === "approved");

                function DeliverableItem({ del, index }: { del: typeof deliverables[0]; index: number }) {
                  const freq = normalizeFrequency(del.frequency);
                  const statusInfo = deliverableStatusMeta(del.status);
                  return (
                    <li className="flex gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f7ae0]/10 text-xs font-bold text-[#1f7ae0]">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#1f7ae0] dark:text-[#8ec5ff]">
                            {DELIVERABLE_FREQUENCY_LABELS[freq]}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <span className="font-semibold text-black dark:text-white">{del.title}</span>
                        {del.description && (
                          <p className="mt-0.5 text-black/55 dark:text-white/45">{del.description}</p>
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
                          className="mt-2"
                        />
                        {canSubmitDeliverables && isAwaitingSubmission(del.status) && (
                          <div className="mt-2">
                            <Link
                              href={proofHref(del.id)}
                              className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                                del.status === "rejected"
                                  ? "bg-red-500 hover:bg-red-600"
                                  : "bg-[#1f7ae0] hover:bg-[#1a6bc9]"
                              }`}
                            >
                              {del.status === "rejected" ? "Resubmit proof" : "Submit proof"}
                            </Link>
                          </div>
                        )}
                        {isActive && del.status === "submitted" && (
                          <p className="mt-2 text-xs text-black/40 dark:text-white/35">
                            Awaiting brand review…
                          </p>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Empty groups render nothing at all. A new deal used to open on a
                        scaffold of three headings with italic "None" under two of them,
                        which reads as broken rather than as "nothing to do yet". */}
                    {notStarted.length > 0 && (
                      <div>
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                          Not started
                        </p>
                        <ol className="space-y-4">
                          {notStarted.map(({ del, index }) => (
                            <DeliverableItem key={del.id} del={del} index={index} />
                          ))}
                        </ol>
                      </div>
                    )}

                    {pendingApproval.length > 0 && (
                      <div>
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-black/35 dark:text-white/30">
                          Pending approval
                        </p>
                        <ol className="space-y-4">
                          {pendingApproval.map(({ del, index }) => (
                            <DeliverableItem key={del.id} del={del} index={index} />
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Approved — always rendered, collapsed by default */}
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/35 hover:text-black/55 dark:text-white/30 dark:hover:text-white/50">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="transition-transform group-open:rotate-90"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        Approved ({approved.length})
                      </summary>
                      {approved.length === 0 ? (
                        <p className="mt-3 pl-4 text-xs text-black/30 dark:text-white/25 italic">None yet</p>
                      ) : (
                        <ol className="mt-4 space-y-4 border-l-2 border-emerald-200 pl-4 dark:border-emerald-800/40">
                          {approved.map(({ del, index }) => (
                            <DeliverableItem key={del.id} del={del} index={index} />
                          ))}
                        </ol>
                      )}
                    </details>
                  </div>
                );
              })()}
            </ContractSection>

            {(d.brand_signer_name || d.team_signer_name || d.brand_signed_at || d.team_signed_at) && (
              <ContractSection label="Signatures">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Brand</p>
                    {d.brand_signer_name && (
                      <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.brand_signer_name}</p>
                    )}
                    {d.brand_signed_at && (
                      <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.brand_signed_at)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-black/35 dark:text-white/30">Team</p>
                    {d.team_signer_name && (
                      <p className="mt-1 text-sm font-medium text-black dark:text-white">{d.team_signer_name}</p>
                    )}
                    {d.team_signed_at && (
                      <p className="text-xs text-black/40 dark:text-white/35">{formatDate(d.team_signed_at)}</p>
                    )}
                  </div>
                </div>
              </ContractSection>
            )}
          </div>
        </div>

        {showTeamOptIn && (
          <div className="mt-8">
            <AthleteDealOptIn dealId={id} status={optInStatus} />
          </div>
        )}

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
                  <p className="text-sm text-black/50 dark:text-white/40">Paid so far</p>
                  <p className="text-xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                    {formatCents(d.paid_cents ?? 0)}
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
                        {formatCents(p.net_cents)}
                        <span className="ml-1 text-xs font-normal text-black/40 dark:text-white/35">(net)</span>
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
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">{label}</p>
      {children}
    </div>
  );
}

function ContractRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-0.5 text-sm">
      <span className="w-32 shrink-0 text-black/40 dark:text-white/35">{k}</span>
      <span className="font-medium text-black/80 dark:text-white/70">{v}</span>
    </div>
  );
}
