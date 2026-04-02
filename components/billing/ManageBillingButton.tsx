"use client";

import { useState } from "react";

export default function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleManageBilling() {
    setLoading(true);
    const res = await fetch("/api/stripe/create-portal", { method: "POST" });
    const { url, error } = await res.json();
    if (error) {
      alert(error);
      setLoading(false);
      return;
    }
    window.location.href = url;
  }

  return (
    <button
      onClick={handleManageBilling}
      disabled={loading}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {loading ? "Loading..." : "Manage Billing"}
    </button>
  );
}
