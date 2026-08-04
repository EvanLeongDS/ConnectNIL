import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/landing/SiteNav";
import SiteBackground from "@/components/landing/SiteBackground";
import SiteFooter from "@/components/landing/SiteFooter";
import SpotlightCard from "@/components/SpotlightCard";
import FaqAccordion from "@/components/landing/FaqAccordion";

export const metadata: Metadata = {
  title: "FAQ — ConnectNIL",
  description: "Quick answers about how ConnectNIL works for athletes, teams, and brands.",
};

export default function FaqPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip text-black dark:text-white">
      <SiteBackground />

      <div className="relative z-10 min-h-screen">
        <SiteNav />

        <main className="mx-auto max-w-4xl px-6 py-16 md:px-10 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Questions</p>
          <h1 className="mt-3 text-5xl font-black leading-[1.05] tracking-tight md:text-6xl">FAQ</h1>
          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-black/70 dark:text-white/80">
            Quick answers about how ConnectNIL works for athletes, teams, and brands.
          </p>

          <SpotlightCard
            className="mt-12 rounded-[2.5rem] bg-[#dbeafe] p-8 shadow-sm dark:bg-[#1a2f5a] dark:shadow-none md:p-10"
            spotlightColor="rgba(31, 122, 224, 0.44)"
          >
            <FaqAccordion />
          </SpotlightCard>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <p className="text-base text-black/60 dark:text-white/60">Still have a question?</p>
            <Link href="/contact" className="rounded-full bg-[#1f7ae0] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02]">
              Contact us
            </Link>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
