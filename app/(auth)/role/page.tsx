"use client";

import { useRouter } from "next/navigation";
import AuthNav from "@/components/auth/AuthNav";

const roles = [
  { label: "Athlete", href: "/signup/athlete" },
  { label: "Brand Manager", href: "/signup/brand-manager" },
  { label: "Team Manager", href: "/signup/team-manager" },
];

export default function RoleSelectPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#0d1117]">
      <AuthNav />
      <div className="w-full max-w-2xl space-y-12 text-center">
        <h1 className="text-5xl font-black tracking-tight text-black dark:text-white sm:text-6xl">
          I am a...
        </h1>

        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {roles.map((role) => (
            <button
              key={role.label}
              onClick={() => router.push(role.href)}
              className="flex-1 rounded-full bg-[#1f7ae0] px-8 py-7 text-xl font-bold text-white shadow-md transition hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {role.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-black/40 dark:text-white/30">
          Already have an account?{" "}
          <a href="/login" className="font-semibold text-[#1f7ae0] hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
