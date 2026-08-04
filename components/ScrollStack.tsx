"use client";

import { Children, useCallback, useEffect, useRef } from "react";
import "./ScrollStack.css";

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
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

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
}: ScrollStackProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const items = Children.toArray(children);

  const update = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const wrappers = Array.from(
      root.querySelectorAll<HTMLElement>(":scope > .scroll-stack-item")
    );
    if (!wrappers.length) return;

    // How far a card travels (px of scroll) while it shrinks the ones beneath it.
    const travel = Math.max(1, window.innerHeight * 0.6);

    // progress[i] — 0 when card i is still well below its pin point, 1 once pinned.
    const progress = wrappers.map((wrapper, i) => {
      const pin = stackTop + i * stackGap;
      const distanceToPin = wrapper.getBoundingClientRect().top - pin;
      return clamp01((travel - distanceToPin) / travel);
    });

    wrappers.forEach((wrapper, i) => {
      const card = wrapper.firstElementChild as HTMLElement | null;
      if (!card) return;

      // Every card stacked on top of this one presses it further back.
      let depth = 0;
      for (let j = i + 1; j < wrappers.length; j++) depth += progress[j];

      const scale = Math.max(0.72, 1 - depth * itemScale);
      const blur = depth * blurPerLevel;

      card.style.transform = `scale(${scale.toFixed(4)})`;
      card.style.filter = blur > 0.06 ? `blur(${blur.toFixed(2)}px)` : "";
    });
  }, [stackTop, stackGap, itemScale, blurPerLevel]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [update]);

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
