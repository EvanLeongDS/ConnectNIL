"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navigateAfterSignUp } from "@/lib/auth/signupRedirect";
import AuthNav from "@/components/auth/AuthNav";

function getPasswordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-sm transition-colors ${
        ok ? "text-green-600 dark:text-green-400" : "text-black/40 dark:text-white/35"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${
          ok ? "bg-green-600 text-white dark:bg-green-400" : "border border-black/20 dark:border-white/20"
        }`}
      >
        {ok ? "✓" : ""}
      </span>
      {label}
    </li>
  );
}

interface TeamInviteInfo {
  team_name: string;
  school: string;
  sport: string;
  division: string | null;
  email: string;
}

function AthleteSignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // When the athlete is already logged in with the invited email, show a
  // confirmation screen rather than silently accepting the invite.
  const [pendingInvite, setPendingInvite] = useState<{
    teamInfo: TeamInviteInfo;
    accessToken: string;
  } | null>(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("email")?.trim();
    if (q) setEmail(q);
  }, [searchParams]);

  // Check if athlete is already logged in — if so, fetch team info and show confirmation.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token || !session.user?.email) return;
      const invitedEmail = (searchParams.get("email")?.trim() || "").toLowerCase();
      if (!invitedEmail || session.user.email.toLowerCase() !== invitedEmail) return;
      if (session.user.user_metadata?.role !== "athlete") return;

      // Fetch team info to show the confirmation screen
      try {
        const res = await fetch(`/api/invite/info?token=${encodeURIComponent(inviteToken)}`);
        if (!cancelled && res.ok) {
          const teamInfo: TeamInviteInfo = await res.json();
          setPendingInvite({ teamInfo, accessToken: session.access_token });
        }
      } catch {
        // Fall through — athlete can use the form normally
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, searchParams]);

  async function handleAcceptInvite() {
    if (!pendingInvite) return;
    setAcceptingInvite(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/invite/mark-accepted", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingInvite.accessToken}`,
        },
        body: JSON.stringify({ token: inviteToken }),
      });
      if (res.ok) {
        router.replace("/dashboard/athlete-dashboard");
      } else {
        const body = await res.json().catch(() => ({}));
        setInviteError((body as { error?: string }).error ?? "Failed to accept invite. Please try again.");
        setAcceptingInvite(false);
      }
    } catch {
      setInviteError("Network error. Please try again.");
      setAcceptingInvite(false);
    }
  }

  async function handleSignOutAndReLogin() {
    const supabase = createClient();
    await supabase.auth.signOut();
    const dest = new URL("/login", window.location.origin);
    dest.searchParams.set("redirect", window.location.pathname + window.location.search);
    router.replace(dest.toString());
  }

  const checks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordValid = checks.length && checks.number && checks.special;
  const isEduEmail = email.toLowerCase().endsWith(".edu");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEduEmail) {
      setError("Athletes must sign up with a .edu email address.");
      return;
    }
    if (!passwordValid) {
      setError("Please meet all password requirements.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { role: "athlete" },
      },
    });

    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    if (data.session && inviteToken) {
      try {
        await fetch("/api/invite/mark-accepted", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ token: inviteToken }),
        });
      } catch {
        // non-blocking; auth callback cookie may still record acceptance
      }
    }

    setLoading(false);
    if (!navigateAfterSignUp(data.session, router)) {
      setSuccess(true);
    }
  }

  if (pendingInvite) {
    const { teamInfo } = pendingInvite;
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-8 dark:bg-[#0d1117]">
        <AuthNav />
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="mb-3 text-4xl">🏆</div>
            <h1 className="text-2xl font-bold text-black dark:text-white">Team Invite</h1>
            <p className="mt-1 text-sm text-black/50 dark:text-white/40">
              You have been invited to join a team roster
            </p>
          </div>

          <div className="rounded-xl border border-black/10 bg-[#f9fafb] p-5 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">{teamInfo.sport}</p>
            <p className="mt-1 text-xl font-black text-black dark:text-white">{teamInfo.team_name}</p>
            <p className="mt-0.5 text-sm text-black/50 dark:text-white/40">
              {teamInfo.school}
              {teamInfo.division ? ` · ${teamInfo.division}` : ""}
            </p>
            <p className="mt-3 text-xs text-black/45 dark:text-white/35">
              Invite sent to <strong className="text-black dark:text-white">{teamInfo.email}</strong>
            </p>
          </div>

          {inviteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{inviteError}</div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleAcceptInvite}
              disabled={acceptingInvite}
              className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {acceptingInvite ? "Accepting…" : "Accept & Go to Dashboard"}
            </button>
            <button
              type="button"
              onClick={handleSignOutAndReLogin}
              className="w-full rounded-full border border-black/15 py-3 text-sm font-semibold text-black/60 transition hover:border-black/30 hover:text-black dark:border-white/15 dark:text-white/50 dark:hover:border-white/30 dark:hover:text-white"
            >
              Not you? Sign in with a different account
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-8 dark:bg-[#0d1117]">
        <AuthNav />
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Check your email</h1>
          <p className="text-black/50 dark:text-white/50">
            We sent a confirmation link to <strong className="text-black dark:text-white">{email}</strong>. Click it to
            activate your account.
          </p>
          {inviteToken && (
            <p className="text-xs text-black/45 dark:text-white/40">
              After you confirm, your team invite will show as accepted for your manager.
            </p>
          )}
          <Link href="/login" className="block text-sm font-semibold text-[#1f7ae0] hover:underline">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-8 dark:bg-[#0d1117]">
      <AuthNav />

      <div className="w-full max-w-sm space-y-6">
        <button
          type="button"
          onClick={() => router.push("/role")}
          className="flex items-center gap-2 text-sm font-semibold text-black/50 transition hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-black dark:text-white">Athlete Sign Up</h1>
          <p className="mt-1 text-black/50 dark:text-white/50">
            {inviteToken ? "Complete signup with your team invite" : "Create your athlete account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-black dark:text-white">
              University Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full rounded-lg border px-4 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:ring-1 dark:text-white dark:placeholder-white/30 dark:bg-white/5
                ${
                  email.length > 0
                    ? isEduEmail
                      ? "border-green-500 bg-green-50/30 focus:border-green-500 focus:ring-green-500 dark:border-green-500/60 dark:bg-green-500/5"
                      : "border-red-400 bg-red-50/30 focus:border-red-400 focus:ring-red-400 dark:border-red-400/60 dark:bg-red-500/5"
                    : "border-black/15 bg-white focus:border-[#1f7ae0] focus:ring-[#1f7ae0] dark:border-white/15"
                }`}
              placeholder="yourname@university.edu"
            />
            {email.length > 0 && !isEduEmail && <p className="text-xs text-red-500">Must be a .edu email address</p>}
            {isEduEmail && <p className="text-xs text-green-600 dark:text-green-400">✓ Valid university email</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-black dark:text-white">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 pr-12 text-sm text-black placeholder-black/30 focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30"
                placeholder="Create a strong password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {password.length > 0 && (
              <ul className="mt-2 space-y-1 pl-1">
                <CheckItem ok={checks.length} label="At least 8 characters" />
                <CheckItem ok={checks.number} label="At least one number (0–9)" />
                <CheckItem ok={checks.special} label="At least one special character (!@#$…)" />
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isEduEmail || !passwordValid}
            className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? "Creating account..." : "Create Athlete Account"}
          </button>
        </form>

        <p className="text-center text-sm text-black/50 dark:text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#1f7ae0] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function AthleteSignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0d1117]">
          <p className="text-sm text-black/45 dark:text-white/40">Loading…</p>
        </main>
      }
    >
      <AthleteSignupInner />
    </Suspense>
  );
}
