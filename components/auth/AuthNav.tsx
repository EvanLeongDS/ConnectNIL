"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5 md:px-12">
      <Link href="/" className="flex items-center transition hover:opacity-75">
        <img
          src="/connectnil-logo.png"
          alt="ConnectNIL"
          className="h-9 w-auto [mix-blend-mode:multiply] dark:invert dark:[mix-blend-mode:screen]"
        />
      </Link>
      <ThemeToggle />
    </nav>
  );
}
