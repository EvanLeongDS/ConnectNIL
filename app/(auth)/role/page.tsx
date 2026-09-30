"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthNav from "@/components/auth/AuthNav";
import AuthBackground from "@/components/auth/AuthBackground";
import TiltedCard from "@/components/TiltedCard";

const roles = [
  {
    label: "Athlete",
    role: "athlete",
    href: "/signup/athlete",
    imageSrc:
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=900&q=60",
  },
  {
    label: "Brand Manager",
    role: "brand-manager",
    href: "/signup/brand-manager",
    imageSrc:
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=900&q=60",
  },
  {
    label: "Team Manager",
    role: "team-manager",
    href: "/signup/team-manager",
    imageSrc:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=60",
  },
];

const VALID_ROLES = ["athlete", "brand-manager", "team-manager"];

export default function RoleSelectPage() {
  const router = useRouter();
  /* Two audiences share this page. A visitor with no account is picking which signup form to
   * open. A SIGNED-IN user with no usable role was sent here by the middleware to repair
   * their account — pushing them at /signup would just tell them the email is taken. */
  const [session, setSession] = useState<"unknown" | "none" | "needs-role">("unknown");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const user = data.user;
        if (!user) return setSession("none");
        // Only ever offered to accounts that have no valid role. Assigning a role writes to
        // user_metadata, which the user's own client is permitted to change — so this must
        // not become a convenient way to switch roles at will.
        const role = (user.user_metadata?.role as string | undefined) ?? "";
        setSession(VALID_ROLES.includes(role) ? "none" : "needs-role");
      })
      .catch(() => !cancelled && setSession("none"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(next: { role: string; href: string }) {
    if (session !== "needs-role") {
      router.push(next.href);
      return;
    }
    if (saving) return;
    setSaving(next.role);
    setError(null);
    const { error: updErr } = await createClient().auth.updateUser({
      data: { role: next.role },
    });
    if (updErr) {
      setError(updErr.message);
      setSaving(null);
      return;
    }
    // refresh() first so the middleware re-reads the session with its new role; without it
    // the very next request still looks role-less and bounces straight back here.
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
      <AuthBackground />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <AuthNav />
        <div className="w-full max-w-5xl space-y-10 text-center">
          <h1 className="text-5xl font-black tracking-tight text-black dark:text-white sm:text-6xl">
            I am a...
          </h1>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.label} className="flex justify-center">
                <TiltedCard
                  imageSrc={role.imageSrc}
                  altText={`${role.label} role`}
                  captionText={role.label}
                  containerHeight="280px"
                  containerWidth="280px"
                  imageHeight="280px"
                  imageWidth="280px"
                  rotateAmplitude={12}
                  scaleOnHover={1.06}
                  showMobileWarning={false}
                  showTooltip
                  displayOverlayContent
                  overlayContent={
                    <div className="inline-flex flex-col gap-1.5 rounded-xl bg-black/45 px-3 py-2 backdrop-blur-[2px]">
                      <p className="text-lg font-black leading-tight text-white">{role.label}</p>
                      <p className="text-xs font-semibold text-white/85">Continue</p>
                    </div>
                  }
                  onClick={() => choose(role)}
                  className="w-[280px]"
                />
              </div>
            ))}
          </div>

          {session === "needs-role" && (
            <p className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
              Your account does not have a role yet. Pick one to finish setting it up.
            </p>
          )}

          {error && (
            <p className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </p>
          )}

          {saving && (
            <p className="text-sm text-black/40 dark:text-white/30">Setting up your account…</p>
          )}

          <p className="text-sm text-black/40 dark:text-white/30">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-[#1f7ae0] hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
