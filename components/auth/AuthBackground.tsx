import SportsBalls from "@/components/SportsBalls";

/**
 * Full-viewport drifting sports balls behind the signed-out pages, replacing the WebGL dot
 * field that used to sit here.
 *
 * The field is blue-only, and that comes for free rather than from a filter: the red brand
 * balls render with display:none and are brought in only by the landing page's pinned hero
 * sequence. These pages have no StageHero, so stageScroll.pinned stays false, the formation
 * loop never advances past stage 0, and the resting field is the team-blue set. StageHero's
 * cleanup resets that shared state on unmount, so this holds even when a visitor navigates
 * here from the home page mid-scroll.
 *
 * Mirrors components/landing/SiteBackground.tsx, deliberately — the signed-out pages and the
 * marketing site should read as one surface.
 */
export default function AuthBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-white dark:bg-[#0d1117]" aria-hidden />
      <div className="absolute inset-0 z-[1] opacity-60 dark:opacity-70">
        <SportsBalls />
      </div>

      {/* These pages put their form straight on the background with no card, which the old
          dot field could sit behind harmlessly and a 90px soccer ball cannot. A radial scrim
          calms the middle column where the inputs are and leaves the balls legible at the
          edges. Light and dark are separate elements rather than one arbitrary Tailwind
          gradient so each ground colour is stated plainly. */}
      <div
        className="absolute inset-0 z-[2] dark:hidden"
        style={{
          background:
            "radial-gradient(ellipse 30rem 24rem at 50% 50%, rgba(255,255,255,0.94), rgba(255,255,255,0.6) 55%, rgba(255,255,255,0) 78%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 z-[2] hidden dark:block"
        style={{
          background:
            "radial-gradient(ellipse 30rem 24rem at 50% 50%, rgba(13,17,23,0.94), rgba(13,17,23,0.65) 55%, rgba(13,17,23,0) 78%)",
        }}
        aria-hidden
      />
    </div>
  );
}
