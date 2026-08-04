import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/landing/SiteNav";
import SiteBackground from "@/components/landing/SiteBackground";
import SiteFooter from "@/components/landing/SiteFooter";
import SpotlightCard from "@/components/SpotlightCard";

export const metadata: Metadata = {
  title: "About Us — ConnectNIL",
  description: "Why we built ConnectNIL and what we're trying to fix in the NIL market.",
};

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip text-black dark:text-white">
      <SiteBackground />

      <div className="relative z-10 min-h-screen">
        <SiteNav />

        <main className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Our story</p>
          <h1 className="mt-3 text-5xl font-black leading-[1.05] tracking-tight md:text-6xl">
            About Us
          </h1>
          <p className="mt-5 max-w-3xl text-xl leading-relaxed text-black/70 dark:text-white/80">
            ConnectNIL exists to make season-long NIL partnerships something teams and brands
            actually want to manage.
          </p>

          <SpotlightCard
            className="mt-12 rounded-[2.5rem] bg-[#dbeafe] p-8 shadow-sm dark:bg-[#1a2f5a] dark:shadow-none md:p-10"
            spotlightColor="rgba(31, 122, 224, 0.44)"
          >
            <h2 className="text-2xl font-black tracking-tight text-[#1f7ae0] dark:text-[#93c5fd]">
              How it started
            </h2>
            <p className="mt-4 max-w-4xl text-lg leading-8 text-[#1f7ae0] dark:text-[#93c5fd]/80">
              The idea for ConnectNIL arose in Boston University&apos;s entrepreneurship course, where we were tasked with creating a startup that can solve a real-world problem. We believe ConnectNIL can help fill a gap in the NIL market by providing a platform for teams and brands to connect and manage their partnerships.
            </p>
            <p className="mt-4 max-w-4xl text-lg leading-8 text-[#1f7ae0] dark:text-[#93c5fd]/80">
              ConnectNIL helps teams and brands build organized, season-long NIL partnerships without the chaos of fragmented one-off deals. We focus on making the process simpler, more transparent, and easier to manage for everyone involved.
            </p>
          </SpotlightCard>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "For athletes",
                text: "Join a roster, opt into the deals you want, and submit deliverables without chasing paperwork.",
              },
              {
                title: "For teams",
                text: "Coordinate the roster and run partnerships that cover the whole season, not a single post.",
              },
              {
                title: "For brands",
                text: "Find structured team opportunities with clear deliverables, timelines, and compensation.",
              },
            ].map((item) => (
              <SpotlightCard
                key={item.title}
                className="rounded-[2rem] bg-[#dbeafe] p-7 shadow-sm dark:bg-[#1a2f5a] dark:shadow-none"
                spotlightColor="rgba(31, 122, 224, 0.44)"
              >
                <h3 className="text-lg font-bold text-[#1f7ae0] dark:text-[#93c5fd]">{item.title}</h3>
                <p className="mt-2 text-base leading-7 text-[#1f7ae0]/85 dark:text-[#93c5fd]/80">
                  {item.text}
                </p>
              </SpotlightCard>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link href="/role" className="rounded-full bg-[#1f7ae0] px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:scale-[1.02]">
              Get Started
            </Link>
            <Link href="/faq" className="rounded-full border border-black/15 bg-white px-7 py-3.5 text-base font-semibold text-black transition hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-black">
              Read the FAQ
            </Link>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
