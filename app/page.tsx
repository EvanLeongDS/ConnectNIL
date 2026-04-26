import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import Particles from "@/components/Particles";
import SpotlightCard from "@/components/SpotlightCard";
import LandingFaq from "@/components/landing/LandingFaq";
import TextAnimate from "@/components/landing/TextAnimate";

export default async function ConnectNILLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
      {/* Full-viewport WebGL background (fixed so it doesn’t scroll away) */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-white dark:bg-[#0d1117]" aria-hidden />
        <div className="absolute inset-0 z-[1]">
          <Particles
            particleCount={140}
            particleSpread={18}
            speed={0.07}
            particleColors={["#1f7ae0", "#251bb6", "#93c5fd"]}
            moveParticlesOnHover={true}
            alphaParticles={false}
            particleBaseSize={15}
            sizeRandomness={0}
            cameraDistance={20}
            disableRotation={false}
          />
        </div>
      </div>

      <div className="relative z-10 min-h-screen">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur dark:border-white/5 dark:bg-[#0d1117]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">

          {/* Brand — links home */}
          <Link href="/" className="flex items-center transition hover:opacity-75">
            {/* Light: multiply blends black ink onto any bg, white logo bg vanishes.
                Dark: invert turns it white, screen blend makes black (was white) vanish. */}
            <img
              src="/connectnil-logo.png"
              alt="ConnectNIL"
              className="h-8 w-auto [mix-blend-mode:multiply] dark:invert dark:[mix-blend-mode:screen]"
            />
          </Link>

          <div className="hidden items-center gap-10 md:flex">
            <a href="#how-it-works" className="text-base font-semibold text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white">
              How it works
            </a>
            <a href="#about-us" className="text-base font-semibold text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white">
              About us
            </a>
            <a href="#faq" className="text-base font-semibold text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white">
              FAQ
            </a>
            <Link href="/contact" className="text-base font-semibold text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white">
              Contact
            </Link>
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

      {/* ── Hero ── */}
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center px-6 py-20 md:px-10 md:py-28">
        <section className="w-full max-w-5xl">
          <TextAnimate
            as="h1"
            text="Creating NIL deals for those who want it."
            delay={100}
            stagger={55}
            className="max-w-5xl text-6xl font-black leading-[0.95] tracking-tight text-black dark:text-white sm:text-7xl md:text-8xl"
          />

          <TextAnimate
            as="p"
            text="The platform that connects teams and brands around the world."
            delay={600}
            stagger={45}
            className="mt-8 max-w-4xl text-2xl leading-relaxed text-black/50 dark:text-white/55 md:text-3xl"
          />

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/role" className="rounded-full bg-[#1f7ae0] px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:scale-[1.02]">
              Get Started
            </Link>
            <Link href="/login" className="rounded-full border border-black/15 bg-white px-7 py-3.5 text-base font-semibold text-black transition hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-black">
              Sign In
            </Link>
          </div>
        </section>
      </main>

      {/* ── How it works ── */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 pb-16 md:px-10">
        <div className="mb-10">
          <h2 className="text-3xl font-black tracking-tight text-black dark:text-[#93c5fd]">
            Season-long partnerships made simpler.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Teams join",
              text: "Athletes and teams create profiles, opt in, and show brands what they bring to the table.",
            },
            {
              title: "Brands connect",
              text: "Sponsors discover structured team opportunities instead of managing dozens of individual deals.",
            },
            {
              title: "Deals run smoothly",
              text: "Contracts, deliverables, and payments are organized in one place across the full season.",
            },
          ].map((item) => (
            <SpotlightCard
              key={item.title}
              className="rounded-[2.5rem] bg-[#dbeafe] p-8 shadow-sm dark:bg-[#1a2f5a] dark:shadow-none"
              spotlightColor="rgba(31, 122, 224, 0.44)"
            >
              <div className="relative pl-0.5 pt-0.5">
                <h3 className="text-xl font-bold text-[#1f7ae0] dark:text-[#93c5fd]">{item.title}</h3>
                <p className="mt-3 text-base leading-7 text-[#1f7ae0] dark:text-[#93c5fd]/80">{item.text}</p>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* ── About us ── */}
      <section id="about-us" className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:pb-20">
        <SpotlightCard
          className="rounded-[2.5rem] bg-[#dbeafe] p-8 shadow-sm dark:bg-[#1a2f5a] dark:shadow-none md:p-10"
          spotlightColor="rgba(31, 122, 224, 0.44)"
        >
          <h2 className="text-3xl font-black tracking-tight text-[#1f7ae0] dark:text-[#93c5fd]">About us</h2>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-[#1f7ae0] dark:text-[#93c5fd]/80">
            The idea for ConnectNIL arose in Boston University&apos;s entrepreneurship course, where we were tasked with creating a startup that can solve a real-world problem. We believe ConnectNIL can help fill a gap in the NIL market by providing a platform for teams and brands to connect and manage their partnerships.
          </p>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-[#1f7ae0] dark:text-[#93c5fd]/80">
            ConnectNIL helps teams and brands build organized, season-long NIL partnerships without the chaos of fragmented one-off deals. We focus on making the process simpler, more transparent, and easier to manage for everyone involved.
          </p>
        </SpotlightCard>
      </section>

      <LandingFaq />
      </div>
    </div>
  );
}
