import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/**
 * Async so the last link can follow the session, the same way SiteNav already does. A
 * signed-in visitor on /about used to see "Dashboard" in the header and "Login" in the
 * footer — and the footer link was a lie, since middleware bounces an authenticated user
 * off /login straight back to /dashboard.
 */
export default async function SiteFooter() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const links = [...LINKS, user ? { href: "/dashboard", label: "Dashboard" } : { href: "/login", label: "Login" }];

  return (
    <footer className="mx-auto max-w-7xl px-6 pb-14 md:px-10">
      <div className="flex flex-col gap-6 border-t border-black/10 pt-10 dark:border-white/10 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-black tracking-tight">ConnectNIL</p>
          <p className="mt-1 text-sm text-black/55 dark:text-white/55">
            Season-long NIL partnerships made simpler.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm font-semibold text-black/70 dark:text-white/70">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-black dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
