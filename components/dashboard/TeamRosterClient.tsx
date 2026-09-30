"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AthleteAvatar from "@/components/dashboard/AthleteAvatar";

export type InvitationRow = {
  email: string;
  token: string;
  email_sent_at: string | null;
  opened_at: string | null;
  accepted_at: string | null;
};

/**
 * A joined athlete's public-facing identity, resolved and authorized on the server by
 * lib/athletes/visibility.ts#resolveTeamRoster. Never fetch athlete data from this
 * component: athlete_profiles is readable only through the service client, which must stay
 * on the server, and the team-scoping there is the authorization boundary.
 */
export type RosterMember = {
  firstName: string;
  lastName: string;
  fullName: string;
  sport: string | null;
  graduationYear: number | null;
  /** Presigned and short-lived. Re-resolved whenever the server re-renders this page. */
  photoUrl: string | null;
};

type Props = {
  initialEmails: string[];
  invitations: InvitationRow[];
  numPlayers: number;
  siteBaseUrl: string;
  /** Keyed by lower-cased email. Absent for invites that are pending or not yet onboarded. */
  membersByEmail: Record<string, RosterMember>;
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
  if (inv.token) {
    return {
      label: "Link ready",
      className: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }
  return { label: "Draft", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" };
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
  siteBaseUrl,
  membersByEmail,
}: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(() =>
    Array.from(new Set(initialEmails.map(normalize).filter(Boolean))).sort()
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
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

  /**
   * The list the status table renders.
   *
   * NOT just `emails`. That state is seeded from team_profiles.athlete_emails, which
   * POST /api/team/send-athlete-invites OVERWRITES wholesale with only the addresses in
   * that request — while team_athlete_invitations rows are never deleted. So an athlete
   * who accepted an invite and was later dropped from athlete_emails (by any save that
   * happened not to include them) vanished from this table completely, roster spot and
   * all, while still being on the team.
   *
   * Unioning in everyone who actually joined makes the table show the roster rather than
   * the last thing typed into the invite box. `emails` itself is left alone: it is the
   * editable draft that drives add/remove and the create-links call, and folding joined
   * athletes into it would make "remove" look like it could un-join someone.
   */
  const displayEmails = useMemo(() => {
    const joined = invitations.filter((i) => i.accepted_at).map((i) => normalize(i.email));
    return Array.from(new Set([...emails, ...joined])).sort((a, b) => {
      // Joined athletes first, then alphabetically — same ordering the server uses.
      const aJoined = membersByEmail[a] ? 0 : 1;
      const bJoined = membersByEmail[b] ? 0 : 1;
      if (aJoined !== bJoined) return aJoined - bJoined;
      return (membersByEmail[a]?.fullName || a).localeCompare(membersByEmail[b]?.fullName || b);
    });
  }, [emails, invitations, membersByEmail]);

  const pct = numPlayers > 0 ? Math.min(100, Math.round((acceptedCount / numPlayers) * 100)) : 0;

  // Note: We intentionally generate links only (no email delivery).

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

  async function createInviteLinks() {
    setError(null);
    setInfo(null);
    if (emails.length === 0) {
      setError("Add at least one email before creating links.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/team/send-athlete-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // ignore
      }
      if (!res.ok) {
        const fallbackText = typeof data?.error === "string" ? "" : await res.text().catch(() => "");
        setError(
          typeof data.error === "string"
            ? data.error
            : fallbackText
              ? `Could not create links (HTTP ${res.status}): ${fallbackText.slice(0, 160)}`
              : `Could not create links (HTTP ${res.status}).`
        );
        return;
      }
      if (Array.isArray(data.manualLinks) && data.manualLinks.length > 0) {
        setLastCreatedLinks(data.manualLinks as { email: string; inviteUrl: string }[]);
        setInfo(`Created ${data.manualLinks.length} invite link${data.manualLinks.length === 1 ? "" : "s"} below.`);
      } else {
        setInfo("No links were created.");
      }
      router.refresh();
    } finally {
      setSending(false);
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
            Add .edu emails, then create invite links. Athletes use the link to open athlete signup.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
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
            onClick={createInviteLinks}
            className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:w-auto sm:px-10"
          >
            {sending ? "Creating…" : "Create invite links"}
          </button>
          <p className="text-xs text-black/40 dark:text-white/30">
            Links stay valid until the athlete completes signup.
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
        {displayEmails.length === 0 ? (
          <div className="py-12 text-center text-sm text-black/40 dark:text-white/35">Add emails to see invite status.</div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {displayEmails.map((email) => {
              const { label, className } = statusFor(email, byEmail);
              const inv = byEmail.get(normalize(email));
              const canCopy = Boolean(inv?.token);
              const member = membersByEmail[normalize(email)];
              return (
                <li key={email} className="flex flex-wrap items-center gap-4 px-6 py-4 sm:flex-nowrap">
                  {member ? (
                    <AthleteAvatar
                      photoUrl={member.photoUrl}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      size="md"
                    />
                  ) : (
                    /* Still an email, not a person: invited but not joined, or joined but
                       not yet onboarded. The initial of the address is all there is. */
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-bold text-[#1f7ae0] dark:bg-[#1f7ae0]/20">
                      {email[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-black dark:text-white">
                      {member ? member.fullName : email}
                    </p>
                    <p className="truncate text-xs text-black/35 dark:text-white/30">
                      {member
                        ? [member.sport, member.graduationYear ? `Class of ${member.graduationYear}` : null, email]
                            .filter(Boolean)
                            .join(" · ")
                        : "Not joined yet"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canCopy && inv?.token && (
                      <button
                        type="button"
                        onClick={() => copyInviteUrl(inv.token)}
                        className="rounded-full border border-[#1f7ae0]/40 bg-[#1f7ae0]/10 px-3 py-1 text-xs font-semibold text-[#1f7ae0] transition hover:bg-[#1f7ae0]/20 dark:text-[#5aa9f0]"
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
