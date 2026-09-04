import Link from "next/link";
import MagicBubbleShell from "@/components/MagicBubbleShell";

/**
 * Shared primitives for the three dashboard Overview pages.
 *
 * These were previously copy-pasted into each of athlete/brand/team page.tsx, which is how
 * the three drifted apart. Keep role-specific wording in the pages; keep shape here.
 */

export const dealTypeLabel: Record<string, string> = {
  social_media: "Social Media",
  in_person: "In-Person",
  content_creation: "Content Creation",
  events: "Events",
  mixed: "Full Sponsorship",
};

export const statusColor: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400",
  active:    "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
  submitted: "bg-purple-50 text-purple-700 dark:bg-purple-900/25 dark:text-purple-400",
  approved:  "bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-400",
  rejected:  "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
};

export function formatCurrency(v: number | null | undefined) {
  if (!v) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The Overview shell. Locks the page to one viewport on lg+ so nothing below the fold gets
 * lost; below lg the main area scrolls normally, because four stat cards plus two lists
 * genuinely cannot fit on a phone.
 */
export function OverviewMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 md:px-10 lg:overflow-hidden">
      {children}
    </main>
  );
}

export function OverviewHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1f7ae0]">{eyebrow}</p>
        <h1 className="truncate text-2xl font-black tracking-tight text-black dark:text-white">{title}</h1>
        <p className="truncate text-xs text-black/45 dark:text-white/40">{meta}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 rounded-xl bg-[#1f7ae0] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a6bc9]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

/** `bar` (0-100) renders a progress track under the value — used for roster and profile completion. */
export function StatCard({
  label,
  value,
  sub,
  tone,
  bar,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "accent" | "warn";
  bar?: number;
}) {
  const valueColor =
    tone === "accent" ? "text-[#1f7ae0]" : tone === "warn" ? "text-amber-500" : "text-black dark:text-white";
  return (
    <MagicBubbleShell className="rounded-2xl border border-black/6 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none">
      <p className="truncate text-[11px] font-medium text-black/40 dark:text-white/35">{label}</p>
      <p className={`mt-0.5 text-2xl font-black leading-tight tracking-tight ${valueColor}`}>{value}</p>
      {bar === undefined ? (
        <p className="truncate text-[11px] text-black/35 dark:text-white/30">{sub}</p>
      ) : (
        <>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
            <div className="h-full rounded-full bg-[#1f7ae0] transition-all" style={{ width: `${bar}%` }} />
          </div>
          <p className="mt-1 truncate text-[11px] text-black/35 dark:text-white/30">{sub}</p>
        </>
      )}
    </MagicBubbleShell>
  );
}

/**
 * The panels absorb whatever height is left over, so the layout reaches the fold instead of
 * leaving a slab of empty background under a short list. Their bodies scroll internally
 * once the content exceeds that height, which is what keeps the page itself from growing.
 */
export function PanelRow({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">{children}</div>;
}

export function Panel({
  title,
  action,
  wide,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <MagicBubbleShell
      className={`flex max-h-full min-h-0 flex-col rounded-2xl border border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b27] dark:shadow-none ${
        wide ? "lg:col-span-2" : "lg:col-span-1"
      }`}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-black/40 dark:text-white/35">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-semibold text-[#1f7ae0] transition hover:underline"
          >
            {action.label} →
          </Link>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-4">{children}</div>
    </MagicBubbleShell>
  );
}

/**
 * One row in a panel list. Serves both deals and deliverables.
 *
 * `progress` is the deliverable completion for a deal. It is the thing that makes the row
 * worth more than a title: "active" alone never says whether the work is done.
 */
export function ListRow({
  href,
  title,
  meta,
  value,
  pill,
  progress,
}: {
  href: string;
  title: string;
  meta?: string;
  value?: string | null;
  pill?: { label: string; status: string };
  progress?: { done: number; total: number };
}) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const complete = progress ? progress.total > 0 && progress.done === progress.total : false;
  return (
    <Link
      href={href}
      className="flex min-h-[66px] max-h-[108px] flex-1 items-center gap-3 rounded-xl border border-black/5 bg-[#f9fafb] px-3.5 py-2.5 transition-colors hover:border-black/10 hover:bg-black/[0.02] dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.07]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-black dark:text-white">{title}</p>
        {meta && <p className="truncate text-[11px] text-black/40 dark:text-white/35">{meta}</p>}
        {progress && progress.total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-black/[0.12] dark:bg-white/15">
              <div
                className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-[#1f7ae0]"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-black/40 dark:text-white/35">
              {progress.done}/{progress.total} deliverables approved
            </span>
          </div>
        )}
      </div>
      {value && (
        <span className="shrink-0 text-sm font-semibold text-black dark:text-white">{value}</span>
      )}
      {pill && (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            statusColor[pill.status] ?? ""
          }`}
        >
          {pill.label}
        </span>
      )}
    </Link>
  );
}

/**
 * Rolls deliverable rows up per partnership for ListRow's `progress`. All three dashboards
 * need the same tally, so it lives here rather than being rewritten three ways.
 */
export function tallyDeliverables(
  rows: { partnership_id: string; status: string }[]
): Map<string, { done: number; total: number }> {
  const m = new Map<string, { done: number; total: number }>();
  for (const r of rows) {
    const e = m.get(r.partnership_id) ?? { done: 0, total: 0 };
    e.total += 1;
    if (r.status === "approved") e.done += 1;
    m.set(r.partnership_id, e);
  }
  return m;
}

export function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-6 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="text-sm font-medium text-black/50 dark:text-white/45">{text}</p>
      {sub && <p className="mt-1 max-w-[24ch] text-xs text-black/30 dark:text-white/25">{sub}</p>}
    </div>
  );
}

export function LoadError({ title, message }: { title: string; message: string }) {
  return (
    <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-red-700 dark:text-red-400">{message}</p>
    </div>
  );
}
