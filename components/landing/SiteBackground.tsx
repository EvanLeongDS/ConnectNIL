import SportsBalls from "@/components/SportsBalls";

/** Full-viewport drifting sports balls, fixed so they don't scroll away. */
export default function SiteBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-white dark:bg-[#0d1117]" aria-hidden />
      {/* Per-theme ceiling on the field. Light mode is only slightly held back —
          it earns its contrast from the deepened palette in SportsBalls.css
          rather than from being faded, which just pushed the balls into the
          background. The scroll ramp inside SportsBalls takes it from there. */}
      <div className="absolute inset-0 z-[1] opacity-[0.95] dark:opacity-100">
        <SportsBalls />
      </div>
    </div>
  );
}
