"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5 md:px-12">
      <Link href="/" className="flex items-center gap-4 transition hover:opacity-80">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/10 bg-white text-2xl font-black shadow-md dark:border-white/10 dark:bg-white/10 dark:text-white">
          C
        </div>
        <div>
          <div className="text-2xl font-extrabold tracking-tight text-black dark:text-white">
            ConnectNIL
          </div>
          <div className="text-xs uppercase tracking-[0.25em] text-black/40 dark:text-white/35">
            Team Partnerships
          </div>
        </div>
      </Link>
      <ThemeToggle />
    </nav>
  );
}
