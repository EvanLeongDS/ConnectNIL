"use client";

import { useEffect, useState } from "react";

function postDebug(message: string, data: Record<string, unknown>, hypothesisId: string, runId: string) {
  // #region agent log
  fetch("http://127.0.0.1:7364/ingest/e4562ef6-100d-491e-9aae-be85661ee21a", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "742ebd",
    },
    body: JSON.stringify({
      sessionId: "742ebd",
      runId,
      hypothesisId,
      location: "components/ThemeToggle.tsx:18",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Sync DOM + state from persisted preference.
    const pref = localStorage.getItem("theme");
    const isDark = pref === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    setDark(isDark);
    if (!pref) localStorage.setItem("theme", "light");

    postDebug(
      "ThemeToggle mount sync",
      {
        pref,
        html_class: document.documentElement.className,
        html_has_dark: document.documentElement.classList.contains("dark"),
      },
      "H2",
      "pre-fix"
    );
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }

    postDebug(
      "ThemeToggle toggled",
      {
        next,
        stored: localStorage.getItem("theme"),
        html_class: document.documentElement.className,
        html_has_dark: document.documentElement.classList.contains("dark"),
      },
      "H3",
      "pre-fix"
    );
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
