"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ─── Word-by-word reveal ─────────────────────────────────────────────────────
   The split happens in the markup rather than at runtime: the words are real
   server-rendered spans, with an aria-label on the parent, so the text is in the
   HTML for crawlers and read as one phrase by screen readers regardless of
   whether JS ever runs. The spans start hidden in CSS and GSAP tweens them in,
   staggered, the first time they scroll into view.

   `delay` and `stagger` stay in ms for the callers that already pass them that
   way; they're converted on the way into GSAP.
────────────────────────────────────────────────────────────────────────────── */

type Props = {
  text: string;
  className?: string;
  delay?: number;       // ms before the first word starts
  stagger?: number;     // ms between each word
  as?: "h1" | "h2" | "h3" | "p" | "span";
};

export default function TextAnimate({
  text,
  className = "",
  delay = 0,
  stagger = 60,
  as: Tag = "span",
}: Props) {
  const words = text.split(" ");
  const ref = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    const targets = el.querySelectorAll(".nil-word");

    /* Reduced motion still has to *arrive* — the words are hidden by their own
       class, so doing nothing here would leave the copy permanently invisible
       rather than merely unanimated. Show it, in one step. */
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(targets, { y: 0, opacity: 1 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      /* `to`, not `from`: the hidden state is the stylesheet's, which is what
         keeps the pre-hydration paint from flashing the full text. GSAP only
         needs to know where the words are going.

         once — this is an entrance. Scrolling back up and down again shouldn't
         replay it, and the trigger kills itself once it has fired. */
      gsap.to(targets, {
        y: 0,
        opacity: 1,
        duration: 0.55,
        delay: delay / 1000,
        stagger: stagger / 1000,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });

    return () => mm.revert();
  }, [delay, stagger, text]);

  return (
    // @ts-expect-error polymorphic ref
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} aria-hidden className="nil-word">
          {word}
          {/* Non-breaking space, not a plain one: the spans are inline-block,
              and an ordinary trailing space inside one collapses away, which
              would run the words together. */}
          {i < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </Tag>
  );
}
