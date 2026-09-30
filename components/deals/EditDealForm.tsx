"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/ui/useSubmitGuard";
import { DELIVERABLE_FREQUENCY_LABELS, type DeliverableFrequency, formatDate } from "@/lib/deals/types";
import {
  SEASONS,
  DEAL_CATEGORIES,
  PAYMENT_OPTIONS,
  DELIVERABLE_PRESETS,
  FREQUENCY_OPTIONS,
  inputCls,
  labelCls,
  hintCls,
} from "@/lib/deals/dealFormUi";

interface Deliverable {
  uid: string;
  title: string;
  description: string;
  dueDate: string;
  frequency: DeliverableFrequency;
}

export interface EditDealInitial {
  title: string;
  description: string;
  season: string;
  dealType: string;
  totalValue: string;
  paymentType: "one_time" | "monthly" | "per_deliverable";
  paymentTerms: string;
  startDate: string;
  endDate: string;
  nilUseDescription: string;
  exclusivityClause: string;
  requiresOptIn: boolean;
}

interface Props {
  dealId: string;
  teamDisplayName: string;
  initial: EditDealInitial;
  initialDeliverables: {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    frequency: string | null;
  }[];
}

function normalizeFrequency(f: string | null | undefined): DeliverableFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "season" || f === "one_time") return f;
  return "one_time";
}

export default function EditDealForm({ dealId, teamDisplayName, initial, initialDeliverables }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const guard = useSubmitGuard();
  const busy = guard.busy;

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [season, setSeason] = useState(initial.season);
  const [dealType, setDealType] = useState(initial.dealType);
  const [totalValue, setTotalValue] = useState(initial.totalValue);
  const [paymentType, setPaymentType] = useState(initial.paymentType);
  const [paymentTerms, setPaymentTerms] = useState(initial.paymentTerms);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [nilUseDescription, setNilUseDescription] = useState(initial.nilUseDescription);
  const [exclusivityClause, setExclusivityClause] = useState(initial.exclusivityClause);
  const [requiresOptIn, setRequiresOptIn] = useState(initial.requiresOptIn);
  const [brandSignerName, setBrandSignerName] = useState("");

  const [deliverables, setDeliverables] = useState<Deliverable[]>(() =>
    initialDeliverables.map((d) => ({
      uid: d.id,
      title: d.title,
      description: d.description ?? "",
      dueDate: d.due_date ?? "",
      frequency: normalizeFrequency(d.frequency),
    }))
  );

  const [delPreset, setDelPreset] = useState<string>(DELIVERABLE_PRESETS[0]);
  const [delCustomTitle, setDelCustomTitle] = useState("");
  const [delDesc, setDelDesc] = useState("");
  const [delDueDate, setDelDueDate] = useState("");
  const [delFrequency, setDelFrequency] = useState<DeliverableFrequency>("weekly");

  const seasonChoices = season && !SEASONS.includes(season) ? [season, ...SEASONS] : SEASONS;

  function validate(): string | null {
    if (!title.trim()) return "A deal title is required.";
    if (!season) return "Please select a season.";
    if (!dealType) return "Please select a deal category.";
    const tv = parseFloat(totalValue);
    if (!totalValue || isNaN(tv) || tv <= 0) return "Please enter a valid total value.";
    if (!startDate) return "Start date is required.";
    if (!endDate) return "End date is required.";
    if (startDate >= endDate) return "End date must be after start date.";
    if (!nilUseDescription.trim() || nilUseDescription.trim().length < 15)
      return "Please describe how the NIL will be used (at least a sentence).";
    if (deliverables.length === 0) return "Add at least one deliverable.";
    if (brandSignerName.trim().length < 2)
      return "Type your full name to sign the updated proposal.";
    return null;
  }

  function addDeliverable() {
    const effectiveTitle = delPreset === "Custom" ? delCustomTitle.trim() : delPreset;
    if (!effectiveTitle) {
      setError("Enter a title for the deliverable.");
      return;
    }
    setError(null);
    setDeliverables((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        title: effectiveTitle,
        description: delDesc,
        dueDate: delDueDate,
        frequency: delFrequency,
      },
    ]);
    setDelPreset(DELIVERABLE_PRESETS[0]);
    setDelCustomTitle("");
    setDelDesc("");
    setDelDueDate("");
    setDelFrequency("weekly");
  }

  function removeDeliverable(uid: string) {
    setDeliverables((prev) => prev.filter((d) => d.uid !== uid));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    if (!guard.begin()) return;
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          season,
          dealType,
          totalValue: parseFloat(totalValue),
          paymentType,
          paymentTerms: paymentTerms.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          nilUseDescription: nilUseDescription.trim(),
          exclusivityClause: exclusivityClause.trim() || undefined,
          requiresOptIn,
          brandSignerName: brandSignerName.trim(),
          deliverables: deliverables.map((d) => ({
            title: d.title,
            description: d.description || undefined,
            dueDate: d.dueDate || undefined,
            frequency: d.frequency,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        guard.release();
        return;
      }
      // Terminal: this handler deletes and reinserts the deal's deliverables, so a second
      // run during the RSC transition would redo that whole swap.
      guard.finish();
      router.push(`/dashboard/brand-dashboard/deals/${dealId}?updated=1`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      guard.release();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-10">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="space-y-5">
        <h2 className="text-lg font-bold text-black dark:text-white">Partnership</h2>
        <div>
          <label className={labelCls}>Team</label>
          <div className="mt-1.5 rounded-xl border border-black/8 bg-black/3 px-4 py-3 text-sm font-semibold text-black dark:border-white/8 dark:bg-white/5 dark:text-white">
            {teamDisplayName}
          </div>
          <p className={hintCls}>The team cannot be changed. To propose to a different team, create a new deal.</p>
        </div>
        <div>
          <label className={labelCls}>Deal title</label>
          <input
            className={`mt-1.5 ${inputCls}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>
        <div>
          <label className={labelCls}>
            Description <span className="font-normal text-black/40 dark:text-white/30">(optional)</span>
          </label>
          <textarea
            className={`mt-1.5 resize-none ${inputCls}`}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={400}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Season</label>
            <select className={`mt-1.5 ${inputCls}`} value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="">Select…</option>
              {seasonChoices.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Deal category</label>
            <select className={`mt-1.5 ${inputCls}`} value={dealType} onChange={(e) => setDealType(e.target.value)}>
              <option value="">Select…</option>
              {DEAL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-bold text-black dark:text-white">Compensation</h2>
        <div>
          <label className={labelCls}>Total deal value (USD)</label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/30">
              $
            </span>
            <input
              className={`pl-7 ${inputCls}`}
              type="number"
              min="0"
              step="500"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Payment structure</label>
          <div className="mt-2 space-y-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  paymentType === opt.value
                    ? "border-[#1f7ae0] bg-[#1f7ae0]/5 dark:border-[#3d8ef0] dark:bg-[#1f7ae0]/10"
                    : "border-black/8 bg-white dark:border-white/8 dark:bg-[#1a2035]"
                }`}
              >
                <input
                  type="radio"
                  name="paymentType"
                  value={opt.value}
                  checked={paymentType === opt.value}
                  onChange={() => setPaymentType(opt.value)}
                  className="mt-0.5 accent-[#1f7ae0]"
                />
                <div>
                  <p className="text-sm font-semibold text-black dark:text-white">{opt.label}</p>
                  <p className="text-xs text-black/45 dark:text-white/35">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>
            Payment terms <span className="font-normal text-black/40 dark:text-white/30">(optional)</span>
          </label>
          <textarea
            className={`mt-1.5 resize-none ${inputCls}`}
            rows={2}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            maxLength={300}
          />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-bold text-black dark:text-white">Timeline &amp; NIL</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Start date</label>
            <input type="date" className={`mt-1.5 ${inputCls}`} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>End date</label>
            <input type="date" className={`mt-1.5 ${inputCls}`} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>NIL use description</label>
          <textarea
            className={`mt-1.5 resize-none ${inputCls}`}
            rows={4}
            value={nilUseDescription}
            onChange={(e) => setNilUseDescription(e.target.value)}
            maxLength={800}
          />
        </div>
        <div>
          <label className={labelCls}>
            Exclusivity clause <span className="font-normal text-black/40 dark:text-white/30">(optional)</span>
          </label>
          <textarea
            className={`mt-1.5 resize-none ${inputCls}`}
            rows={3}
            value={exclusivityClause}
            onChange={(e) => setExclusivityClause(e.target.value)}
            maxLength={600}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/8 bg-white p-4 dark:border-white/8 dark:bg-[#1a2035]">
          <input
            type="checkbox"
            checked={requiresOptIn}
            onChange={(e) => setRequiresOptIn(e.target.checked)}
            className="h-4 w-4 accent-[#1f7ae0]"
          />
          <div>
            <p className="text-sm font-semibold text-black dark:text-white">Require per-athlete opt-in</p>
            <p className="text-xs text-black/45 dark:text-white/35">
              Each athlete on the roster must individually accept before being included in the deal.
            </p>
          </div>
        </label>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-bold text-black dark:text-white">Deliverables</h2>
        {deliverables.length > 0 && (
          <div className="space-y-2">
            {deliverables.map((d, i) => (
              <div
                key={d.uid}
                className="flex items-start gap-3 rounded-xl border border-black/6 bg-white px-4 py-3 dark:border-white/6 dark:bg-[#1a2035]"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f7ae0]/10 text-xs font-bold text-[#1f7ae0]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-black dark:text-white">
                    <span className="mr-2 rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black/55 dark:bg-white/10 dark:text-white/50">
                      {DELIVERABLE_FREQUENCY_LABELS[d.frequency]}
                    </span>
                    {d.title}
                  </p>
                  {d.description && <p className="mt-0.5 text-xs text-black/50 dark:text-white/40">{d.description}</p>}
                  {d.dueDate && (
                    <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                      {d.frequency === "one_time" ? "Due " : "First / milestone: "}
                      {formatDate(d.dueDate)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeDeliverable(d.uid)}
                  className="text-xs text-black/30 hover:text-red-500 dark:text-white/25 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-4 dark:border-white/12 dark:bg-[#1a2035]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/35">
            Add deliverable
          </p>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={`mt-1.5 ${inputCls}`} value={delPreset} onChange={(e) => setDelPreset(e.target.value)}>
                {DELIVERABLE_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {delPreset === "Custom" && (
              <div>
                <label className={labelCls}>Custom title</label>
                <input
                  className={`mt-1.5 ${inputCls}`}
                  value={delCustomTitle}
                  onChange={(e) => setDelCustomTitle(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>How often</label>
              <select
                className={`mt-1.5 ${inputCls}`}
                value={delFrequency}
                onChange={(e) => setDelFrequency(e.target.value as DeliverableFrequency)}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Description <span className="font-normal text-black/40 dark:text-white/30">(optional)</span>
              </label>
              <input className={`mt-1.5 ${inputCls}`} value={delDesc} onChange={(e) => setDelDesc(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date (optional)</label>
              <input type="date" className={`mt-1.5 ${inputCls}`} value={delDueDate} onChange={(e) => setDelDueDate(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={addDeliverable}
              className="rounded-xl bg-black/5 px-5 py-2.5 text-sm font-semibold text-black hover:bg-black/8 dark:bg-white/6 dark:text-white dark:hover:bg-white/10"
            >
              + Add
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-black dark:text-white">Sign updated proposal</h2>
        <p className="text-sm text-black/50 dark:text-white/40">
          By typing your name, you confirm the revised terms are accurate. The team will see this updated version while the
          deal is still under review.
        </p>
        <label className={labelCls}>
          Full name
          <input
            className={`mt-1.5 ${inputCls}`}
            placeholder="e.g. Alex Rivera"
            value={brandSignerName}
            onChange={(e) => setBrandSignerName(e.target.value)}
            autoComplete="name"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/8 pt-8 dark:border-white/8">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/brand-dashboard/deals/${dealId}`)}
          className="rounded-xl border border-black/10 px-6 py-3 text-sm font-semibold text-black/70 hover:bg-black/3 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
