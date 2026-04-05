"use client";

import { useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dollars = (amountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  async function handlePay() {
    setLoading(true);
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
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
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
