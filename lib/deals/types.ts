export type DealStatus = "draft" | "pending" | "active" | "completed" | "cancelled";
export type PaymentType = "one_time" | "monthly" | "per_deliverable";
export type DealCategory = "social_media" | "events" | "content_creation" | "mixed";
export type DeliverableStatus = "not_started" | "pending" | "submitted" | "approved" | "rejected";
export type DealPaymentStatus = "pending" | "processing" | "paid" | "failed";
export type DealOverallPaymentStatus = "unpaid" | "partial" | "paid";

/** How often this obligation applies over the deal term. */
export type DeliverableFrequency = "one_time" | "daily" | "weekly" | "monthly" | "season";

export interface DealRow {
  id: string;
  title: string;
  description: string | null;
  brand_id: string;
  team_id: string | null;
  athlete_id: string | null;
  brand_display_name: string | null;
  team_display_name: string | null;
  season: string | null;
  deal_type: DealCategory | null;
  status: DealStatus;
  total_value: number | null;
  currency: string;
  payment_type: PaymentType;
  payment_terms: string | null;
  nil_use_description: string | null;
  exclusivity_clause: string | null;
  requires_opt_in: boolean;
  start_date: string | null;
  end_date: string | null;
  brand_signed_at: string | null;
  team_signed_at: string | null;
  brand_signer_name: string | null;
  team_signer_name: string | null;
  payment_status: DealOverallPaymentStatus;
  paid_cents: number;
  created_at: string;
  updated_at: string;
}

export interface DealPaymentRow {
  id: string;
  partnership_id: string;
  deliverable_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  commission_cents: number;
  net_cents: number;
  status: DealPaymentStatus;
  payment_type: PaymentType;
  installment_number: number | null;
  created_at: string;
  paid_at: string | null;
}

export interface DeliverableRow {
  id: string;
  partnership_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  frequency: DeliverableFrequency;
  status: DeliverableStatus;
  /** Filled when athlete/team submits proof (migration 016). */
  proof_description?: string | null;
  proof_image_urls?: string[] | null;
  submitted_at?: string | null;
  /** Automated pipeline output, keyed by proof object key (migration 019). Parsed by
   *  parseProofAnalysis in lib/deals/proofAnalysis.ts - never read the raw shape. */
  proof_analysis?: unknown;
  proof_review_flag?: "flagged" | "clean" | "pending" | null;
  created_at: string;
}

export const DELIVERABLE_FREQUENCY_LABELS: Record<DeliverableFrequency, string> = {
  one_time: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  season: "Once for the season",
};

/** Short label for inline display, e.g. "Weekly · Instagram post". */
export function deliverableCadenceLabel(frequency: DeliverableFrequency | string | null | undefined): string {
  const f = (frequency ?? "one_time") as DeliverableFrequency;
  return DELIVERABLE_FREQUENCY_LABELS[f] ?? DELIVERABLE_FREQUENCY_LABELS.one_time;
}

/* ── Deliverable status ────────────────────────────────────────────────────────────
 * Migration 017 renamed the initial status 'pending' -> 'not_started', changed the column
 * DEFAULT and backfilled. But there is no CHECK constraint (005_partnerships.sql) and both
 * insert paths kept writing the old literal, so live data holds BOTH values.
 *
 * Every predicate below therefore accepts both. That is the load-bearing property: it
 * decouples the code deploy from the SQL apply, is correct on mixed rows, and survives a
 * rollback in either direction. Do not "tidy" these into checking only 'not_started'.
 */

/** Collapses the legacy literal, and anything unrecognised, onto the current vocabulary. */
export function normalizeDeliverableStatus(s: string | null | undefined): DeliverableStatus {
  if (s === "submitted" || s === "approved" || s === "rejected") return s;
  return "not_started"; // covers 'not_started', the legacy 'pending', null and junk
}

/**
 * The statuses from which proof may be attached. Exported as an array so it can also be
 * passed to a Postgres `.in()` filter — see the submit route, which uses it to make the
 * status transition an atomic claim rather than a read-modify-write.
 */
export const AWAITING_SUBMISSION_STATUSES = ["not_started", "pending", "rejected"] as const;

/** May the athlete/team attach proof? True before a submission, and after a rejection. */
export function isAwaitingSubmission(s: string | null | undefined): boolean {
  return (AWAITING_SUBMISSION_STATUSES as readonly string[]).includes(s ?? "");
}

/**
 * Never submitted. Deliberately EXCLUDES 'rejected' — several surfaces count rejected
 * separately as "needs your attention" rather than folding it into "not started".
 */
export function isNotStarted(s: string | null | undefined): boolean {
  return s === "not_started" || s === "pending";
}

export const DELIVERABLE_STATUS_META: Record<DeliverableStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400" },
  pending:     { label: "Not started", cls: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400" },
  submitted:   { label: "Submitted",   cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400" },
  approved:    { label: "Approved",    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400" },
  rejected:    { label: "Rejected",    cls: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400" },
};

/** Always use this rather than indexing DELIVERABLE_STATUS_META — a raw lookup can miss. */
export function deliverableStatusMeta(s: string | null | undefined): { label: string; cls: string } {
  return DELIVERABLE_STATUS_META[normalizeDeliverableStatus(s)];
}

export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  draft:     "bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-white/50",
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  draft:     "Draft",
  pending:   "Pending review",
  active:    "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DEAL_CATEGORY_LABELS: Record<string, string> = {
  social_media:     "Social Media",
  events:           "Events",
  content_creation: "Content Creation",
  mixed:            "Full Sponsorship",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  one_time:        "One-time payment",
  monthly:         "Monthly installments",
  per_deliverable: "Per deliverable",
};

/**
 * Money, shown to the precision it is actually charged at.
 *
 * `maximumFractionDigits: 0` used to round every amount to whole dollars while
 * installmentAmountCents below deliberately produces cents — so a $1,000 deal over three
 * months rendered "Pay $333" on a button that charged $333.33. Cents are shown only when
 * they exist, so round figures stay readable as "$25,000".
 *
 * The null check is `== null`, not falsy: a real $0 must render "$0", not the "—" that
 * means "no value". A deal awaiting its first payment is not a deal of unknown value.
 */
export function formatCurrency(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const hasCents = Math.round(v * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(v);
}

/** Cents-native. Prefer over formatCurrency(x / 100) so the divide lives in one place. */
export function formatCents(cents: number | null | undefined): string {
  return cents == null || Number.isNaN(cents) ? "—" : formatCurrency(cents / 100);
}

/** Number of monthly installments for a deal based on its start/end dates. */
export function computeNumMonths(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44)));
}

/** Amount in cents for a given installment (last installment absorbs rounding remainder). */
export function installmentAmountCents(
  totalValueDollars: number,
  numMonths: number,
  installmentNumber: number
): number {
  const totalCents = Math.round(totalValueDollars * 100);
  const base = Math.floor(totalCents / numMonths);
  const remainder = totalCents - base * numMonths;
  return installmentNumber === numMonths ? base + remainder : base;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
