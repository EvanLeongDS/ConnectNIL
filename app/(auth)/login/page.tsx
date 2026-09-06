"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthNav from "@/components/auth/AuthNav";
import AuthBackground from "@/components/auth/AuthBackground";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
      <AuthBackground />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-8">
        <AuthNav />

        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
          <h1 className="text-3xl font-bold text-black dark:text-white">Welcome back</h1>
          <p className="mt-2 text-black/50 dark:text-white/50">Sign in to your account</p>
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
                className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-sm text-black placeholder-black/30 focus:border-[#1f7ae0] focus:outline-none focus:ring-1 focus:ring-[#1f7ae0] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-[#1f7ae0]"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-black/50 dark:text-white/40">
            Don&apos;t have an account?{" "}
            <Link href="/role" className="font-semibold text-[#1f7ae0] hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
