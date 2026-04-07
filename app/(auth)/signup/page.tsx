"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navigateAfterSignUp } from "@/lib/auth/signupRedirect";
import AuthNav from "@/components/auth/AuthNav";
import ParticlesBackground from "@/components/auth/ParticlesBackground";

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { role },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    if (!navigateAfterSignUp(data.session, router)) {
      setSuccess(true);
    }
  }

  const roleLabel =
    role === "athlete"
      ? "Athlete"
      : role === "brand-manager"
      ? "Brand Manager"
      : role === "team-manager"
      ? "Team Manager"
      : null;

  if (success) {
    return (
      <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
        <ParticlesBackground />
        <main className="relative z-10 flex min-h-screen items-center justify-center px-8">
          <AuthNav />
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="text-4xl">📬</div>
            <h1 className="text-2xl font-bold text-black dark:text-white">Check your email</h1>
            <p className="text-black/50 dark:text-white/50">
              We sent a confirmation link to <strong className="text-black dark:text-white">{email}</strong>. Click it to activate your account.
            </p>
            <Link href="/login" className="block text-sm font-semibold text-[#1f7ae0] hover:underline">
              Back to sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
      <ParticlesBackground />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-8">
        <AuthNav />

        <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-black dark:text-white">Create an account</h1>
          {roleLabel && (
            <p className="mt-1 text-sm font-semibold text-[#1f7ae0]">Signing up as {roleLabel}</p>
          )}
          <p className="mt-1 text-black/50 dark:text-white/50">Get started for free</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-black dark:text-white">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm text-black placeholder-black/30 focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-black dark:text-white">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm text-black placeholder-black/30 focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]"
              placeholder="Min. 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign Up"}
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
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
          <ParticlesBackground />
          <main className="relative z-10 flex min-h-screen items-center justify-center px-8">
            <AuthNav />
            <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
          </main>
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}
