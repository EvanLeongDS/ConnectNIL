"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AthleteDealOptIn({
  dealId,
  status,
}: {
  dealId: string;
  status: "invited" | "accepted" | "declined";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/participant-respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "accepted") {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
        You have opted in to this team deal.
      </p>
    );
  }
  if (status === "declined") {
    return (
      <p className="rounded-xl border border-black/8 bg-black/3 px-4 py-3 text-sm text-black/60 dark:border-white/8 dark:bg-white/5 dark:text-white/50">
        You declined to participate in this deal.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-sm dark:border-white/8 dark:bg-[#161b27]">
      <h2 className="text-base font-bold text-black dark:text-white">Your participation</h2>
      <p className="mt-1 text-sm text-black/50 dark:text-white/40">
        This is a team partnership. Opt in to confirm you agree to participate under this agreement, or decline if you do
        not wish to be included.
      </p>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Opt in"}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy}
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/50 dark:bg-red-900/15 dark:text-red-400 dark:hover:bg-red-900/25"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
