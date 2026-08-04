/* ─── Shared scroll state for the pinned stage hero ──────────────────────────
   The hero (StageHero) and the background (SportsBalls) are siblings — the
   background is fixed to the viewport and lives outside the hero's subtree — so
   they can't pass scroll progress through props or context without re-rendering
   React on every frame. Instead the hero writes progress into this module-level
   object once per frame and the background reads it inside its own animation
   loop. No React involved, no renders, one source of truth.
────────────────────────────────────────────────────────────────────────────── */

export const STAGE_COUNT = 4;

/** Which of the four stages a 0→1 progress value lands in. */
export const stageFromProgress = (progress: number) =>
  Math.min(STAGE_COUNT - 1, Math.floor(progress * STAGE_COUNT));

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Hermite ramp: 0 at or below `from`, 1 at or above `to`, eased in between. */
export const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from || 1));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** px a stage's copy rises through as it emerges. */
export const REVEAL_RISE = 22;

export const stageScroll = {
  /** Smoothed 0→1 position through the pinned hero. */
  progress: 0,
  /** False on pages with no stage hero — the background then stays at rest. */
  pinned: false,
  /** px the page has scrolled past the end of the hero's runway — 0 for as long
      as the section is still pinned.

      The background is fixed to the viewport, which is what lets it hold the
      formations while the hero scrubs. But the network is the end of that story:
      once it has closed, the field has no business trailing the reader down into
      the copy below. Riding this value upward hands the balls back to the page at
      exactly the moment the hero lets go, so they scroll away with the section
      that built them. Unsmoothed, unlike `progress` — anything else would have
      the field sliding against the content it's supposed to be part of. */
  release: 0,
};
