"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ProfilePageActions({ editHref }: { editHref: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:border-black/20 hover:bg-black/[0.03] dark:border-white/12 dark:bg-[#161b27] dark:text-white dark:hover:bg-white/5"
      >
        Actions
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#161b27]"
        >
          <Link
            role="menuitem"
            href={editHref}
            className="block px-4 py-2.5 text-sm font-medium text-black transition hover:bg-black/[0.04] dark:text-white dark:hover:bg-white/8"
            onClick={() => setOpen(false)}
          >
            Edit profile
          </Link>
        </div>
      )}
    </div>
  );
}
