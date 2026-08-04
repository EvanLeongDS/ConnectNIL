"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import TextAnimate from "./TextAnimate";
import {
  REVEAL_RISE,
  STAGE_COUNT,
  clamp01,
  smoothstep,
  stageFromProgress,
  stageScroll,
} from "@/components/stageScroll";
import "./StageHero.css";

/* ─── Pinned four-stage hero ──────────────────────────────────────────────────
   The section is a tall scroll runway with a sticky child that holds one
   viewport. Scrolling it doesn't move anything — it scrubs a 0→1 progress value
   that selects which of the four copy panels is showing and, through
   stageScroll, which formation the background balls hold. Copy crossfades in
   place; the balls do the travelling.
────────────────────────────────────────────────────────────────────────────── */

const STAGES = [
  {
    title: "ConnectNIL",
    body: "The platform that connects teams and brands around the world.",
  },
  {
    title: "Teams join",
    body: "Athletes and teams create profiles, opt in, and show brands what they bring to the table.",
  },
  {
    title: "Brands connect",
    body: "Sponsors discover structured team opportunities instead of managing dozens of individual deals.",
  },
  {
    title: "Deals run smoothly",
    body: "Contracts, deliverables, and payments are organized in one place across the full season.",
  },
];

/** Share of the runway held back after progress hits 1, so the last stage can
    finish settling while the section is still pinned. */
const SETTLE_TAIL = 0.12;

export default function StageHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const fillsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [stage, setStage] = useState(0);
  const [reduced, setReduced] = useState(false);

  /* Tracked as state rather than read once: the CSS fallback below keys off the
     same query, so if the setting is flipped mid-session the stylesheet re-pins
     the hero and the driver has to come back with it — otherwise the runway
     becomes four blank screens. */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    /* Reduced motion keeps the CSS fallback: the runway collapses and all four
       stages render as ordinary stacked sections, so there's nothing to drive. */
    if (reduced) return;

    let raf = 0;
    let top = 0;
    let travel = 1;
    let smooth = 0;
    let shown = -1;

    /* Section geometry is only read on resize — never inside the frame loop,
       where a layout read after the background's style writes would force a
       synchronous reflow every frame. Scroll position is safe to read per frame:
       nothing here writes a property that dirties layout. */
    const measure = () => {
      top = section.getBoundingClientRect().top + window.scrollY;
      /* Progress is spread over only part of the runway, leaving the last
         SETTLE_TAIL of it as dead scroll. The frame loop eases toward the
         scroll position rather than snapping to it, so without that margin the
         section would unpin — the page starting to move again — while the final
         stage was still fading in. It now reaches its resting state and holds
         before anything below comes up. */
      travel = Math.max(1, (section.offsetHeight - window.innerHeight) * (1 - SETTLE_TAIL));
    };

    const progressNow = () => clamp01((window.scrollY - top) / travel);

    /* Each panel's own copy of the timeline: 0 when its stage begins, 1 when the
       next one does, negative while it's still coming. Its text starts faded and
       lifted and is fully out by the time its stage arrives, so the emerging is
       something you scroll through rather than something that fires at a
       boundary. Heading and body run on slightly offset windows, which keeps the
       stagger without any transition to trigger. */
    const paint = (progress: number) => {
      const panels = panelsRef.current;

      for (let k = 0; k < STAGE_COUNT; k++) {
        const panel = panels[k];
        if (!panel) continue;

        const u = progress * STAGE_COUNT - k;
        /* One panel is nearly gone before the next starts to show. These windows
           only just touch, because every panel sits in the same box: overlap any
           wider and a 8xl heading lingers as a legible ghost across the one
           replacing it. The first stage has nothing to emerge from and the last
           nothing to give way to, so they skip the corresponding ramp. */
        const arriving = k === 0 ? 1 : smoothstep(-0.14, 0.06, u);
        const leaving = k === STAGE_COUNT - 1 ? 1 : 1 - smoothstep(0.75, 0.92, u);
        const opacity = arriving * leaving;

        panel.style.opacity = opacity.toFixed(3);
        panel.style.visibility = opacity < 0.015 ? "hidden" : "visible";

        // Body copy trails the heading in and leads it out.
        const late = k === 0 ? 1 : smoothstep(-0.06, 0.14, u);
        const headRise = REVEAL_RISE * (1 - arriving) - REVEAL_RISE * 0.45 * (1 - leaving);
        const bodyRise = REVEAL_RISE * (1 - late) - REVEAL_RISE * 0.7 * (1 - leaving);
        panel.style.setProperty("--head-rise", `${headRise.toFixed(2)}px`);
        panel.style.setProperty("--body-rise", `${bodyRise.toFixed(2)}px`);

        // Ticks fill through their own stage, so the section always shows how far
        // along it is.
        const fill = fillsRef.current[k];
        if (fill) fill.style.transform = `scaleX(${clamp01(u).toFixed(3)})`;
      }
    };

    const tick = () => {
      smooth += (progressNow() - smooth) * 0.12;
      stageScroll.progress = smooth;
      paint(smooth);

      const next = stageFromProgress(smooth);
      if (next !== shown) {
        shown = next;
        setStage(next);
      }

      raf = requestAnimationFrame(tick);
    };

    measure();
    // Land where the scroll position already is — arriving on an anchor link, or
    // reloading mid-page, shouldn't replay the sequence from the start.
    smooth = progressNow();
    stageScroll.progress = smooth;
    stageScroll.pinned = true;
    paint(smooth);
    shown = stageFromProgress(smooth);
    setStage(shown);

    const observer = new ResizeObserver(measure);
    observer.observe(section);
    window.addEventListener("resize", measure);
    raf = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
      stageScroll.pinned = false;
      stageScroll.progress = 0;
      // Drop the inline values so the stylesheet takes over — that's what makes
      // the reduced-motion fallback readable if the setting is flipped on.
      for (const panel of panelsRef.current) {
        if (!panel) continue;
        panel.style.opacity = "";
        panel.style.visibility = "";
        panel.style.removeProperty("--head-rise");
        panel.style.removeProperty("--body-rise");
      }
    };
  }, [reduced]);

  return (
    <section ref={sectionRef} className="stage-hero">
      <div className="stage-hero-pin">
        <div className="stage-hero-scrim pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="stage-panels">
            {STAGES.map((item, i) => (
              /* Opacity and rise are set inline so the server-rendered markup
                 already shows the first stage and hides the rest; from mount on,
                 the frame loop owns them. */
              <div
                key={item.title}
                ref={(el) => {
                  panelsRef.current[i] = el;
                }}
                className="stage-panel"
                data-active={i === stage}
                style={
                  {
                    opacity: i === 0 ? 1 : 0,
                    visibility: i === 0 ? "visible" : "hidden",
                    "--head-rise": i === 0 ? "0px" : `${REVEAL_RISE}px`,
                    "--body-rise": i === 0 ? "0px" : `${REVEAL_RISE}px`,
                  } as React.CSSProperties
                }
              >
                {i === 0 ? (
                  <>
                    <TextAnimate
                      as="h1"
                      text={item.title}
                      delay={100}
                      stagger={55}
                      className="stage-panel-title max-w-5xl text-6xl font-black leading-[0.95] tracking-tight text-black dark:text-white sm:text-7xl md:text-8xl"
                    />
                    <TextAnimate
                      as="p"
                      text={item.body}
                      delay={250}
                      stagger={45}
                      className="stage-panel-body mt-8 max-w-3xl text-2xl font-medium leading-relaxed text-black/70 dark:text-white/90 md:text-3xl"
                    />
                  </>
                ) : (
                  <>
                    <h2 className="stage-panel-title max-w-3xl text-5xl font-black leading-[1] tracking-tight text-black dark:text-white md:text-6xl">
                      {item.title}
                    </h2>
                    <p className="stage-panel-body mt-6 max-w-2xl text-xl font-medium leading-relaxed text-black/70 dark:text-white/85 md:text-2xl">
                      {item.body}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Buttons and ticks sit outside the panel stack — they persist while
              the copy above them changes. */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/role"
              className="rounded-full bg-[#1f7ae0] px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:scale-[1.02]"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-black/15 bg-white px-7 py-3.5 text-base font-semibold text-black transition hover:bg-black hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-black"
            >
              Sign In
            </Link>
          </div>

          <div className="stage-dots mt-12 flex items-center gap-2" aria-hidden>
            {Array.from({ length: STAGE_COUNT }, (_, i) => (
              <span key={i} className="stage-dot" data-active={i === stage}>
                <span className="stage-dot-track" />
                {/* Separate element, not a child of the track: a track dimmed
                    with opacity would drag the fill down with it. */}
                <span
                  className="stage-dot-fill"
                  ref={(el) => {
                    fillsRef.current[i] = el;
                  }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
