"use client";

import { useState } from "react";
import { useSubmitGuard } from "@/lib/ui/useSubmitGuard";
import { formatCents } from "@/lib/deals/types";

interface Props {
  dealId: string;
  amountCents: number;
  label?: string;
  installmentNumber?: number;
  deliverableId?: string;
  disabled?: boolean;
}

export default function InitiatePaymentButton({
  dealId,
  amountCents,
  label,
  installmentNumber,
  deliverableId,
  disabled = false,
}: Props) {
  const guard = useSubmitGuard();
  const loading = guard.busy;
  const [error, setError] = useState<string | null>(null);

  // Was a local copy with maximumFractionDigits: 0, so a $333.33 installment offered a
  // button reading "Pay $333" and then charged $333.33. Never round a figure the user is
  // about to be charged.
  const dollars = formatCents(amountCents);

  async function handlePay() {
    if (!guard.begin()) return;
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installment_number: installmentNumber,
          deliverable_id: deliverableId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Payment failed.");
        guard.release();
        return;
      }
      if (!data.url) {
        // A 200 with no URL used to leave the button reset and say nothing at all.
        setError("Could not open the payment page. Please try again.");
        guard.release();
        return;
      }
      // Terminal: the browser is navigating to Stripe. Releasing here — as the old
      // `finally` did — flipped the button back to an enabled "Pay $X" mid-redirect, and a
      // second click opens a second Checkout session for the same installment.
      guard.finish();
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
      guard.release();
    }
  }

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={loading || disabled}
        className="inline-flex items-center gap-2 rounded-xl bg-[#1f7ae0] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a6bc9] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Redirecting…
          </>
        ) : (
          label ?? `Pay ${dollars}`
        )}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
