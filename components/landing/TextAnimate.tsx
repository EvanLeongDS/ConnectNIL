"use client";

import { useEffect, useRef, useState } from "react";

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
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    // @ts-expect-error polymorphic ref
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block translate-y-[0.35em] opacity-0 will-change-[transform,opacity]"
          style={
            visible
              ? {
                  animation: `nil-word-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                  animationDelay: `${delay + i * stagger}ms`,
                }
              : undefined
          }
        >
          {word}
          {i < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </Tag>
  );
}
