"use client";

import { Children, useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./ScrollStack.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// useLayoutEffect so the first paint already carries GSAP's starting values;
// React warns about it during SSR, where it never runs anyway.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type ScrollStackProps = {
  children: React.ReactNode;
  className?: string;
  /** Viewport offset (px) where the first card pins — clear the sticky navbar. */
  stackTop?: number;
  /** Sliver (px) of each pinned card left visible under the next one. */
  stackGap?: number;
  /** Flow gap (px) between cards — how far you scroll between them. */
  itemDistance?: number;
  /** How much a card shrinks for each card stacked on top of it. */
  itemScale?: number;
  /** Blur (px) added per card stacked on top. */
  blurPerLevel?: number;
  /** Scrub smoothing (s) — how long the deck takes to catch up to the scroll. */
  smoothing?: number;
};

export function ScrollStackItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`scroll-stack-card ${className}`.trim()}>{children}</div>;
}

export default function ScrollStack({
  children,
  className = "",
  stackTop = 104,
  stackGap = 22,
  itemDistance = 96,
  itemScale = 0.05,
  blurPerLevel = 1.1,
  smoothing = 0.35,
}: ScrollStackProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const wrappers = Array.from(
      root.querySelectorAll<HTMLElement>(":scope > .scroll-stack-item")
    );
    if (!wrappers.length) return;

    const cards = wrappers.map(
      (wrapper) => wrapper.firstElementChild as HTMLElement | null
    );

    // Reduced motion is handled in the stylesheet, which unpins the deck
    // outright — so there's nothing for GSAP to drive.
    const mm = gsap.matchMedia(root);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // How far a card travels (px of scroll) while it presses the ones beneath
      // it back. A function so a resize re-reads it on ScrollTrigger.refresh().
      const travel = () => Math.max(1, window.innerHeight * 0.6);
      const pinOf = (i: number) => stackTop + i * stackGap;

      // depth[i] — 0 while card i is still well below its pin point, 1 once
      // pinned. GSAP owns the interpolation; the scrub adds the smoothing the
      // old rAF listener couldn't give us.
      const depth = new Array(wrappers.length).fill(0);

      const applyDepth = () => {
        cards.forEach((card, i) => {
          if (!card) return;

          // Every card stacked on top of this one presses it further back.
          let stacked = 0;
          for (let j = i + 1; j < wrappers.length; j++) stacked += depth[j];

          const blur = stacked * blurPerLevel;
          gsap.set(card, {
            scale: Math.max(0.72, 1 - stacked * itemScale),
            filter: blur > 0.06 ? `blur(${blur.toFixed(2)}px)` : "none",
          });
        });
      };

      wrappers.forEach((wrapper, i) => {
        const proxy = { p: 0 };

        gsap.to(proxy, {
          p: 1,
          ease: "none",
          scrollTrigger: {
            trigger: wrapper,
            // From `travel` px below this card's pin point, up to the pin itself.
            start: () => `top ${pinOf(i) + travel()}`,
            end: () => `top ${pinOf(i)}`,
            scrub: smoothing,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            depth[i] = proxy.p;
            applyDepth();
          },
        });
      });

      applyDepth();
    });

    return () => mm.revert();
  }, [stackTop, stackGap, itemScale, blurPerLevel, smoothing, items.length]);

  return (
    <div ref={rootRef} className={className}>
      {items.map((child, i) => (
        <div
          key={i}
          className="scroll-stack-item"
          style={{
            top: `${stackTop + i * stackGap}px`,
            zIndex: i + 1,
            marginBottom: i === items.length - 1 ? 0 : `${itemDistance}px`,
          }}
        >
          {child}
        </div>
      ))}
      {/* Lets the final card sit pinned for a beat before the section ends. */}
      <div aria-hidden style={{ height: "28vh" }} />
    </div>
  );
}
