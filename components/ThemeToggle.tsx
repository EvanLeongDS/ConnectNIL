"use client";

import { useEffect, useState } from "react";

const MEDIA = "(prefers-color-scheme: dark)";

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Same tri-state rule as the pre-paint script in app/layout.tsx: an explicit
    // 'dark'/'light' wins, and no stored value means we mirror the OS.
    const mq = window.matchMedia(MEDIA);
    const apply = () => {
      const pref = localStorage.getItem("theme");
      const isDark = pref === "dark" || (pref !== "light" && mq.matches);
      document.documentElement.classList.toggle("dark", isDark);
      setDark(isDark);
    };
    apply();

    // Until the user picks a side we stay a live mirror of the system, so flipping the
    // OS theme — or a dark-mode extension doing it for them — moves the app too,
    // instead of stranding it on whatever it resolved to at load. Once they use the
    // toggle, localStorage answers first and this listener stops mattering.
    const onChange = () => {
      if (!localStorage.getItem("theme")) apply();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // Don't render until we know the real theme (avoids flicker)
  if (dark === null) return <div className="h-9 w-9" />;

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 transition hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      )}
    </button>
  );
}
