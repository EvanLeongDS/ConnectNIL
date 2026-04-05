"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/auth/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  label: string;
  href: string;
}

interface DashboardNavProps {
  role: "athlete" | "brand-manager" | "team-manager";
  name: string;
}

const navItems: Record<DashboardNavProps["role"], NavItem[]> = {
  athlete: [
    { label: "Overview", href: "/dashboard/athlete-dashboard" },
    { label: "Discover", href: "/dashboard/athlete-dashboard/discover" },
    { label: "Deals", href: "/dashboard/athlete-dashboard/deals" },
    { label: "Profile", href: "/dashboard/athlete-dashboard/profile" },
  ],
  "brand-manager": [
    { label: "Overview", href: "/dashboard/brand-dashboard" },
    { label: "Discover", href: "/dashboard/brand-dashboard/discover" },
    { label: "Opportunities", href: "/dashboard/brand-dashboard/opportunities" },
    { label: "Deals", href: "/dashboard/brand-dashboard/deals" },
    { label: "Campaigns", href: "/dashboard/brand-dashboard/campaigns" },
    { label: "Profile", href: "/dashboard/brand-dashboard/profile" },
  ],
  "team-manager": [
    { label: "Overview", href: "/dashboard/team-dashboard" },
    { label: "Discover", href: "/dashboard/team-dashboard/discover" },
    { label: "Opportunities", href: "/dashboard/team-dashboard/opportunities" },
    { label: "Roster", href: "/dashboard/team-dashboard/roster" },
    { label: "Deals", href: "/dashboard/team-dashboard/deals" },
    { label: "Profile", href: "/dashboard/team-dashboard/profile" },
  ],
};

const roleLabel: Record<DashboardNavProps["role"], string> = {
  athlete: "Athlete",
  "brand-manager": "Brand",
  "team-manager": "Team",
};

export default function DashboardNav({ role, name }: DashboardNavProps) {
  const pathname = usePathname();
  const items = navItems[role];

  return (
    <nav className="sticky top-0 z-20 border-b border-black/6 bg-white/95 backdrop-blur-sm dark:border-white/6 dark:bg-[#0d1117]/95">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-0 md:px-10">
        {/* Logo */}
        <Link href="/" className="mr-4 shrink-0 py-4 text-base font-black tracking-tight text-black dark:text-white">
          ConnectNIL
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href.endsWith("/profile") && pathname.startsWith(`${item.href}/`)) ||
              (item.href.endsWith("/deals") && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-5 text-sm font-medium transition-colors ${
                  active
                    ? "text-[#1f7ae0]"
                    : "text-black/50 hover:text-black dark:text-white/45 dark:hover:text-white"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#1f7ae0]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 py-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-black dark:text-white">{name}</p>
            <p className="text-xs text-black/40 dark:text-white/35">{roleLabel[role]}</p>
          </div>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
