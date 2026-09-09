"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black shadow-sm outline-none focus:border-[#1f7ae0] focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/10 dark:bg-[#1a2035] dark:text-white dark:placeholder:text-white/30 dark:focus:border-[#3d8ef0]";

export default function DealRespondButtons({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [teamSignerName, setTeamSignerName] = useState("");

  async function respond(action: "accept" | "decline") {
    if (action === "accept" && !confirmed) {
      setConfirmed(true);
      return;
    }
    if (action === "accept") {
      const n = teamSignerName.trim();
      if (n.length < 2) {
        setError("Type your full name to sign as the team representative.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "accept" ? { teamSignerName: teamSignerName.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      // Stay on the deal. It re-renders with the signature block filled and the
      // deliverables now actionable, which is what the manager needs to see next —
      // pushing to the list made them hunt for the row they had just signed.
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {confirmed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-900/20">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            By accepting, you agree to the terms of this NIL partnership agreement and commit your team to the deliverables outlined above.
          </p>
          <label className="mt-4 block text-sm font-semibold text-black/70 dark:text-white/60">
            Type your full name (electronic signature)
            <input
              className={inputCls}
              placeholder="e.g. Jordan Smith"
              value={teamSignerName}
              onChange={(e) => setTeamSignerName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => respond("accept")}
              disabled={busy}
              className="rounded-xl bg-emerald-600 px-7 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Confirm acceptance"}
            </button>
            <button
              onClick={() => {
                setConfirmed(false);
                setTeamSignerName("");
              }}
              disabled={busy}
              className="rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/60 hover:bg-black/3 dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => respond("accept")}
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Accept partnership
          </button>
          <button
            onClick={() => respond("decline")}
            disabled={busy}
            className="rounded-xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/50 dark:bg-red-900/15 dark:text-red-400 dark:hover:bg-red-900/25"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
