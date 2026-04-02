"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEAL_CATEGORY_LABELS,
  PAYMENT_TYPE_LABELS,
  DELIVERABLE_FREQUENCY_LABELS,
  type DeliverableFrequency,
  formatCurrency,
  formatDate,
} from "@/lib/deals/types";

const SECTIONS = ["Partnership", "Compensation", "Timeline & NIL", "Deliverables", "Review"];

const SEASONS = [
  "Fall 2025",
  "Spring 2026",
  "Fall 2026",
  "Spring 2027",
  "Year-round 2026",
  "Year-round 2027",
];

const DEAL_CATEGORIES = Object.entries(DEAL_CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }));

const PAYMENT_OPTIONS = [
  { value: "one_time", label: "One-time payment", desc: "Full amount paid at signing" },
  { value: "monthly", label: "Monthly installments", desc: "Equal payments across the season" },
  { value: "per_deliverable", label: "Per deliverable", desc: "Payment upon completion of each item" },
];

const DELIVERABLE_PRESETS = [
  "Instagram post",
  "Instagram story",
  "TikTok post",
  "Event appearance",
  "Brand photo shoot",
  "Custom",
];

const FREQUENCY_OPTIONS: {
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

interface AvailableTeam {
  id: string;
  school: string;
  team_name: string;
  sport: string;
  division: string | null;
  manager_first_name: string;
  manager_last_name: string;
}

interface Deliverable {
  uid: string;
  title: string;
  description: string;
  dueDate: string;
  frequency: DeliverableFrequency;
}

interface Props {
  preselectedTeamId?: string;
  preselectedTeamName?: string;
}

const inputCls =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black shadow-sm outline-none focus:border-[#1f7ae0] focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/10 dark:bg-[#1a2035] dark:text-white dark:placeholder:text-white/30 dark:focus:border-[#3d8ef0]";

const labelCls = "block text-sm font-semibold text-black/70 dark:text-white/60";
const hintCls = "mt-0.5 text-xs text-black/40 dark:text-white/30";

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-black/40 dark:text-white/35">
        <span>Step {step} of {total}</span>
        <span>{SECTIONS[step - 1]}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/8">
        <div
          className="h-full rounded-full bg-[#1f7ae0] transition-all duration-300"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function ProposeDealForm({ preselectedTeamId, preselectedTeamName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<AvailableTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(!preselectedTeamId);

  // Step 1
  const [teamId, setTeamId] = useState(preselectedTeamId ?? "");
  const [teamName, setTeamName] = useState(preselectedTeamName ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState("");
  const [dealType, setDealType] = useState("");

  // Step 2
  const [totalValue, setTotalValue] = useState("");
  const [paymentType, setPaymentType] = useState<"one_time" | "monthly" | "per_deliverable">("one_time");
  const [paymentTerms, setPaymentTerms] = useState("Payment within 5 business days of signing.");

  // Step 3
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nilUseDescription, setNilUseDescription] = useState("");
  const [exclusivityClause, setExclusivityClause] = useState("");
  const [requiresOptIn, setRequiresOptIn] = useState(false);

  // Step 4
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [delPreset, setDelPreset] = useState(DELIVERABLE_PRESETS[0]);
  const [delCustomTitle, setDelCustomTitle] = useState("");
  const [delDesc, setDelDesc] = useState("");
  const [delDueDate, setDelDueDate] = useState("");
  const [delFrequency, setDelFrequency] = useState<DeliverableFrequency>("weekly");

  useEffect(() => {
    if (preselectedTeamId) return;
    fetch("/api/deals/available-teams")
      .then((r) => r.json())
      .then((d) => setAvailableTeams(d.teams ?? []))
      .catch(() => setAvailableTeams([]))
      .finally(() => setTeamsLoading(false));
  }, [preselectedTeamId]);

  function validate(s: number): string | null {
    if (s === 1) {
      if (!teamId) return "Please select a team.";
      if (!title.trim()) return "A deal title is required.";
      if (!season) return "Please select a season.";
      if (!dealType) return "Please select a deal category.";
    }
    if (s === 2) {
      const v = parseFloat(totalValue);
      if (!totalValue || isNaN(v) || v <= 0) return "Please enter a valid total value.";
    }
    if (s === 3) {
      if (!startDate) return "Start date is required.";
      if (!endDate) return "End date is required.";
      if (startDate >= endDate) return "End date must be after start date.";
      if (!nilUseDescription.trim() || nilUseDescription.trim().length < 15)
        return "Please describe how the NIL will be used (at least a sentence).";
    }
    if (s === 4) {
      if (deliverables.length === 0) return "Add at least one deliverable before continuing.";
    }
    return null;
  }

  function handleNext() {
    const err = validate(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError(null);
    setStep((s) => s - 1);
  }

  function addDeliverable() {
    const effectiveTitle = delPreset === "Custom" ? delCustomTitle.trim() : delPreset;
    if (!effectiveTitle) { setError("Enter a title for the deliverable."); return; }
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

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
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
        return;
      }
      router.push("/dashboard/brand-dashboard/deals?sent=1");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ProgressBar step={step} total={SECTIONS.length} />

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ─── Step 1: Partnership ───────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Team</label>
            {preselectedTeamId ? (
              <div className="mt-1.5 rounded-xl border border-black/8 bg-black/3 px-4 py-3 text-sm font-semibold text-black dark:border-white/8 dark:bg-white/5 dark:text-white">
                {preselectedTeamName}
              </div>
            ) : teamsLoading ? (
              <div className="mt-1.5 rounded-xl border border-black/8 bg-white px-4 py-3 text-sm text-black/40 dark:border-white/8 dark:bg-[#1a2035] dark:text-white/40">
                Loading available teams…
              </div>
            ) : availableTeams.length === 0 ? (
              <p className="mt-1.5 text-sm text-black/50 dark:text-white/40">
                No teams available yet. First express mutual interest in a team via Discover.
              </p>
            ) : (
              <select
                className={`mt-1.5 ${inputCls}`}
                value={teamId}
                onChange={(e) => {
                  const t = availableTeams.find((x) => x.id === e.target.value);
                  setTeamId(e.target.value);
                  setTeamName(t ? `${t.school} ${t.team_name}` : "");
                }}
              >
                <option value="">Select a team…</option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.school} {t.team_name} {t.sport ? `— ${t.sport}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={labelCls}>Deal title</label>
            <p className={hintCls}>Short, descriptive name for the partnership.</p>
            <input
              className={`mt-1.5 ${inputCls}`}
              placeholder="e.g. Fall 2026 Apparel Partnership"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <label className={labelCls}>Description <span className="font-normal text-black/40 dark:text-white/30">(optional)</span></label>
            <textarea
              className={`mt-1.5 resize-none ${inputCls}`}
              rows={3}
              placeholder="Brief summary of the partnership and its goals."
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
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Deal category</label>
              <select className={`mt-1.5 ${inputCls}`} value={dealType} onChange={(e) => setDealType(e.target.value)}>
                <option value="">Select…</option>
                {DEAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 2: Compensation ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Total deal value (USD)</label>
            <p className={hintCls}>Total compensation for the team for the full season.</p>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/30">$</span>
              <input
                className={`pl-7 ${inputCls}`}
                type="number"
                min="0"
                step="500"
                placeholder="10000"
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
                    onChange={() => setPaymentType(opt.value as typeof paymentType)}
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
            <label className={labelCls}>Payment terms <span className="font-normal text-black/40 dark:text-white/30">(optional)</span></label>
            <p className={hintCls}>When and how the payment will be made.</p>
            <textarea
              className={`mt-1.5 resize-none ${inputCls}`}
              rows={2}
              placeholder="e.g. Payment within 5 business days of this agreement being signed."
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>
      )}

      {/* ─── Step 3: Timeline & NIL ───────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
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
            <p className={hintCls}>
              Describe how you will use athletes&apos; names, images, and likenesses — e.g. social media posts, product packaging, ads.
            </p>
            <textarea
              className={`mt-1.5 resize-none ${inputCls}`}
              rows={4}
              placeholder="e.g. Brand may use athlete names, photographs, and video likeness in social media posts and in-store promotional materials to promote its products in the United States."
              value={nilUseDescription}
              onChange={(e) => setNilUseDescription(e.target.value)}
              maxLength={800}
            />
          </div>

          <div>
            <label className={labelCls}>Exclusivity clause <span className="font-normal text-black/40 dark:text-white/30">(optional)</span></label>
            <p className={hintCls}>List any direct competitors athletes must avoid endorsing during the term.</p>
            <textarea
              className={`mt-1.5 resize-none ${inputCls}`}
              rows={3}
              placeholder="e.g. Athletes may not promote direct competitors including Brand X, Brand Y, or Brand Z during the term of this agreement."
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
        </div>
      )}

      {/* ─── Step 4: Deliverables ─────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">
          <p className="text-sm text-black/55 dark:text-white/45">
            List obligations for the team. Choose how often each applies: e.g. weekly Instagram posts, a one-time event, or a single season-long commitment.
          </p>

          {deliverables.length > 0 && (
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={d.uid} className="flex items-start gap-3 rounded-xl border border-black/6 bg-white px-4 py-3 dark:border-white/6 dark:bg-[#1a2035]">
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
                  {DELIVERABLE_PRESETS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              {delPreset === "Custom" && (
                <div>
                  <label className={labelCls}>Custom title</label>
                  <input
                    className={`mt-1.5 ${inputCls}`}
                    placeholder="e.g. Autograph signing session"
                    value={delCustomTitle}
                    onChange={(e) => setDelCustomTitle(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>How often</label>
                <p className={hintCls}>Cadence across the deal term.</p>
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
                <p className="mt-1.5 text-xs text-black/45 dark:text-white/35">
                  {FREQUENCY_OPTIONS.find((o) => o.value === delFrequency)?.hint}
                </p>
              </div>
              <div>
                <label className={labelCls}>Description <span className="font-normal text-black/40 dark:text-white/30">(optional)</span></label>
                <input
                  className={`mt-1.5 ${inputCls}`}
                  placeholder="e.g. Original content featuring the product, tagging our account"
                  value={delDesc}
                  onChange={(e) => setDelDesc(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {delFrequency === "one_time" ? "Due date" : "Date (optional)"}{" "}
                  <span className="font-normal text-black/40 dark:text-white/30">(optional)</span>
                </label>
                <p className={hintCls}>
                  {delFrequency === "one_time"
                    ? "When this single deliverable must be completed."
                    : "Optional: first due date or key milestone; obligation repeats at the cadence above through the term."}
                </p>
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
        </div>
      )}

      {/* ─── Step 5: Review & Send ────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-5">
          <p className="text-sm text-black/55 dark:text-white/45">
            Review the terms below. Once you send this, the team manager will receive a notification to review and accept or decline the deal.
          </p>

          <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/8 dark:bg-[#161b27]">
            {/* Header */}
            <div className="border-b border-black/6 bg-black/2 px-6 py-4 dark:border-white/6 dark:bg-white/3">
              <p className="text-xs font-bold uppercase tracking-widest text-black/40 dark:text-white/35">
                NIL Partnership Agreement — Draft
              </p>
              <p className="mt-1 text-lg font-black text-black dark:text-white">{title}</p>
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5">
              <Section label="Parties">
                <Row k="Brand" v={teamName ? "You" : "Your brand"} />
                <Row k="Team" v={teamName || "—"} />
              </Section>

              <Section label="Term">
                <Row k="Season" v={season} />
                <Row k="Start" v={formatDate(startDate)} />
                <Row k="End" v={formatDate(endDate)} />
              </Section>

              <Section label="Compensation">
                <Row k="Total value" v={formatCurrency(parseFloat(totalValue) || null)} />
                <Row k="Payment structure" v={PAYMENT_TYPE_LABELS[paymentType]} />
                {paymentTerms && <Row k="Payment terms" v={paymentTerms} />}
              </Section>

              <Section label="NIL use">
                <p className="text-sm leading-relaxed text-black/70 dark:text-white/60">{nilUseDescription}</p>
              </Section>

              {deliverables.length > 0 && (
                <Section label={`Deliverables (${deliverables.length})`}>
                  <ol className="space-y-1.5">
                    {deliverables.map((d, i) => (
                      <li key={d.uid} className="flex gap-2 text-sm text-black/70 dark:text-white/60">
                        <span className="font-semibold text-black dark:text-white">{i + 1}.</span>
                        <span>
                          <span className="font-medium text-[#1f7ae0] dark:text-[#8ec5ff]">
                            [{DELIVERABLE_FREQUENCY_LABELS[d.frequency]}]
                          </span>{" "}
                          {d.title}
                          {d.description && ` — ${d.description}`}
                          {d.dueDate && (
                            <span className="ml-1 text-black/40 dark:text-white/35">
                              (
                              {d.frequency === "one_time" ? "due " : "milestone "}
                              {formatDate(d.dueDate)})
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {exclusivityClause && (
                <Section label="Exclusivity">
                  <p className="text-sm leading-relaxed text-black/70 dark:text-white/60">{exclusivityClause}</p>
                </Section>
              )}

              <Section label="Standard terms">
                <ul className="space-y-1 text-sm text-black/55 dark:text-white/45">
                  <li>• Non-disparagement clause applies during the full term.</li>
                  <li>• Athletes are independent contractors, not employees.</li>
                  <li>• Either party may terminate with 14 days written notice.</li>
                  <li>• Force majeure: obligations suspended in extraordinary events.</li>
                  <li>• All terms are confidential.</li>
                  {requiresOptIn && <li>• Requires individual opt-in from each participating athlete.</li>}
                </ul>
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* ─── Navigation ───────────────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/70 hover:bg-black/3 dark:border-white/10 dark:bg-transparent dark:text-white/60 dark:hover:bg-white/5"
          >
            ← Back
          </button>
        ) : (
          <div />
        )}

        {step < SECTIONS.length ? (
          <button
            type="button"
            onClick={handleNext}
            className="rounded-xl bg-[#1f7ae0] px-8 py-3 text-sm font-bold text-white hover:bg-[#1a6cc5] active:scale-95"
          >
            Continue →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 active:scale-95"
          >
            {busy ? "Sending…" : "Send to team manager →"}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/30">{label}</p>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="w-36 shrink-0 text-black/40 dark:text-white/35">{k}</span>
      <span className="text-black/80 dark:text-white/70">{v || "—"}</span>
    </div>
  );
}
