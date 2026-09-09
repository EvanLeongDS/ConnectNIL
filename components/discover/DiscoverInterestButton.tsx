"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CounterpartyResult } from "@/lib/discover/opportunities";

type ViewerRole = "team-manager" | "brand-manager";
type SubjectType = "brand" | "team";
type DiscoveryResponse = "committed" | "exploring" | "declined";

const OPTIONS: {
  value: DiscoveryResponse;
  title: string;
  description: string;
}[] = [
  {
    value: "committed",
    title: "Ready to pursue a partnership",
    description: "I’m open to moving toward a deal or contract.",
  },
  {
    value: "exploring",
    title: "Interested, still deciding",
    description: "I’d like to learn more before I commit.",
  },
  {
    value: "declined",
    title: "Not a fit right now",
    description: "I’m going to pass on this opportunity.",
  },
];

type Props = {
  viewerRole: ViewerRole;
  subjectType: SubjectType;
  subjectId: string;
  subjectTitle: string;
  /** Link to Opportunities → Your Discover outreach (for follow-up). */
  opportunitiesHref: string;
};

export default function DiscoverInterestButton({
  subjectType,
  subjectId,
  subjectTitle,
  opportunitiesHref,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-[#1f7ae0]/35 bg-[#1f7ae0]/10 py-2.5 text-sm font-semibold text-[#1f7ae0] transition hover:bg-[#1f7ae0]/20 dark:border-[#1f7ae0]/45 dark:bg-[#1f7ae0]/15 dark:text-[#8ec5ff] dark:hover:bg-[#1f7ae0]/25"
      >
        Record interest
      </button>
      {open && (
        <DiscoverInterestModal
          subjectType={subjectType}
          subjectId={subjectId}
          subjectTitle={subjectTitle}
          opportunitiesHref={opportunitiesHref}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DiscoverInterestModal({
  subjectType,
  subjectId,
  subjectTitle,
  opportunitiesHref,
  onClose,
}: Pick<Props, "subjectType" | "subjectId" | "subjectTitle" | "opportunitiesHref"> & {
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "choose">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneKind, setDoneKind] = useState<null | "positive">(null);
  const [counterparty, setCounterparty] = useState<CounterpartyResult | null>(null);

  async function confirmPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) {
        setBusy(false);
        setError("Could not read your account email.");
        return;
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        setError(signErr.message || "Incorrect password.");
        setBusy(false);
        return;
      }
      setPassword("");
      setStep("choose");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(value: DiscoveryResponse) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/discover/express-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          subjectId,
          response: value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong.");
        setBusy(false);
        return;
      }

      if (value === "declined") {
        onClose();
        return;
      }

      setDoneKind("positive");
      setCounterparty(null);
      const cr = await fetch(
        `/api/discover/counterparty-contact?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`
      );
      const contactData = await cr.json().catch(() => null);
      if (cr.ok && contactData?.subjectType && contactData?.row) {
        setCounterparty(contactData as CounterpartyResult);
      }
    } finally {
      setBusy(false);
    }
  }

  const subjectLabel = subjectType === "brand" ? "this brand" : "this team";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-interest-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-[#161b27]"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p id="discover-interest-title" className="text-lg font-bold text-black dark:text-white">
              {doneKind === "positive"
                ? "Their contact details"
                : step === "password"
                  ? "Confirm it’s you"
                  : "How interested are you?"}
            </p>
            <p className="mt-1 text-sm text-black/50 dark:text-white/45">{subjectTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-black/45 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {doneKind === "positive" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55 dark:text-white/45">
              Here’s how to reach them. This is also saved under{" "}
              <Link href={opportunitiesHref} className="font-semibold text-[#1f7ae0] hover:underline">
                Opportunities → Your Discover outreach
              </Link>
              .
            </p>
            {counterparty?.subjectType === "brand" ? (
              <div className="rounded-xl border border-[#1f7ae0]/25 bg-[#1f7ae0]/6 p-4 dark:border-[#1f7ae0]/35 dark:bg-[#1f7ae0]/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#1560b3] dark:text-[#8ec5ff]">
                  Brand contact
                </p>
                <p className="mt-1 text-sm font-bold text-black dark:text-white">
                  {counterparty.row.companyName}
                </p>
                <p className="mt-0.5 text-xs text-black/50 dark:text-white/45">
                  {counterparty.row.industry} · {counterparty.row.city}, {counterparty.row.state}
                </p>
                <p className="mt-3 text-sm font-semibold text-black dark:text-white">
                  {counterparty.row.managerFirstName} {counterparty.row.managerLastName}
                </p>
                <p className="mt-2 text-sm">
                  <span className="text-black/45 dark:text-white/40">Email </span>
                  {counterparty.row.email ? (
                    <a
                      href={`mailto:${counterparty.row.email}`}
                      className="font-medium text-[#1f7ae0] hover:underline"
                    >
                      {counterparty.row.email}
                    </a>
                  ) : (
                    <span className="text-black/35">—</span>
                  )}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-black/45 dark:text-white/40">Phone </span>
                  {counterparty.row.phone ? (
                    <a
                      href={`tel:${counterparty.row.phone.replace(/\s/g, "")}`}
                      className="font-medium text-[#1f7ae0] hover:underline"
                    >
                      {counterparty.row.phone}
                    </a>
                  ) : (
                    <span className="text-black/35">—</span>
                  )}
                </p>
              </div>
            ) : counterparty?.subjectType === "team" ? (
              <div className="rounded-xl border border-[#1f7ae0]/25 bg-[#1f7ae0]/6 p-4 dark:border-[#1f7ae0]/35 dark:bg-[#1f7ae0]/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#1560b3] dark:text-[#8ec5ff]">
                  Team contact
                </p>
                <p className="mt-1 text-sm font-bold text-black dark:text-white">
                  {counterparty.row.school} {counterparty.row.teamName}
                </p>
                <p className="mt-3 text-sm font-semibold text-black dark:text-white">
                  {counterparty.row.managerFirstName} {counterparty.row.managerLastName}
                </p>
                <p className="mt-2 text-sm">
                  <span className="text-black/45 dark:text-white/40">Email </span>
                  {counterparty.row.email ? (
                    <a
                      href={`mailto:${counterparty.row.email}`}
                      className="font-medium text-[#1f7ae0] hover:underline"
                    >
                      {counterparty.row.email}
                    </a>
                  ) : (
                    <span className="text-black/35">—</span>
                  )}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-black/45 dark:text-white/40">Phone </span>
                  <a
                    href={`tel:${counterparty.row.phone.replace(/\s/g, "")}`}
                    className="font-medium text-[#1f7ae0] hover:underline"
                  >
                    {counterparty.row.phone}
                  </a>
                </p>
              </div>
            ) : (
              <p className="text-sm text-amber-800 dark:text-amber-200/90">
                Your interest was saved. Open{" "}
                <Link href={opportunitiesHref} className="font-semibold underline">
                  Opportunities
                </Link>{" "}
                to see contact details.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-[#1f7ae0] py-2.5 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : step === "password" ? (
          <form onSubmit={confirmPassword} className="space-y-4">
            <p className="text-sm text-black/55 dark:text-white/45">
              Re-enter your ConnectNIL password to record interest in {subjectLabel}.
            </p>
            <div>
              <label htmlFor="discover-pw" className="block text-xs font-medium text-black/60 dark:text-white/50">
                Password
              </label>
              <input
                id="discover-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/12 bg-white px-3 py-2.5 text-sm text-black focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/12 dark:bg-white/5 dark:text-white"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-black/12 py-2.5 text-sm font-semibold text-black/70 dark:border-white/12 dark:text-white/70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-[#1f7ae0] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-black/55 dark:text-white/45">
              Your choice is saved to your account. You can update it anytime by recording interest again.
            </p>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busy}
                  onClick={() => submitResponse(opt.value)}
                  className="rounded-xl border border-black/8 bg-[#f9fafb] px-4 py-3 text-left transition hover:border-[#1f7ae0]/40 hover:bg-[#1f7ae0]/6 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#1f7ae0]/50 dark:hover:bg-[#1f7ae0]/10"
                >
                  <span className="block text-sm font-semibold text-black dark:text-white">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-black/45 dark:text-white/40">{opt.description}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setError(null);
              }}
              className="w-full text-center text-xs font-medium text-[#1f7ae0] hover:underline"
            >
              Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
