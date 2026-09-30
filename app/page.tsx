import Link from "next/link";
import SiteNav from "@/components/landing/SiteNav";
import SiteBackground from "@/components/landing/SiteBackground";
import SiteFooter from "@/components/landing/SiteFooter";
import StageHero from "@/components/landing/StageHero";

export default function ConnectNILLandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip text-black dark:text-white">
      <SiteBackground />

      <div className="relative z-10 min-h-screen">
        {/* Overlaid, not in flow — the hero below has to own the viewport from
            the very first pixel so scrolling scrubs the stages instead of first
            pushing the nav out of the way. */}
        <SiteNav overlay />

        {/* ── Hero: pinned in place, scroll scrubs the four stages and the
            ball formations that go with them ── */}
        <StageHero />

        {/* ── Closing CTA ── */}
        <section className="mx-auto max-w-7xl px-6 pb-16 pt-24 text-center md:px-10">
          <h2 className="text-3xl font-black tracking-tight text-black dark:text-white md:text-4xl">
            Ready to build your season?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg leading-8 text-black/60 dark:text-white/70">
            Join as an athlete, team, or brand and start organizing NIL partnerships in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/role" className="rounded-full bg-[#1f7ae0] px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:scale-[1.02]">
              Get Started
            </Link>
            <Link href="/about" className="rounded-full border border-black/15 bg-white px-7 py-3.5 text-base font-semibold text-black transition hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-black">
              About Us
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
