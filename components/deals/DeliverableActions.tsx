"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** For brand-manager: approve or reject a submitted deliverable. */
export function DeliverableReviewButtons({
  dealId,
  deliverableId,
}: {
  dealId: string;
  deliverableId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/deliverables`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverable_id: deliverableId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update deliverable.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => act("approve")}
        disabled={loading !== null}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        onClick={() => act("reject")}
        disabled={loading !== null}
        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-white/10 dark:bg-white/5 dark:text-red-400 disabled:opacity-60"
      >
        {loading === "reject" ? "Rejecting…" : "Reject"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
