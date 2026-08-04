"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_COUNT, clamp01, lerp, smoothstep, stageScroll } from "./stageScroll";
import "./SportsBalls.css";

/* ─── One-color 3D sports balls ───────────────────────────────────────────────
   Every ball is the same brand blue. Depth comes from three stacked layers:

     1. base    — the silhouette filled with a directional shading gradient
     2. surface — seams / stitching / laces; the only layer that spins
     3. shade   — limb darkening, bounce light, specular hot spot

   Keeping the light fixed while only the surface rotates is what makes these
   read as spinning spheres instead of spinning stickers. Baseball and soccer
   seams are projected from real 3D coordinates, so the panels foreshorten
   toward the silhouette the way they do on a real ball.
────────────────────────────────────────────────────────────────────────────── */

const LIT = "#a9d3fb";
const MID = "#2f8aeb";
const BASE = "#1f7ae0";
const SHADOW = "#0b3a76";
const DEEP = "#061c3a";
const THREAD = "#dbeafe";

const R = 48;
const C = 50;

/* The three layers of a ball must sit exactly on top of each other. That's
   structural, not decorative, so it's set inline — a missing or stale
   stylesheet would otherwise drop them into normal flow and deal each ball out
   as three separate pieces. SportsBalls.css only carries motion. */
const FILL: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

/* ─── 3D helpers ─────────────────────────────────────────────────────────── */

type V3 = [number, number, number];

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mul = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];
const sum = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Rotate around X, then around Y — used to pose each ball for the camera. */
const pose = (v: V3, ax: number, ay: number): V3 => {
  const [x, y, z] = v;
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  const z1 = y * Math.sin(ax) + z * Math.cos(ax);
  return [x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)];
};

/** Orthographic projection onto the 100×100 SVG grid. */
const project = (v: V3): [number, number] => [
  Math.round((C + R * v[0]) * 100) / 100,
  Math.round((C - R * v[1]) * 100) / 100,
];

const polyline = (pts: V3[]) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${project(p).join(" ")}`).join(" ");

/** Sample a closed curve on the unit sphere, posed for the camera. */
const sampleCurve = (fn: (t: number) => V3, n: number, ax: number, ay: number): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    out.push(pose(unit(fn((i / n) * Math.PI * 2)), ax, ay));
  }
  return out;
};

/** The stretches of a curve on the near side of the ball — the only ones you'd
    see. `closed` curves wrap; open ones (a panel edge with two loose ends) must
    not, or the first and last runs get spliced into one line across the ball. */
function frontRuns(pts: V3[], closed = true): V3[][] {
  const runs: V3[][] = [];
  let run: V3[] = [];
  for (const p of pts) {
    if (p[2] > 0) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  // A run straddling the start of the sample is one curve, not two. Shift
  // before indexing — the assignment target would otherwise be computed
  // against the pre-shift length and leave the fragment behind.
  if (closed && runs.length > 1 && pts[0][2] > 0 && pts[pts.length - 1][2] > 0) {
    const wrapped = runs.shift()!;
    runs[runs.length - 1] = runs[runs.length - 1].concat(wrapped);
  }
  return runs.filter((r) => r.length > 3);
}

/* ─── Basketball ──────────────────────────────────────────────────────────────
   A real basketball's cover is eight panels bounded by two great circles that
   meet at 90° at opposite poles, plus one long channel shaped like a figure
   eight that crosses both of them. Posed so the poles tilt toward the camera:
   the great circles then read as the familiar crossing pair, and the two near
   humps of the figure eight become the curves that bow out toward the rim.
────────────────────────────────────────────────────────────────────────────── */

const BASKETBALL = (() => {
  const AX = 0.22;
  const AY = -0.18;
  const N = 220;

  const circleA = sampleCurve((t) => [0, Math.cos(t), Math.sin(t)], N, AX, AY);
  const circleB = sampleCurve((t) => [Math.cos(t), 0, Math.sin(t)], N, AX, AY);
  const eight = sampleCurve(
    (t) => [Math.cos(t), Math.sin(t), 0.62 * Math.cos(2 * t)],
    N,
    AX,
    AY
  );

  return [...frontRuns(circleA), ...frontRuns(circleB), ...frontRuns(eight)].map(polyline);
})();

/* ─── Baseball: the classic two-lobe seam, front hemisphere only ─────────── */

const BASEBALL = (() => {
  // Two humps up, two down: the tennis-ball curve a baseball cover traces.
  const runs = frontRuns(
    sampleCurve((t) => [Math.cos(t), Math.sin(t), 0.78 * Math.cos(2 * t)], 240, 0.4, -0.45)
  );
  const seams = runs.map(polyline);

  // Stitches straddle the seam, angled and foreshortened by depth.
  const stitches: string[] = [];
  for (const r of runs) {
    for (let i = 4; i < r.length - 4; i += 9) {
      const [x, y] = project(r[i]);
      const [px, py] = project(r[i - 3]);
      const [nx, ny] = project(r[i + 3]);
      const tx = nx - px;
      const ty = ny - py;
      const tl = Math.hypot(tx, ty) || 1;
      // Perpendicular to the seam, shortened as the seam turns away from us.
      const len = 3.6 * (0.45 + 0.55 * r[i][2]);
      const ox = (-ty / tl) * len;
      const oy = (tx / tl) * len;
      const lean = i % 18 === 4 ? 0.42 : -0.42;
      const lx = (tx / tl) * len * lean;
      const ly = (ty / tl) * len * lean;
      stitches.push(
        `M${(x + ox + lx).toFixed(2)} ${(y + oy + ly).toFixed(2)} L${(x - ox + lx).toFixed(2)} ${(
          y -
          oy +
          ly
        ).toFixed(2)}`
      );
    }
  }

  return { seams, stitches: stitches.join(" ") };
})();

/* ─── Tennis ball ─────────────────────────────────────────────────────────────
   The same two-lobe curve a baseball's cover traces — that's genuinely the same
   geometry — so what separates the two is how it's painted: one broad soft band
   instead of a thin seam flanked by stitching.
────────────────────────────────────────────────────────────────────────────── */

const TENNIS = frontRuns(
  sampleCurve((t) => [Math.cos(t), Math.sin(t), 0.8 * Math.cos(2 * t)], 240, -0.28, 0.62)
).map(polyline);

/* ─── Volleyball ──────────────────────────────────────────────────────────────
   Eighteen panels: six square regions, each split into three parallel bands.
   Those six squares are a cube blown out onto the sphere, so each face is mapped
   the way a cube map is — normalize(n + a·u + b·v) over a, b ∈ [-1, 1] — and its
   lines are the four of constant a (two face edges, two band dividers) plus the
   two remaining edges. Each face takes its band direction from the next axis
   round, which is what makes neighbouring faces read perpendicular.
────────────────────────────────────────────────────────────────────────────── */

const VOLLEYBALL = (() => {
  const AX = 0.3;
  const AY = 0.55;
  const N = 44;
  const UNIT: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const lines: string[] = [];

  for (let ai = 0; ai < 3; ai++) {
    for (const sign of [1, -1]) {
      const n = mul(UNIT[ai], sign);
      const u = UNIT[(ai + 1) % 3];
      const v = UNIT[(ai + 2) % 3];

      const trace = (fixed: number, vary: "a" | "b") => {
        const pts: V3[] = [];
        for (let k = 0; k <= N; k++) {
          const t = -1 + (2 * k) / N;
          const a = vary === "a" ? t : fixed;
          const b = vary === "a" ? fixed : t;
          pts.push(pose(unit(sum(n, sum(mul(u, a), mul(v, b)))), AX, AY));
        }
        // Back faces contribute nothing: frontRuns drops everything behind the
        // limb, so there's no need to cull them up front.
        for (const run of frontRuns(pts, false)) lines.push(polyline(run));
      };

      for (const a of [-1, -1 / 3, 1 / 3, 1]) trace(a, "b");
      for (const b of [-1, 1]) trace(b, "a");
    }
  }

  return lines;
})();

/* ─── Soccer ball: pentagons projected off a real truncated icosahedron ──── */

const SOCCER = (() => {
  const PHI = (1 + Math.sqrt(5)) / 2;

  // Icosahedron vertices = the pentagon centers of a truncated icosahedron.
  const centers: V3[] = [];
  for (const a of [1, -1]) {
    for (const b of [1, -1]) {
      centers.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    }
  }

  const ALPHA = 0.3505; // angular radius of a pentagon face
  const BETA = 0.4066; // angular length of one hexagon edge

  const panels: { points: string; z: number }[] = [];
  const seams: string[] = [];

  for (const c of centers) {
    const n = pose(unit(c), 0.36, 0.52);
    if (n[2] < 0.015) continue; // on the far side

    const ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(n, ref));
    const v = cross(n, u);

    const verts: V3[] = [];
    for (let k = 0; k < 5; k++) {
      const th = (k * 2 * Math.PI) / 5;
      const dir = sum(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      verts.push(sum(mul(n, Math.cos(ALPHA)), mul(dir, Math.sin(ALPHA))));

      // Seam running outward from each pentagon corner to a hexagon junction.
      const stub: V3[] = [];
      for (let s = 0; s <= 4; s++) {
        const ang = ALPHA + (BETA * s) / 4;
        const p = sum(mul(n, Math.cos(ang)), mul(dir, Math.sin(ang)));
        if (p[2] > 0.02) stub.push(p);
      }
      if (stub.length > 1) seams.push(polyline(stub));
    }

    panels.push({ points: verts.map((p) => project(p).join(",")).join(" "), z: n[2] });
  }

  // Nearer panels paint last so overlaps at the limb resolve correctly.
  panels.sort((a, b) => a.z - b.z);

  return { panels, seams };
})();

/* ─── Football silhouette ────────────────────────────────────────────────── */

const FOOTBALL_PATH =
  "M50 2C63.5 13.5 84 30.5 84 50S63.5 86.5 50 98C36.5 86.5 16 69.5 16 50S36.5 13.5 50 2Z";

/* ─── Shared gradients, pattern and clips ───────────────────────────────── */

function BallDefs() {
  return (
    <svg
      className="sports-balls-defs"
      aria-hidden
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* Body shading — key light from the upper left. */}
        <radialGradient id="cnBallBody" cx="0.34" cy="0.27" r="0.82">
          <stop offset="0%" stopColor={LIT} />
          <stop offset="26%" stopColor={MID} />
          <stop offset="55%" stopColor={BASE} />
          <stop offset="82%" stopColor={SHADOW} />
          <stop offset="100%" stopColor={DEEP} />
        </radialGradient>

        {/* Limb darkening — deepens the silhouette over the seams. */}
        <radialGradient id="cnBallLimb" cx="0.42" cy="0.36" r="0.72">
          <stop offset="55%" stopColor={DEEP} stopOpacity="0" />
          <stop offset="88%" stopColor={DEEP} stopOpacity="0.42" />
          <stop offset="100%" stopColor="#03101f" stopOpacity="0.82" />
        </radialGradient>

        {/* Bounce light skimming the lower-right edge. */}
        <radialGradient id="cnBallRim" cx="0.74" cy="0.79" r="0.56">
          <stop offset="60%" stopColor={LIT} stopOpacity="0" />
          <stop offset="90%" stopColor={LIT} stopOpacity="0.34" />
          <stop offset="100%" stopColor="#e8f3ff" stopOpacity="0.06" />
        </radialGradient>

        {/* Specular hot spot. */}
        <radialGradient id="cnBallSpec" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* Pebbled leather. */}
        <pattern id="cnBallPebble" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="0.85" fill={DEEP} opacity="0.22" />
          <circle cx="3.7" cy="3.7" r="0.85" fill={DEEP} opacity="0.22" />
          <circle cx="3.7" cy="1.2" r="0.55" fill={LIT} opacity="0.16" />
          <circle cx="1.2" cy="3.7" r="0.55" fill={LIT} opacity="0.16" />
        </pattern>

        {/* Bloom for the chain's rails. Deliberately an SVG filter and not a CSS
            one: the links layer spans the whole viewport, and a CSS filter on an
            element that big makes Chromium tile the filter region, leaving faint
            vertical seams across the page. An SVG filter region is measured from
            the group's bounding box — just the chain — so there's nothing to
            tile. */}
        <filter id="cnLinkGlow" x="-25%" y="-8%" width="150%" height="116%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="3.5"
            style={{ floodColor: "var(--cn-glow)", floodOpacity: 0.95 }}
          />
        </filter>

        <clipPath id="cnClipSphere">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
        <clipPath id="cnClipFootball">
          <path d={FOOTBALL_PATH} />
        </clipPath>
      </defs>
    </svg>
  );
}

/* ─── Layers ─────────────────────────────────────────────────────────────── */

type Shape = "sphere" | "football";

function Base({ shape, texture }: { shape: Shape; texture: boolean }) {
  const body =
    shape === "sphere" ? (
      <circle cx="50" cy="50" r="48" fill="url(#cnBallBody)" />
    ) : (
      <path d={FOOTBALL_PATH} fill="url(#cnBallBody)" />
    );
  const clip = shape === "sphere" ? "url(#cnClipSphere)" : "url(#cnClipFootball)";
  return (
    <>
      {body}
      {texture && (
        <g clipPath={clip} opacity="0.55">
          <rect x="0" y="0" width="100" height="100" fill="url(#cnBallPebble)" />
        </g>
      )}
    </>
  );
}

function Shade({ shape }: { shape: Shape }) {
  const paint = (fill: string, opacity?: number) =>
    shape === "sphere" ? (
      <circle cx="50" cy="50" r="48" fill={fill} opacity={opacity} />
    ) : (
      <path d={FOOTBALL_PATH} fill={fill} opacity={opacity} />
    );
  return (
    <>
      {paint("url(#cnBallLimb)")}
      {paint("url(#cnBallRim)")}
      <ellipse
        cx="34"
        cy="28"
        rx={shape === "sphere" ? 15 : 11}
        ry={shape === "sphere" ? 10 : 8}
        fill="url(#cnBallSpec)"
        transform="rotate(-32 34 28)"
      />
    </>
  );
}

/* ─── Spinning surface detail, per ball type ─────────────────────────────── */

function BasketballSurface() {
  const channels = BASKETBALL.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* Recessed channels: a light lip along the lower edge, then the groove. */}
      <g stroke={LIT} strokeWidth="1.3" opacity="0.3" transform="translate(0 1.6)">
        {channels}
      </g>
      <g stroke="#03101f" strokeWidth="3.4" opacity="0.9">
        {channels}
      </g>
    </g>
  );
}

function BaseballSurface() {
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      <g stroke="#0a2f5f" strokeWidth="1.6" opacity="0.5">
        {BASEBALL.seams.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d={BASEBALL.stitches} stroke={THREAD} strokeWidth="1.5" opacity="0.85" />
      <path d={BASEBALL.stitches} stroke="#0a2f5f" strokeWidth="0.6" opacity="0.35" transform="translate(0 1)" />
    </g>
  );
}

function TennisSurface() {
  const band = TENNIS.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* A soft shadow under the band, then the band itself. */}
      <g stroke="#0a2f5f" strokeWidth="5.4" opacity="0.3" transform="translate(0 1.5)">
        {band}
      </g>
      <g stroke={THREAD} strokeWidth="4.2" opacity="0.85">
        {band}
      </g>
    </g>
  );
}

function VolleyballSurface() {
  const panels = VOLLEYBALL.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* Recessed panel seams: a lit lip along the lower edge, then the groove. */}
      <g stroke={LIT} strokeWidth="1" opacity="0.26" transform="translate(0 1.2)">
        {panels}
      </g>
      <g stroke="#04162e" strokeWidth="1.9" opacity="0.68">
        {panels}
      </g>
    </g>
  );
}

function SoccerSurface() {
  return (
    <g clipPath="url(#cnClipSphere)">
      <g fill="#08305f" opacity="0.9" stroke="#04162e" strokeWidth="0.8" strokeLinejoin="round">
        {SOCCER.panels.map((p, i) => (
          <polygon key={i} points={p.points} />
        ))}
      </g>
      <g fill="none" stroke="#04162e" strokeWidth="1.5" strokeLinecap="round" opacity="0.62">
        {SOCCER.seams.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

function FootballSurface() {
  return (
    <g clipPath="url(#cnClipFootball)" fill="none" strokeLinecap="round">
      {/* panel seams down the length */}
      <g stroke="#04162e" strokeWidth="1.3" opacity="0.45">
        <path d="M50 4C40 20 36 34 36 50s4 30 14 46" />
        <path d="M50 4c10 16 14 30 14 46s-4 30-14 46" />
      </g>
      {/* end stripes */}
      <g stroke={THREAD} strokeWidth="2.8" opacity="0.7">
        <path d="M32.5 20.5c11.5-4.5 23.5-4.5 35 0" />
        <path d="M32.5 79.5c11.5 4.5 23.5 4.5 35 0" />
      </g>
      {/* laces, with a shadow line beneath each rung */}
      <path d="M50 32.5v35" stroke="#04162e" strokeWidth="1.6" opacity="0.55" />
      <g stroke="#04162e" strokeWidth="2.6" opacity="0.4" transform="translate(0 1.3)">
        <path d="M42.5 38h15M42.5 45h15M42.5 52h15M42.5 59h15M42.5 66h15" />
      </g>
      <g stroke={THREAD} strokeWidth="2.4" opacity="0.88">
        <path d="M42.5 38h15M42.5 45h15M42.5 52h15M42.5 59h15M42.5 66h15" />
      </g>
    </g>
  );
}

/* `rigid` balls spin as one piece. A sphere's outline looks the same at every
   rotation, so only its surface needs to turn while the light stays put — but a
   football's doesn't, so its outline, surface and shading have to turn together
   or the silhouette tears apart. */
const TYPES = {
  basketball: { shape: "sphere" as Shape, texture: true, rigid: false, Surface: BasketballSurface },
  baseball: { shape: "sphere" as Shape, texture: false, rigid: false, Surface: BaseballSurface },
  soccer: { shape: "sphere" as Shape, texture: false, rigid: false, Surface: SoccerSurface },
  football: { shape: "football" as Shape, texture: true, rigid: true, Surface: FootballSurface },
  tennis: { shape: "sphere" as Shape, texture: true, rigid: false, Surface: TennisSurface },
  volleyball: { shape: "sphere" as Shape, texture: false, rigid: false, Surface: VolleyballSurface },
} as const;

/* ─── Field layout ───────────────────────────────────────────────────────────
   Fixed (never random) so server and client markup agree. Sizes are in vmin so
   the field scales with the viewport; placement leans to the edges and the
   right half to stay clear of the hero copy.

   These are the resting positions — where the balls sit at stage 0. Scrolling
   the pinned hero pulls them into the formations built in `formations()` below.
────────────────────────────────────────────────────────────────────────────── */

type Ball = {
  type: keyof typeof TYPES;
  /** vmin */
  size: number;
  left: number;
  top: number;
  opacity: number;
  /** px of blur — depth of field */
  blur?: number;
  /** sway reach either side of the resting spot, px */
  dx: number;
  dy: number;
  /** seconds for one sway across; a full round trip is twice this. The two
      periods are deliberately unequal per ball so the path keeps changing. */
  driftX: number;
  driftY: number;
  /** seconds */
  spin: number;
  delay: number;
  reverse?: boolean;
};

const BALLS: Ball[] = [
  { type: "basketball", size: 26, left: 72, top: 8,  opacity: 0.85, dx: 22, dy: 16, driftX: 19, driftY: 13, spin: 90, delay: 0 },
  { type: "football",   size: 20, left: 86, top: 52, opacity: 0.8,  dx: 16, dy: 21, driftX: 23, driftY: 15, spin: 64, delay: -6, reverse: true },
  { type: "baseball",   size: 12, left: 61, top: 74, opacity: 0.85, dx: 18, dy: 14, driftX: 16, driftY: 11, spin: 46, delay: -3 },
  { type: "soccer",     size: 16, left: 44, top: 12, opacity: 0.6,  dx: 20, dy: 15, driftX: 24, driftY: 17, spin: 78, delay: -11, reverse: true },
  { type: "basketball", size: 10, left: 33, top: 62, opacity: 0.62, dx: 17, dy: 19, driftX: 14, driftY: 20, spin: 40, delay: -8 },
  { type: "soccer",     size: 9,  left: 8,  top: 22, opacity: 0.7,  dx: 15, dy: 18, driftX: 18, driftY: 12, spin: 52, delay: -5, reverse: true },
  { type: "baseball",   size: 22, left: 2,  top: 55, opacity: 0.4,  blur: 3, dx: 19, dy: 13, driftX: 25, driftY: 18, spin: 96, delay: -2 },
  { type: "soccer",     size: 13, left: 92, top: 26, opacity: 0.62, blur: 1, dx: 13, dy: 17, driftX: 21, driftY: 14, spin: 58, delay: -16 },
  { type: "football",   size: 11, left: 15, top: 4,  opacity: 0.68, dx: 16, dy: 15, driftX: 17, driftY: 23, spin: 44, delay: -9, reverse: true },
  { type: "baseball",   size: 15, left: 78, top: 90, opacity: 0.62, blur: 1, dx: 18, dy: 16, driftX: 22, driftY: 16, spin: 68, delay: -12 },
  { type: "tennis",     size: 10, left: 66, top: 40, opacity: 0.66, dx: 14, dy: 17, driftX: 15, driftY: 21, spin: 38, delay: -7, reverse: true },
  { type: "volleyball", size: 18, left: 20, top: 36, opacity: 0.5,  blur: 2, dx: 17, dy: 14, driftX: 26, driftY: 19, spin: 84, delay: -4 },
];

/* ─── Formations ──────────────────────────────────────────────────────────────
   One slot per ball per stage, in viewport pixels: where its centre goes and how
   wide it should be there. Sizes are derived from the spacing of whatever shape
   they belong to rather than picked by hand, so nothing collides at any
   viewport — a tighter chain simply means smaller balls.

     0  scattered   the resting field
     1  huddle      one ring, evenly spaced — teams gathering
     2  two files   left and right, facing each other — teams meet brands
     3  chain       the files zip into one alternating column — the deal
────────────────────────────────────────────────────────────────────────────── */

type Slot = { x: number; y: number; size: number };

/** Balls at even indices take the left of a formation, odd ones the right. */
const isLeft = (i: number) => i % 2 === 0;

function formations(): Slot[][] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh);
  const n = BALLS.length;

  /* Formations gather in the gutter to the right of the hero copy. Below ~900px
     there is no gutter, so they run down the middle and the hero's scrim is what
     keeps the copy readable over them. */
  const wide = vw >= 900;
  const cx = wide ? vw * 0.735 : vw * 0.5;
  const cy = vh * 0.5;
  const reach = wide ? Math.min(vw * 0.115, vh * 0.3) : Math.min(vw * 0.32, vh * 0.28);

  const scattered = BALLS.map((ball) => {
    const size = (ball.size / 100) * vmin;
    return {
      x: (ball.left / 100) * vw + size / 2,
      y: (ball.top / 100) * vh + size / 2,
      size,
    };
  });

  /* Ring: neighbours sit a chord apart, so that chord sets the ball size. The
     ring is squashed vertically to sit better in a landscape gutter, which
     pinches the gap between neighbours at the left and right extremes — so the
     squash has to come off the size too, or those two pairs collide. */
  const SQUASH = 0.88;
  const ringGap = 2 * reach * Math.sin(Math.PI / n) * SQUASH;
  const huddle = BALLS.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + reach * Math.cos(a),
      y: cy + reach * SQUASH * Math.sin(a),
      size: ringGap * 0.92,
    };
  });

  /* Row and link spacing are capped by how much height there is to divide, not
     by a fixed fraction of the viewport — add balls and the ranks tighten rather
     than running off the top and bottom of the screen. */
  const rowGap = Math.min((vh * 0.78) / (n / 2), reach * 0.62);
  const files = BALLS.map((_, i) => ({
    x: cx + (isLeft(i) ? -1 : 1) * reach * 0.74,
    y: cy + (Math.floor(i / 2) - (n / 2 - 1) / 2) * rowGap,
    size: rowGap * 0.78,
  }));

  const linkGap = Math.min((vh * 0.8) / n, reach * 0.42);
  const chain = BALLS.map((_, i) => ({
    x: cx + (isLeft(i) ? -1 : 1) * reach * 0.15,
    y: cy + (i - (n - 1) / 2) * linkGap,
    size: linkGap * 0.9,
  }));

  return [scattered, huddle, files, chain];
}

/** Where a 0→1 scroll position sits between two formations.

    The four formations are spread evenly across the whole runway — milestones at
    0, ⅓, ⅔ and 1 — with no held stretches at either end of a leg. Every pixel of
    scroll therefore moves the field: the balls converge continuously as you go,
    instead of sitting still and then jumping when a stage flips. Each leg is
    eased, so a formation reads clearly as it closes up — but the ease is mixed
    with a straight ramp, because a pure smoothstep has zero velocity at each
    milestone and that momentary stall is the very thing that made the old
    version feel like it was flipping between states. */
const EASE_MIX = 0.65;

function blend(progress: number) {
  const legs = STAGE_COUNT - 1;
  const u = clamp01(progress) * legs;
  const from = Math.min(legs - 1, Math.floor(u));
  const t = u - from;
  const eased = t * t * (3 - 2 * t);
  return { from, t: t + (eased - t) * EASE_MIX };
}

const points = (slots: Slot[], pick: (i: number) => boolean) =>
  slots.reduce(
    (out, s, i) => (pick(i) ? `${out}${s.x.toFixed(1)},${s.y.toFixed(1)} ` : out),
    ""
  );

export default function SportsBalls({ className = "" }: { className?: string }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<SVGSVGElement>(null);
  const rungsRef = useRef<SVGPolylineElement>(null);
  const leftRailRef = useRef<SVGPolylineElement>(null);
  const rightRailRef = useRef<SVGPolylineElement>(null);
  const [reduced, setReduced] = useState(false);

  /* Watched rather than read once, so flipping the setting mid-session brings the
     motion back with the stylesheet instead of leaving the field half-dead. */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /* Pointer parallax, plus the scroll-driven formations. Both live in one frame
     loop: they write to the same elements, and splitting them would mean two
     passes clobbering each other's transforms. */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (reduced) return;

    const seats = Array.from(field.querySelectorAll<HTMLElement>(".sports-ball-seat"));
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    let slots = formations();
    // Last value written per seat, so the expensive properties are only touched
    // when they actually change.
    const lastAmp = seats.map(() => -1);
    const lastFilter = seats.map(() => " ");
    let lastLinks = -1;

    const live: Slot[] = BALLS.map(() => ({ x: 0, y: 0, size: 0 }));

    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * -28;
      target.y = (e.clientY / window.innerHeight - 0.5) * -28;
    };

    const onResize = () => {
      slots = formations();
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      field.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;

      const progress = stageScroll.pinned ? stageScroll.progress : 0;
      const { from, t } = blend(progress);
      const a = slots[from];
      const b = slots[from + 1];

      /* How far out of the resting scatter the field is — drives how still and
         how sharp the balls become as they gather. Tied to the first leg, which
         now ends at ⅓ of the runway. */
      const gathered = smoothstep(0.02, 0.3, progress);
      const amp = 1 - 0.82 * gathered;

      /* The field comes up out of the background as the sequence runs: faint
         behind the opening headline, full strength by the time the chain closes.
         The per-theme ceiling lives on the wrapper in SiteBackground, so this one
         ramp brightens correctly against both white and #0d1117. */
      const brightness = smoothstep(0.02, 0.95, progress);
      field.style.opacity = `${lerp(0.55, 1, brightness).toFixed(3)}`;

      // The bloom builds alongside it and is strongest as the chain closes at the
      // very end — the deal lighting up as it comes together.
      const glow = smoothstep(0.04, 0.96, progress);

      seats.forEach((seat, i) => {
        const rest = slots[0][i];
        const x = lerp(a[i].x, b[i].x, t);
        const y = lerp(a[i].y, b[i].y, t);
        const size = lerp(a[i].size, b[i].size, t);

        live[i].x = x;
        live[i].y = y;
        live[i].size = size;

        const scale = rest.size > 0 ? size / rest.size : 1;
        seat.style.transform = `translate3d(${(x - rest.x).toFixed(2)}px, ${(
          y - rest.y
        ).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;

        const nextAmp = Math.round(amp * 50) / 50;
        if (nextAmp !== lastAmp[i]) {
          lastAmp[i] = nextAmp;
          seat.style.setProperty("--amp", `${nextAmp}`);
        }

        /* Two things share the filter: depth-of-field blur, which burns off as a
           ball joins a formation (a ball in rank is a ball in focus), and the
           bloom, which grows with it. Both are quantised and compared as one
           string, so a filter — the costliest thing written here — is only
           rewritten when it would actually look different. */
        const dof = Math.round((BALLS[i].blur ?? 0) * (1 - gathered) * 4) / 4;
        // Two shadows, tight over wide: one shadow reads as a flat outline,
        // while a bright core inside a soft falloff reads as light coming off
        // the ball.
        const halo = Math.round(glow * size * 0.55 * 2) / 2;
        const filter =
          (dof > 0 ? `blur(${dof}px) ` : "") +
          (halo > 0
            ? `drop-shadow(0 0 ${halo * 0.4}px var(--cn-glow)) drop-shadow(0 0 ${halo}px var(--cn-glow))`
            : "");
        if (filter !== lastFilter[i]) {
          lastFilter[i] = filter;
          seat.style.filter = filter;
        }
      });

      /* Rails and rungs only mean anything once the chain forms, so they fade in
         across the last leg and track the live positions while it assembles. */
      const linkFade = Math.round(smoothstep(0.7, 0.96, progress) * 100) / 100;
      if (linkFade !== lastLinks) {
        lastLinks = linkFade;
        if (linksRef.current) linksRef.current.style.opacity = `${linkFade}`;
      }
      if (linkFade > 0) {
        rungsRef.current?.setAttribute("points", points(live, () => true));
        leftRailRef.current?.setAttribute("points", points(live, isLeft));
        rightRailRef.current?.setAttribute("points", points(live, (i) => !isLeft(i)));
      }

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      // Hand the balls back to the stylesheet, or they'd freeze wherever the
      // last frame left them.
      field.style.transform = "translate3d(0,0,0)";
      field.style.opacity = "";
      seats.forEach((seat, i) => {
        seat.style.transform = "";
        seat.style.removeProperty("--amp");
        seat.style.filter = BALLS[i].blur ? `blur(${BALLS[i].blur}px)` : "";
      });
    };
  }, [reduced]);

  return (
    <div
      className={`sports-balls ${className}`.trim()}
      aria-hidden
      style={{ position: "absolute", inset: 0 }}
    >
      <BallDefs />
      <div
        ref={fieldRef}
        className="sports-balls-field"
        style={{ position: "absolute", inset: 0, transform: "translate3d(0,0,0)" }}
      >
        {/* Chain rails and rungs. No viewBox, so one SVG user unit is one CSS
            pixel and the frame loop can hand it viewport coordinates directly.
            First in the field, so the lines pass behind the balls. */}
        <svg
          ref={linksRef}
          className="sports-ball-links"
          aria-hidden
          focusable="false"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0 }}
        >
          <g
            fill="none"
            stroke={MID}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#cnLinkGlow)"
          >
            <polyline ref={rungsRef} strokeWidth="1.4" opacity="0.4" strokeDasharray="4 6" />
            <polyline ref={leftRailRef} strokeWidth="2.2" opacity="0.55" />
            <polyline ref={rightRailRef} strokeWidth="2.2" opacity="0.55" />
          </g>
        </svg>

        {BALLS.map((ball, i) => {
          const { shape, texture, rigid, Surface } = TYPES[ball.type];

          const spin: React.CSSProperties = {
            animationDuration: `${ball.spin}s`,
            animationDirection: ball.reverse ? "reverse" : "normal",
            animationDelay: `${ball.delay}s`,
          };

          const base = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Base shape={shape} texture={texture} />
            </svg>
          );
          const surface = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Surface />
            </svg>
          );
          const shade = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Shade shape={shape} />
            </svg>
          );

          return (
            /* Three nested jobs, outermost first: the seat is where the ball
               belongs right now (resting spot, plus whatever the scroll
               formation asks for), then the two sway layers, then the ball. */
            <div
              key={i}
              className="sports-ball-seat"
              style={{
                position: "absolute",
                left: `${ball.left}%`,
                top: `${ball.top}%`,
                width: `${ball.size}vmin`,
                height: `${ball.size}vmin`,
                opacity: ball.opacity,
                filter: ball.blur ? `blur(${ball.blur}px)` : undefined,
              }}
            >
              <div
                className="sports-ball"
                style={
                  {
                    ...FILL,
                    animationDuration: `${ball.driftX}s`,
                    animationDelay: `${ball.delay}s`,
                    "--dx": `${ball.dx}px`,
                  } as React.CSSProperties
                }
              >
                {/* Vertical sway lives on its own element, offset a third of a
                    period so a ball never starts a corner-to-corner diagonal. */}
                <div
                  className="sports-ball-bob"
                  style={
                    {
                      ...FILL,
                      animationDuration: `${ball.driftY}s`,
                      animationDelay: `${(ball.delay - ball.driftY / 3).toFixed(2)}s`,
                      "--dy": `${ball.dy}px`,
                    } as React.CSSProperties
                  }
                >
                  {rigid ? (
                    /* Tumbles as one piece — outline, surface and light all turn together. */
                    <div className="sports-ball-layer sports-ball-spin" style={{ ...FILL, ...spin }}>
                      {base}
                      {surface}
                      {shade}
                    </div>
                  ) : (
                    /* Only the surface turns; the light stays fixed in the scene. */
                    <>
                      {base}
                      <div className="sports-ball-layer sports-ball-spin" style={{ ...FILL, ...spin }}>
                        {surface}
                      </div>
                      {shade}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
