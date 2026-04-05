export type DealStatus = "draft" | "pending" | "active" | "completed" | "cancelled";
export type PaymentType = "one_time" | "monthly" | "per_deliverable";
export type DealCategory = "social_media" | "events" | "content_creation" | "mixed";
export type DeliverableStatus = "pending" | "submitted" | "approved" | "rejected";

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
  created_at: string;
  updated_at: string;
}

export interface DeliverableRow {
  id: string;
  partnership_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  frequency: DeliverableFrequency;
  status: DeliverableStatus;
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

export function formatCurrency(v: number | null | undefined): string {
  if (!v) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
