"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5 md:px-12">
      <Link
        href="/"
        className="flex items-center text-2xl font-black tracking-tight text-black transition hover:opacity-75 dark:text-white"
      >
        ConnectNIL
      </Link>
      <ThemeToggle />
    </nav>
  );
}
