import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/* `overlay` takes the nav out of the document flow so the section below it
   starts at document y=0. The landing page needs that: its hero pins with
   `sticky top: 0`, and a nav occupying flow would mean scrolling the nav's own
   height before the hero's top reaches the viewport top — the page visibly
   creeping upward before the stage sequence starts. */
export default async function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav
      className={`${
        overlay ? "fixed inset-x-0" : "sticky"
      } top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur dark:border-white/5 dark:bg-[#0d1117]/90`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">

        {/* Brand — links home */}
        <Link
          href="/"
          className="flex items-center text-2xl font-black tracking-tight text-black transition hover:opacity-75 dark:text-white"
        >
          ConnectNIL
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-semibold text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/dashboard" className="rounded-full bg-[#1f7ae0] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-black">
                Login
              </Link>
              <Link href="/role" className="rounded-full bg-[#1f7ae0] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]">
                Sign Up
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
