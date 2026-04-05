import type { DeliverableFrequency } from "@/lib/deals/types";
import { DEAL_CATEGORY_LABELS } from "@/lib/deals/types";

export const SECTIONS = ["Partnership", "Compensation", "Timeline & NIL", "Deliverables", "Review"] as const;

export const SEASONS = [
  "Fall 2025",
  "Spring 2026",
  "Fall 2026",
  "Spring 2027",
  "Year-round 2026",
  "Year-round 2027",
];

export const DEAL_CATEGORIES = Object.entries(DEAL_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

export const PAYMENT_OPTIONS = [
  { value: "one_time", label: "One-time payment", desc: "Full amount paid at signing" },
  { value: "monthly", label: "Monthly installments", desc: "Equal payments across the season" },
  { value: "per_deliverable", label: "Per deliverable", desc: "Payment upon completion of each item" },
] as const;

export const DELIVERABLE_PRESETS: string[] = [
  "Instagram post",
  "Instagram story",
  "TikTok post",
  "Event appearance",
  "Brand photo shoot",
  "Custom",
];

export const FREQUENCY_OPTIONS: {
  value: DeliverableFrequency;
  label: string;
  hint: string;
}[] = [
  {
    value: "weekly",
    label: "Weekly",
    hint: "Repeats every week for the term (e.g. weekly Instagram post).",
  },
  {
    value: "daily",
    label: "Daily",
    hint: "Repeats every day during the term.",
  },
  {
    value: "monthly",
    label: "Monthly",
    hint: "Repeats each month of the term.",
  },
  {
    value: "season",
    label: "Once for the season",
    hint: "One obligation covering the full season (no fixed cadence).",
  },
  {
    value: "one_time",
    label: "One-time",
    hint: "A single deliverable by an optional due date.",
  },
];

export const inputCls =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black shadow-sm outline-none focus:border-[#1f7ae0] focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/10 dark:bg-[#1a2035] dark:text-white dark:placeholder:text-white/30 dark:focus:border-[#3d8ef0]";

export const labelCls = "block text-sm font-semibold text-black/70 dark:text-white/60";

export const hintCls = "mt-0.5 text-xs text-black/40 dark:text-white/30";
