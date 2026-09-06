"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import TextAnimate from "./TextAnimate";
import { REVEAL_RISE, STAGE_COUNT, stageScroll } from "@/components/stageScroll";
import "./StageHero.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ─── Pinned four-stage hero ──────────────────────────────────────────────────
   The section is a tall scroll runway with a sticky child that holds one
   viewport. Scrolling it doesn't move anything — it scrubs a GSAP timeline whose
   playhead *is* the sequence: one second of timeline per stage, so a tween
   placed at 2.75 is three-quarters of the way through stage three. That timeline
   crossfades the copy panels, rises their text, fills the ticks, and hands its
   own progress to the background through stageScroll, which decides which
   formation the balls hold. Copy stays put; the balls do the travelling.
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

/** Scrub catch-up (s). Replaces the hand-rolled lerp toward scroll position —
    the stages ease into place instead of snapping frame-for-frame with input. */
const SCRUB = 0.6;

export default function StageHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const fillsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    /* matchMedia rather than a media-query listener of our own: it adds the
       driver when motion is allowed and reverts it if the setting is flipped
       mid-session, which is exactly when the stylesheet re-pins or unpins the
       hero underneath us. */
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      stageScroll.pinned = true;

      const panels = panelsRef.current;
      const fills = fillsRef.current;

      /* Progress is spread over only part of the runway, leaving the last
         SETTLE_TAIL of it as dead scroll. The scrub eases toward the scroll
         position rather than snapping to it, so without that margin the section
         would unpin — the page starting to move again — while the final stage
         was still fading in. */
      const travel = () =>
        Math.max(1, (section.offsetHeight - window.innerHeight) * (1 - SETTLE_TAIL));

      /* One second of timeline per stage. Nothing here plays on its own: the
         scrub drags the playhead, so every tween below is really a mapping from
         scroll position to state, and its ease is a curve through the stage
         rather than a curve through time. */
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${travel()}`,
          scrub: SCRUB,
          invalidateOnRefresh: true,
        },
        /* The background is a sibling outside this subtree and reads progress
           from a module-level object rather than through props, so hand it the
           playhead on every scrubbed frame. */
        onUpdate: () => {
          stageScroll.progress = tl.progress();
        },
      });

      STAGES.forEach((_, k) => {
        const panel = panels[k];

        if (panel) {
          const title = panel.querySelector(".stage-panel-title");
          const body = panel.querySelector(".stage-panel-body");

          /* A panel's copy starts faded and lifted and is fully in by the time
             its stage arrives, so the emerging is something you scroll through
             rather than something that fires at a boundary. The body trails the
             heading in by 0.08 of a stage — the stagger, expressed as timeline
             position instead of a transition delay.

             autoAlpha, not opacity: it parks visibility:hidden at zero, so a
             spent panel leaves the accessibility tree and stops taking pointer
             events without display:none disturbing the layout of the box all
             four share.

             The first stage has nothing to emerge from — it's the page's first
             paint, handled by TextAnimate — so it gets no arrival. */
          if (k > 0) {
            tl.fromTo(
              panel,
              { autoAlpha: 0 },
              { autoAlpha: 1, duration: 0.2, ease: "power1.inOut" },
              k - 0.14
            )
              .fromTo(
                title,
                { y: REVEAL_RISE },
                { y: 0, duration: 0.2, ease: "power2.out" },
                k - 0.14
              )
              .fromTo(
                body,
                { y: REVEAL_RISE },
                { y: 0, duration: 0.2, ease: "power2.out" },
                k - 0.06
              );
          }

          /* And out again, leading with the body. The exit only just clears the
             next panel's entrance, because every panel sits in the same box:
             overlap any wider and an 8xl heading lingers as a legible ghost
             across the one replacing it. immediateRender:false so building these
             doesn't stamp their start values over the arrival tweens above.

             The last stage has nothing to give way to, so it holds. */
          if (k < STAGE_COUNT - 1) {
            tl.to(
              panel,
              {
                autoAlpha: 0,
                duration: 0.17,
                ease: "power1.inOut",
                immediateRender: false,
              },
              k + 0.75
            )
              .to(
                title,
                { y: -REVEAL_RISE * 0.45, duration: 0.17, immediateRender: false },
                k + 0.75
              )
              .to(
                body,
                { y: -REVEAL_RISE * 0.7, duration: 0.17, immediateRender: false },
                k + 0.68
              );
          }
        }

        /* Ticks fill through their own stage — one whole second each — so the
           section always shows how far along it is. */
        if (fills[k]) {
          tl.fromTo(fills[k], { scaleX: 0 }, { scaleX: 1, duration: 1 }, k);
        }
      });

      /* Land where the scroll position already is — arriving on an anchor link,
         or reloading mid-page, shouldn't replay the sequence from stage one.
         Setting the playhead directly skips the scrub's catch-up for this frame. */
      const linked = tl.scrollTrigger;
      if (linked) {
        tl.progress(linked.progress);
        stageScroll.progress = tl.progress();
      }

      /* Where the pin lets go. The background is fixed to the viewport, which is
         what lets it hold the formations while the hero scrubs — but once the
         network has closed, the field has no business trailing the reader down
         into the copy below. Riding this value hands the balls back to the page
         at the moment the hero releases. Unsmoothed, unlike progress. */
      ScrollTrigger.create({
        trigger: section,
        start: "bottom bottom",
        end: "max",
        onUpdate: (self) => {
          stageScroll.release = Math.max(0, self.scroll() - self.start);
        },
        onLeaveBack: () => {
          stageScroll.release = 0;
        },
      });

      /* The timeline and its triggers belong to this matchMedia context, so GSAP
         kills them and restores every property it touched on the way out — which
         is what hands the panels back to the stylesheet if reduced motion is
         switched on mid-session. Only the shared scroll state is ours to reset. */
      return () => {
        stageScroll.pinned = false;
        stageScroll.progress = 0;
        stageScroll.release = 0;
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} className="stage-hero">
      <div className="stage-hero-pin">
        <div className="stage-hero-scrim pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="stage-panels">
            {STAGES.map((item, i) => (
              /* Visibility is set inline so the server-rendered markup already
                 shows the first stage and hides the rest; from mount on, the
                 timeline owns it (as autoAlpha, which writes both of these). */
              <div
                key={item.title}
                ref={(el) => {
                  panelsRef.current[i] = el;
                }}
                className="stage-panel"
                style={{
                  opacity: i === 0 ? 1 : 0,
                  visibility: i === 0 ? "visible" : "hidden",
                }}
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
              <span key={i} className="stage-dot">
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
