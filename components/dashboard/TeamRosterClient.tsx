"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type InvitationRow = {
  email: string;
  token: string;
  email_sent_at: string | null;
  opened_at: string | null;
  accepted_at: string | null;
};

type Props = {
  initialEmails: string[];
  invitations: InvitationRow[];
  numPlayers: number;
  emailDeliveryConfigured: boolean;
  siteBaseUrl: string;
};

function normalize(e: string) {
  return e.trim().toLowerCase();
}

function statusFor(
  email: string,
  byEmail: Map<string, InvitationRow>
): { label: string; className: string } {
  const inv = byEmail.get(normalize(email));
  if (!inv) {
    return { label: "Draft", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" };
  }
  if (inv.accepted_at) {
    return { label: "Joined", className: "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400" };
  }
  if (inv.opened_at) {
    return { label: "Opened link", className: "bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" };
  }
  if (inv.email_sent_at) {
    return { label: "Sent", className: "bg-[#dbeafe] text-[#1d4ed8] dark:bg-blue-950/50 dark:text-blue-300" };
  }
  if (inv.token) {
    return {
      label: "Link ready",
      className: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }
  return {
    label: "Pending send",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };
}

function buildInviteUrl(siteBaseUrl: string, token: string) {
  const base =
    (siteBaseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "") || "";
  return `${base}/invite/athlete/${token}`;
}

export default function TeamRosterClient({
  initialEmails,
  invitations,
  numPlayers,
  emailDeliveryConfigured,
  siteBaseUrl,
}: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(() =>
    Array.from(new Set(initialEmails.map(normalize).filter(Boolean))).sort()
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingPending, setSendingPending] = useState(false);
  /** Links returned from the last successful “create invites” call—visible immediately without waiting on refresh. */
  const [lastCreatedLinks, setLastCreatedLinks] = useState<{ email: string; inviteUrl: string }[] | null>(null);

  const byEmail = useMemo(() => {
    const m = new Map<string, InvitationRow>();
    for (const r of invitations) {
      m.set(normalize(r.email), r);
    }
    return m;
  }, [invitations]);

  const acceptedCount = useMemo(
    () => invitations.filter((i) => i.accepted_at).length,
    [invitations]
  );

  const pct = numPlayers > 0 ? Math.min(100, Math.round((acceptedCount / numPlayers) * 100)) : 0;

  const showManualDeliveryHint = useMemo(
    () => invitations.some((i) => i.token && !i.email_sent_at),
    [invitations]
  );

  const pendingEmailCount = useMemo(
    () => invitations.filter((i) => i.token && !i.email_sent_at && !i.accepted_at).length,
    [invitations]
  );

  function addEmail() {
    setError(null);
    const e = normalize(input);
    if (!e) return;
    if (!e.endsWith(".edu")) {
      setError("Athlete emails must end with .edu");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Enter a valid email address.");
      return;
    }
    if (emails.includes(e)) {
      setError("That email is already on the list.");
      return;
    }
    setEmails((prev) => [...prev, e].sort());
    setInput("");
  }

  function removeEmail(e: string) {
    setEmails((prev) => prev.filter((x) => x !== e));
  }

  async function sendInvites() {
    setError(null);
    setInfo(null);
    if (emails.length === 0) {
      setError("Add at least one email before sending.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/team/send-athlete-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not send invites.");
        return;
      }
      const resultRows = Array.isArray(data.results)
        ? (data.results as { email: string; ok: boolean; error?: string }[])
        : [];
      const failedSends = resultRows.filter((r) => !r.ok);
      if (failedSends.length > 0) {
        setError(
          failedSends.map((r) => `${r.email}: ${r.error ?? "failed"}`).join(" · ") +
            (data.emailDeliveryConfigured
              ? " — In Resend, verify your sending domain and set RESEND_FROM to a verified address for real delivery."
              : "")
        );
      }
      if (data.emailDeliveryConfigured === false && Array.isArray(data.manualLinks) && data.manualLinks.length > 0) {
        setLastCreatedLinks(
          data.manualLinks as { email: string; inviteUrl: string }[]
        );
        setInfo(
          `Created ${data.manualLinks.length} invite link${data.manualLinks.length === 1 ? "" : "s"} below. Share each URL with the matching athlete (they stay valid until signup). Add RESEND_API_KEY to send these by email automatically.`
        );
      } else if (typeof data.sent === "number" && data.sent > 0) {
        setInfo(
          failedSends.length
            ? `Sent ${data.sent} invite email(s); some failed (see above).`
            : `Sent ${data.sent} invite email${data.sent === 1 ? "" : "s"}.`
        );
      } else if (
        failedSends.length === 0 &&
        data.emailDeliveryConfigured &&
        data.sent === 0 &&
        typeof data.skipped === "number" &&
        data.skipped > 0
      ) {
        setInfo("All listed athletes were already emailed; no new sends.");
      }
      if (data.emailDeliveryConfigured !== false) {
        setLastCreatedLinks(null);
      }
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function sendPendingEmails() {
    setError(null);
    setInfo(null);
    if (!emailDeliveryConfigured) {
      setError("Email delivery isn’t configured yet.");
      return;
    }
    if (pendingEmailCount === 0) {
      setInfo("No pending invite emails to send.");
      return;
    }
    setSendingPending(true);
    try {
      const res = await fetch("/api/team/send-pending-athlete-invites", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not send pending emails.");
        return;
      }
      const sent = typeof data.sent === "number" ? data.sent : 0;
      setInfo(sent > 0 ? `Sent ${sent} pending invite email${sent === 1 ? "" : "s"}.` : "No pending invite emails to send.");
      router.refresh();
    } finally {
      setSendingPending(false);
    }
  }

  async function copyInviteUrl(token: string) {
    const url = buildInviteUrl(siteBaseUrl, token);
    try {
      await navigator.clipboard.writeText(url);
      setInfo("Invite link copied to clipboard.");
    } catch {
      setError("Could not copy—select and copy the link manually.");
    }
  }

  async function copyText(text: string, confirmation: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInfo(confirmation);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
          <p className="text-xs text-black/40 dark:text-white/35">Roster size</p>
          <p className="mt-1 text-2xl font-black text-black dark:text-white">{numPlayers}</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
          <p className="text-xs text-black/40 dark:text-white/35">On invite list</p>
          <p className="mt-1 text-2xl font-black text-[#1f7ae0]">{emails.length}</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
          <p className="text-xs text-black/40 dark:text-white/35">Accepted (signed up)</p>
          <p className="mt-1 text-2xl font-black text-green-600 dark:text-green-400">{acceptedCount}</p>
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-black/6 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#161b27]">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-black dark:text-white">Signup progress</span>
          <span className="font-bold text-green-600 dark:text-green-400">
            {acceptedCount} / {numPlayers}
          </span>
        </div>
        <p className="mb-2 text-xs text-black/40 dark:text-white/35">
          Tracked when athletes complete signup after using your invite link.
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-green-500 transition-all dark:bg-green-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-black/6 bg-white shadow-sm dark:border-white/6 dark:bg-[#161b27]">
        <div className="border-b border-black/5 px-6 py-4 dark:border-white/5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">
            Invite athletes
          </h2>
          <p className="mt-1 text-sm text-black/45 dark:text-white/40">
            Add .edu emails, then {emailDeliveryConfigured ? "send invite emails" : "create invite links"}. Athletes use
            the link to open athlete signup.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {(showManualDeliveryHint || !emailDeliveryConfigured) && (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200">
              {!emailDeliveryConfigured
                ? "Email delivery isn’t configured yet (set RESEND_API_KEY). Invite links still work—use Copy link in the list below for each athlete until mail is enabled."
                : "Some athletes have a link ready but no automated email was sent yet—use Copy link to share manually if needed."}
              {emailDeliveryConfigured && pendingEmailCount > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={sendPendingEmails}
                    disabled={sendingPending}
                    className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400"
                  >
                    {sendingPending ? "Sending…" : `Send pending emails (${pendingEmailCount})`}
                  </button>
                </div>
              )}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-[#1f7ae0]/30 bg-[#1f7ae0]/8 px-3 py-2 text-sm text-[#0d5cb6] dark:border-[#1f7ae0]/35 dark:bg-[#1f7ae0]/15 dark:text-blue-200">
              {info}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              placeholder="athlete@university.edu"
              className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm text-black placeholder-black/35 focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/35"
            />
            <button
              type="button"
              onClick={addEmail}
              className="rounded-xl bg-[#1f7ae0] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1966c4] dark:hover:bg-[#3d8ee8]"
            >
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {emails.length === 0 ? (
              <p className="text-sm text-black/40 dark:text-white/35">No emails yet — add your roster above.</p>
            ) : (
              emails.map((email) => (
                <div
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.02] py-1 pl-3 pr-1 text-sm dark:border-white/10 dark:bg-white/5"
                >
                  <span className="max-w-[200px] truncate text-black dark:text-white">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-black/45 hover:bg-black/10 hover:text-black dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label={`Remove ${email}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            disabled={sending || emails.length === 0}
            onClick={sendInvites}
            className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:w-auto sm:px-10"
          >
            {sending
              ? emailDeliveryConfigured
                ? "Sending…"
                : "Preparing…"
              : emailDeliveryConfigured
                ? "Send email invites"
                : "Create invite links"}
          </button>
          <p className="text-xs text-black/38 dark:text-white/30">
            {emailDeliveryConfigured ? (
              <>
                New addresses receive an email with a secure link to signup. Addresses that were already emailed are
                skipped automatically; to resend, you’ll need support to reset that invite.
              </>
            ) : (
              <>
                Without email configured, new addresses get a secure link you copy and share yourself. Already-emailed
                rows (if you later enable mail) are skipped the same way.
              </>
            )}
          </p>

          {lastCreatedLinks && lastCreatedLinks.length > 0 && (
            <div className="rounded-xl border-2 border-[#1f7ae0]/35 bg-[#1f7ae0]/6 p-4 dark:border-[#1f7ae0]/45 dark:bg-[#1f7ae0]/12">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1f7ae0]">Invite links — share these</p>
              <ul className="mt-3 space-y-3">
                {lastCreatedLinks.map(({ email, inviteUrl }) => (
                  <li key={email} className="rounded-lg border border-black/8 bg-white p-3 dark:border-white/10 dark:bg-[#161b27]">
                    <p className="text-xs font-medium text-black/50 dark:text-white/45">{email}</p>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        readOnly
                        value={inviteUrl}
                        className="min-w-0 flex-1 rounded-md border border-black/12 bg-black/[0.02] px-2 py-1.5 font-mono text-[11px] text-black dark:border-white/12 dark:bg-black/20 dark:text-white/90"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => copyText(inviteUrl, `Copied link for ${email}.`)}
                        className="shrink-0 rounded-lg bg-[#1f7ae0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1966c4]"
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-[#1f7ae0] underline-offset-2 hover:underline"
                onClick={() =>
                  copyText(
                    lastCreatedLinks.map((r) => `${r.email}\t${r.inviteUrl}`).join("\n"),
                    "Copied all links (email + URL per line)."
                  )
                }
              >
                Copy all as text
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/6 bg-white shadow-sm dark:border-white/6 dark:bg-[#161b27]">
        <div className="border-b border-black/5 px-6 py-4 dark:border-white/5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black/35 dark:text-white/30">
            Status by athlete
          </h2>
        </div>
        {emails.length === 0 ? (
          <div className="py-12 text-center text-sm text-black/40 dark:text-white/35">Add emails to see invite status.</div>
        ) : (
          <ul className="divide-y divide-black/4 dark:divide-white/4">
            {emails.map((email, i) => {
              const { label, className } = statusFor(email, byEmail);
              const inv = byEmail.get(normalize(email));
              const canCopy = Boolean(inv?.token && !inv.email_sent_at);
              return (
                <li key={email} className="flex flex-wrap items-center gap-4 px-6 py-4 sm:flex-nowrap">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-bold text-[#1f7ae0]">
                    {email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-black dark:text-white">{email}</p>
                    <p className="text-xs text-black/35 dark:text-white/30">#{i + 1}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canCopy && inv?.token && (
                      <button
                        type="button"
                        onClick={() => copyInviteUrl(inv.token)}
                        className="rounded-full border border-[#1f7ae0]/40 bg-[#1f7ae0]/10 px-3 py-1 text-xs font-semibold text-[#1f7ae0] transition hover:bg-[#1f7ae0]/18 dark:text-[#5aa9f0]"
                      >
                        Copy link
                      </button>
                    )}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
