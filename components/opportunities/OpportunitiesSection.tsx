import type { ReactNode } from "react";

type Variant = "incoming" | "outgoing";

const variantStyles: Record<
  Variant,
  { badge: string; bar: string; label: string }
> = {
  incoming: {
    label: "Interested in you",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    badge:
      "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/20 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-500/25",
  },
  outgoing: {
    label: "Your Discover outreach",
    bar: "bg-[#1f7ae0] dark:bg-[#3b8aed]",
    badge:
      "bg-[#1f7ae0]/12 text-[#1560b3] ring-1 ring-[#1f7ae0]/20 dark:bg-[#1f7ae0]/20 dark:text-[#93c5fd] dark:ring-[#1f7ae0]/30",
  },
};

export default function OpportunitiesSection({
  id,
  variant,
  title,
  description,
  children,
}: {
  id: string;
  variant: Variant;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const s = variantStyles[variant];

  return (
    <section id={id} className="scroll-mt-24">
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-md ring-1 ring-black/[0.03] dark:border-white/10 dark:bg-[#161b27] dark:ring-white/[0.04]">
        <div className="flex min-h-[120px] items-stretch">
          <div className={`w-1.5 shrink-0 ${s.bar}`} aria-hidden />
          <div className="min-w-0 flex-1 p-6 md:p-8">
            <header className="mb-6 border-b border-black/8 pb-6 dark:border-white/10">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${s.badge}`}
              >
                {s.label}
              </span>
              <h2 className="mt-4 text-xl font-bold tracking-tight text-black dark:text-white md:text-2xl">
                {title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/55 dark:text-white/45">
                {description}
              </p>
            </header>
            <div className="pt-1">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
