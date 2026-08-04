"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_COUNT, clamp01, lerp, smoothstep, stageScroll } from "./stageScroll";
import "./SportsBalls.css";

/* ─── Two-tone 3D sports balls ─────────────────────────────────────────────────
   Teams are blue, brands are red. Depth comes from three stacked layers:

     1. base    — the silhouette filled with a directional shading gradient
     2. surface — seams / stitching / laces; the only layer that spins
     3. shade   — limb darkening, bounce light, specular hot spot

   Keeping the light fixed while only the surface rotates is what makes these
   read as spinning spheres instead of spinning stickers. Baseball and soccer
   seams are projected from real 3D coordinates, so the panels foreshorten
   toward the silhouette the way they do on a real ball.

   The two tints are one ramp in two hues — matched lightness at every stop — so
   a red ball and a blue ball read as the same object in two colours rather than
   as two different materials. Nothing below hardcodes a colour: a ball is handed
   its palette, and each palette carries its own copy of the gradients.
────────────────────────────────────────────────────────────────────────────── */

type Palette = {
  /** suffix that keys this tint's gradients and pattern */
  id: string;
  lit: string;
  mid: string;
  base: string;
  shadow: string;
  deep: string;
  /** stitching, laces, stripes */
  thread: string;
  /** the darkest line: recessed channels and panel seams */
  ink: string;
  /** a softer seam, one step up from ink */
  seam: string;
  /** soccer panel fill */
  panel: string;
};

const TEAM: Palette = {
  id: "team",
  lit: "#a9d3fb",
  mid: "#2f8aeb",
  base: "#1f7ae0",
  shadow: "#0b3a76",
  deep: "#061c3a",
  thread: "#dbeafe",
  ink: "#04162e",
  seam: "#0a2f5f",
  panel: "#08305f",
};

const BRAND: Palette = {
  id: "brand",
  lit: "#fbc5bd",
  mid: "#ef5347",
  base: "#e03a2f",
  shadow: "#7a1512",
  deep: "#3a0806",
  thread: "#ffe4e0",
  ink: "#2b0705",
  seam: "#5f1310",
  panel: "#5c1410",
};

const TINTS = [TEAM, BRAND];

type Surf = { p: Palette };

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

/** One tint's worth of shading. The geometry is identical between tints, so only
    the paint is duplicated. */
function PaletteDefs({ p }: Surf) {
  return (
    <>
      {/* Body shading — key light from the upper left. */}
      <radialGradient id={`cnBallBody-${p.id}`} cx="0.34" cy="0.27" r="0.82">
        <stop offset="0%" stopColor={p.lit} />
        <stop offset="26%" stopColor={p.mid} />
        <stop offset="55%" stopColor={p.base} />
        <stop offset="82%" stopColor={p.shadow} />
        <stop offset="100%" stopColor={p.deep} />
      </radialGradient>

      {/* Limb darkening — deepens the silhouette over the seams. */}
      <radialGradient id={`cnBallLimb-${p.id}`} cx="0.42" cy="0.36" r="0.72">
        <stop offset="55%" stopColor={p.deep} stopOpacity="0" />
        <stop offset="88%" stopColor={p.deep} stopOpacity="0.42" />
        <stop offset="100%" stopColor={p.ink} stopOpacity="0.82" />
      </radialGradient>

      {/* Bounce light skimming the lower-right edge. */}
      <radialGradient id={`cnBallRim-${p.id}`} cx="0.74" cy="0.79" r="0.56">
        <stop offset="60%" stopColor={p.lit} stopOpacity="0" />
        <stop offset="90%" stopColor={p.lit} stopOpacity="0.34" />
        <stop offset="100%" stopColor={p.thread} stopOpacity="0.06" />
      </radialGradient>

      {/* Pebbled leather. */}
      <pattern id={`cnBallPebble-${p.id}`} width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="1.2" cy="1.2" r="0.85" fill={p.deep} opacity="0.22" />
        <circle cx="3.7" cy="3.7" r="0.85" fill={p.deep} opacity="0.22" />
        <circle cx="3.7" cy="1.2" r="0.55" fill={p.lit} opacity="0.16" />
        <circle cx="1.2" cy="3.7" r="0.55" fill={p.lit} opacity="0.16" />
      </pattern>
    </>
  );
}

function BallDefs() {
  return (
    <svg
      className="sports-balls-defs"
      aria-hidden
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {TINTS.map((p) => (
          <PaletteDefs key={p.id} p={p} />
        ))}

        {/* Specular hot spot — white in both tints, so it's shared. */}
        <radialGradient id="cnBallSpec" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* Bloom for the network's edges. Deliberately an SVG filter and not a
            CSS one: the links layer spans the whole viewport, and a CSS filter on
            an element that big makes Chromium tile the filter region, leaving
            faint vertical seams across the page. An SVG filter region is measured
            from the group's bounding box — just the edges — so there's nothing to
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

function Base({ shape, texture, p }: { shape: Shape; texture: boolean } & Surf) {
  const body =
    shape === "sphere" ? (
      <circle cx="50" cy="50" r="48" fill={`url(#cnBallBody-${p.id})`} />
    ) : (
      <path d={FOOTBALL_PATH} fill={`url(#cnBallBody-${p.id})`} />
    );
  const clip = shape === "sphere" ? "url(#cnClipSphere)" : "url(#cnClipFootball)";
  return (
    <>
      {body}
      {texture && (
        <g clipPath={clip} opacity="0.55">
          <rect x="0" y="0" width="100" height="100" fill={`url(#cnBallPebble-${p.id})`} />
        </g>
      )}
    </>
  );
}

function Shade({ shape, p }: { shape: Shape } & Surf) {
  const paint = (fill: string, opacity?: number) =>
    shape === "sphere" ? (
      <circle cx="50" cy="50" r="48" fill={fill} opacity={opacity} />
    ) : (
      <path d={FOOTBALL_PATH} fill={fill} opacity={opacity} />
    );
  return (
    <>
      {paint(`url(#cnBallLimb-${p.id})`)}
      {paint(`url(#cnBallRim-${p.id})`)}
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

function BasketballSurface({ p }: Surf) {
  const channels = BASKETBALL.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* Recessed channels: a light lip along the lower edge, then the groove. */}
      <g stroke={p.lit} strokeWidth="1.3" opacity="0.3" transform="translate(0 1.6)">
        {channels}
      </g>
      <g stroke={p.ink} strokeWidth="3.4" opacity="0.9">
        {channels}
      </g>
    </g>
  );
}

function BaseballSurface({ p }: Surf) {
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      <g stroke={p.seam} strokeWidth="1.6" opacity="0.5">
        {BASEBALL.seams.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d={BASEBALL.stitches} stroke={p.thread} strokeWidth="1.5" opacity="0.85" />
      <path d={BASEBALL.stitches} stroke={p.seam} strokeWidth="0.6" opacity="0.35" transform="translate(0 1)" />
    </g>
  );
}

function TennisSurface({ p }: Surf) {
  const band = TENNIS.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* A soft shadow under the band, then the band itself. */}
      <g stroke={p.seam} strokeWidth="5.4" opacity="0.3" transform="translate(0 1.5)">
        {band}
      </g>
      <g stroke={p.thread} strokeWidth="4.2" opacity="0.85">
        {band}
      </g>
    </g>
  );
}

function VolleyballSurface({ p }: Surf) {
  const panels = VOLLEYBALL.map((d, i) => <path key={i} d={d} />);
  return (
    <g clipPath="url(#cnClipSphere)" fill="none" strokeLinecap="round">
      {/* Recessed panel seams: a lit lip along the lower edge, then the groove. */}
      <g stroke={p.lit} strokeWidth="1" opacity="0.26" transform="translate(0 1.2)">
        {panels}
      </g>
      <g stroke={p.ink} strokeWidth="1.9" opacity="0.68">
        {panels}
      </g>
    </g>
  );
}

function SoccerSurface({ p }: Surf) {
  return (
    <g clipPath="url(#cnClipSphere)">
      <g fill={p.panel} opacity="0.9" stroke={p.ink} strokeWidth="0.8" strokeLinejoin="round">
        {SOCCER.panels.map((panel, i) => (
          <polygon key={i} points={panel.points} />
        ))}
      </g>
      <g fill="none" stroke={p.ink} strokeWidth="1.5" strokeLinecap="round" opacity="0.62">
        {SOCCER.seams.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

function FootballSurface({ p }: Surf) {
  return (
    <g clipPath="url(#cnClipFootball)" fill="none" strokeLinecap="round">
      {/* panel seams down the length */}
      <g stroke={p.ink} strokeWidth="1.3" opacity="0.45">
        <path d="M50 4C40 20 36 34 36 50s4 30 14 46" />
        <path d="M50 4c10 16 14 30 14 46s-4 30-14 46" />
      </g>
      {/* end stripes */}
      <g stroke={p.thread} strokeWidth="2.8" opacity="0.7">
        <path d="M32.5 20.5c11.5-4.5 23.5-4.5 35 0" />
        <path d="M32.5 79.5c11.5 4.5 23.5 4.5 35 0" />
      </g>
      {/* laces, with a shadow line beneath each rung */}
      <path d="M50 32.5v35" stroke={p.ink} strokeWidth="1.6" opacity="0.55" />
      <g stroke={p.ink} strokeWidth="2.6" opacity="0.4" transform="translate(0 1.3)">
        <path d="M42.5 38h15M42.5 45h15M42.5 52h15M42.5 59h15M42.5 66h15" />
      </g>
      <g stroke={p.thread} strokeWidth="2.4" opacity="0.88">
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

/* ─── The turning field ───────────────────────────────────────────────────────
   The resting scatter isn't just a still picture with the balls bobbing in it:
   the whole cloud turns, slowly and without stopping, about an invisible upright
   axis down the middle of the page.

   Each ball has a resting depth as well as a resting position, so the scatter is
   a cloud in space rather than a sheet. Turning it about an upright axis leaves
   every ball's height alone and swings its across-the-page offset against its
   depth — which is why a ball out near the edge travels furthest, one near the
   axis barely moves, and the right of the page comes forward while the left goes
   back. Depth is what carries most of the read: a ball coming toward the camera
   grows and brightens, one going behind shrinks, dims and passes under its
   neighbours.

   Two deliberate compressions. The turn is applied at a fraction of full size,
   so the cloud sweeps a composed distance instead of dragging balls across the
   hero copy every revolution — a rotation of a scaled-down copy of the scatter,
   still perfectly rigid. And depth is measured against each ball's own radius,
   so every ball gets the full swing of light and size rather than only the ones
   far out from the axis.

   This is resting behaviour, not an event: it is running whenever the field is
   at rest and yields to the scroll formations exactly as the sway does.
────────────────────────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

/** Where a node is right now: centre and diameter in viewport px, the opacity it
    is drawn at, and how near the camera it is (+1 nearest, −1 furthest) — which
    only decides what paints over what. */
type Slot = { x: number; y: number; size: number; alpha: number; depth: number };

/** Seconds for one full revolution. */
const TURN_PERIOD = 40;
const TURN_SPEED = TAU / TURN_PERIOD;
/** Seconds the turn takes to come up to speed. The field is floating in place
    when you arrive and gathers its rotation from a standstill, rather than being
    already underway at first paint. */
const TURN_EASE = 3.5;

/** Radians turned by `t` seconds in — speed easing up to a constant `TURN_SPEED`
    and staying there. */
const turnAt = (t: number) =>
  TURN_SPEED * (t - TURN_EASE * (1 - Math.exp(-t / TURN_EASE)));

/** How deep the cloud is, as a share of the viewport's short side. */
const CLOUD_DEPTH = 0.4;
/** Share of the true rotation the field actually travels, and the px cap on that
    travel (again in vmin) — whichever is smaller wins, so a wide viewport can't
    hand the outermost ball a sweep the composition wouldn't survive. */
const TURN_REACH = 0.18;
const TURN_TRAVEL = 0.15;

/** Camera distance in cloud radii: how much a ball grows as it comes forward. */
const PERSP = 5.5;
/** How much of a ball's opacity the far side of the turn takes off. */
const TURN_DIM = 0.28;

const nearness = (depth: number) => PERSP / (PERSP - depth);
const dimness = (depth: number) => 1 - TURN_DIM * (1 - (depth + 1) / 2);

/** A ball's place in the turning cloud: where it sits relative to the axis, and
    the values its shading has to be measured against so that a field at phase 0
    looks exactly like the composed scatter — the turn modulates the design
    rather than replacing it. */
type Turning = {
  /** px across the page from the axis, at rest */
  dx: number;
  /** px in front of the screen plane, at rest */
  dz: number;
  radius: number;
  near0: number;
  dim0: number;
};

/* ─── Field layout ───────────────────────────────────────────────────────────
   Fixed (never random) so server and client markup agree. Sizes are in vmin so
   the field scales with the viewport; placement leans to the edges and the
   right half to stay clear of the hero copy.

   These are the teams — the balls in the resting field. Scrolling the pinned hero
   pulls them through the formations `fill` builds below, where the brands join
   them.
────────────────────────────────────────────────────────────────────────────── */

type Ball = {
  type: keyof typeof TYPES;
  /** vmin */
  size: number;
  left: number;
  top: number;
  /** −1 furthest back, +1 nearest the camera. Only the turn reads it, and it's
      set to agree with the depth cues already in the composition: the faint,
      blurred balls are the ones behind. */
  z: number;
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
  { type: "basketball", size: 26, left: 72, top: 8,  z: 0.85,  opacity: 0.85, dx: 22, dy: 16, driftX: 19, driftY: 13, spin: 90, delay: 0 },
  { type: "football",   size: 20, left: 86, top: 52, z: 0.35,  opacity: 0.8,  dx: 16, dy: 21, driftX: 23, driftY: 15, spin: 64, delay: -6, reverse: true },
  { type: "baseball",   size: 12, left: 61, top: 74, z: 0.6,   opacity: 0.85, dx: 18, dy: 14, driftX: 16, driftY: 11, spin: 46, delay: -3 },
  { type: "soccer",     size: 16, left: 44, top: 12, z: -0.45, opacity: 0.6,  dx: 20, dy: 15, driftX: 24, driftY: 17, spin: 78, delay: -11, reverse: true },
  { type: "basketball", size: 10, left: 33, top: 62, z: -0.3,  opacity: 0.62, dx: 17, dy: 19, driftX: 14, driftY: 20, spin: 40, delay: -8 },
  { type: "soccer",     size: 9,  left: 8,  top: 22, z: 0.15,  opacity: 0.7,  dx: 15, dy: 18, driftX: 18, driftY: 12, spin: 52, delay: -5, reverse: true },
  { type: "baseball",   size: 22, left: 2,  top: 55, z: -1,    opacity: 0.4,  blur: 3, dx: 19, dy: 13, driftX: 25, driftY: 18, spin: 96, delay: -2 },
  { type: "soccer",     size: 13, left: 92, top: 26, z: -0.55, opacity: 0.62, blur: 1, dx: 13, dy: 17, driftX: 21, driftY: 14, spin: 58, delay: -16 },
  { type: "football",   size: 11, left: 15, top: 4,  z: 0.5,   opacity: 0.68, dx: 16, dy: 15, driftX: 17, driftY: 23, spin: 44, delay: -9, reverse: true },
  { type: "baseball",   size: 15, left: 78, top: 90, z: -0.65, opacity: 0.62, blur: 1, dx: 18, dy: 16, driftX: 22, driftY: 16, spin: 68, delay: -12 },
  { type: "tennis",     size: 10, left: 66, top: 40, z: 0.25,  opacity: 0.66, dx: 14, dy: 17, driftX: 15, driftY: 21, spin: 38, delay: -7, reverse: true },
  { type: "volleyball", size: 18, left: 20, top: 36, z: -0.8,  opacity: 0.5,  blur: 2, dx: 17, dy: 14, driftX: 26, driftY: 19, spin: 84, delay: -4 },
];

/* ─── Brands ──────────────────────────────────────────────────────────────────
   Every brand is the counterpart of one team: the same ball in the other colour,
   so a deal is always a blue soccer ball joined to a red soccer ball. Brands have
   no resting spot — they don't exist until the third stage calls them out — so
   their anchor is just the middle of the page, somewhere for a hidden seat to
   sit. What they do have of their own is timing: a slower spin the other way, and
   a sway out of step with their counterpart, so a pair never moves as one lump.
────────────────────────────────────────────────────────────────────────────── */

const BRANDS: Ball[] = BALLS.map((ball) => ({
  ...ball,
  left: 50,
  top: 50,
  opacity: 0,
  blur: undefined,
  driftX: ball.driftX * 0.83,
  driftY: ball.driftY * 1.12,
  spin: ball.spin * 0.86,
  delay: ball.delay - 7,
  reverse: !ball.reverse,
}));

/** Teams first, then brands. One seat per node, and `i` is its index throughout:
    node i and node i + TEAMS are the two halves of one deal. */
const NODES: Ball[] = [...BALLS, ...BRANDS];
const TEAMS = BALLS.length;
const isBrand = (i: number) => i >= TEAMS;

/* ─── The shapes the formations are built from ─────────────────────────────────
   Unit shapes, in unit-sphere coordinates, projected to the viewport at whatever
   size and centre a stage asks for. Their edge lists are worked out here too, so
   the network's wiring is a property of the shape rather than a hand-drawn set of
   lines that could fall out of step with where the balls actually are.
────────────────────────────────────────────────────────────────────────────── */

type Edge = [number, number];

/** Twelve points spread as evenly over a sphere as twelve points can be: the
    Fibonacci lattice, which needs no tuning and has no seam. */
const SHELL: V3[] = Array.from({ length: TEAMS }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / TEAMS;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = Math.PI * (3 - Math.sqrt(5)) * i;
  return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
});

const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Nearest-neighbour wiring: each point joined to its `k` closest, deduplicated.
    Every point therefore has at least k edges and the shell reads as a mesh
    rather than as a scatter of dots. */
function wire(points: V3[], k: number): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  points.forEach((p, i) => {
    const near = points
      .map((q, j) => ({ j, d: gap(p, q) }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    for (const c of near) {
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(i < c.j ? [i, c.j] : [c.j, i]);
    }
  });
  return edges;
}

const SHELL_EDGES = wire(SHELL, 3);
/** How close the two nearest points on the shell are — what sets ball size. */
const SHELL_GAP = Math.min(...SHELL_EDGES.map(([i, j]) => gap(SHELL[i], SHELL[j])));

/** The brands' own shape: a 3 × 2 × 2 box lattice. Twelve cells exactly, and
    against the teams' shell it reads as what the copy promises them — structure
    instead of a dozen loose deals. */
const LATTICE: V3[] = [];
const LATTICE_EDGES: Edge[] = [];
{
  const STEP: V3 = [0.62, 0.66, 0.66];
  const cell = (ix: number, iy: number, iz: number) => (ix * 2 + iy) * 2 + iz;
  for (let ix = 0; ix < 3; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        LATTICE[cell(ix, iy, iz)] = [
          (ix - 1) * STEP[0],
          (iy - 0.5) * STEP[1],
          (iz - 0.5) * STEP[2],
        ];
        // One edge per step forward along each axis: every beam of the box, once.
        if (ix < 2) LATTICE_EDGES.push([cell(ix, iy, iz), cell(ix + 1, iy, iz)]);
        if (iy < 1) LATTICE_EDGES.push([cell(ix, iy, iz), cell(ix, iy + 1, iz)]);
        if (iz < 1) LATTICE_EDGES.push([cell(ix, iy, iz), cell(ix, iy, iz + 1)]);
      }
    }
  }
}
const LATTICE_SPAN = Math.max(...LATTICE.map((p) => Math.hypot(...p)));
const LATTICE_GAP = Math.min(...LATTICE_EDGES.map(([i, j]) => gap(LATTICE[i], LATTICE[j])));

/** The deals: every team joined to its own brand, and to no other. */
const DEAL_EDGES: Edge[] = SHELL.map((_, i) => [i, i + TEAMS]);

/* ─── Formations ──────────────────────────────────────────────────────────────
   Where every node goes at each stage, in viewport pixels. Ball sizes are derived
   from the spacing of whatever shape they belong to rather than picked by hand,
   so nothing collides at any viewport — a tighter shape simply means smaller
   balls.

     0  scattered   the resting field, turning about the middle of the page
     1  huddle      teams in one flat ring — the gathering
     2  two shapes  teams on a turning shell; brands emerge into their lattice
     3  network     one graph: every team beside its brand, the deal joining them

   Stages 2 and 3 are three-dimensional and turning, so they can't be worked out
   once and stored: `fill` writes them per frame. Stages 0 and 1 are cheap enough
   to go through the same path, which keeps one code path for all four.
────────────────────────────────────────────────────────────────────────────── */

/** Radians the network and the clusters are tipped toward the camera. */
const TIP = 0.32;
const TIP_COS = Math.cos(TIP);
const TIP_SIN = Math.sin(TIP);
/** Camera distance in shape radii. Closer than the resting cloud's: a graph wants
    its perspective visible. */
const NET_PERSP = 3.2;
/** Radians per second the shapes turn. */
const NET_SPEED = TAU / 26;
/** Opacity a node is drawn at when it's dead-on the shape's equator; depth takes
    it from there. Brands and teams alike — in the network everything is a node,
    so the resting field's careful spread of opacities resolves into one. */
const NODE_ALPHA = 0.94;

/** How far a pair's two balls sit either side of their site, in shell radii —
    upward for the brand, downward for the team.

    Upward, and not along the shell's surface, because the shapes turn about the
    upright axis: a vertical offset is the one direction that never foreshortens,
    so a pair is always two balls with a join you can see. Split them along the
    surface instead and every pair, at some point in the revolution, comes end-on
    to the camera and reads as a single ball. */
const PAIR_SPLIT = 0.16;
/** Brands grow out of a knot at the middle of their lattice. */
const SEED_PULL = 0.42;
const SEED_SIZE = 0.22;

type View = {
  /** Viewport height, so the frame loop can tell when the released field has
      cleared the top of the screen without measuring anything per frame. */
  vh: number;
  /** Where each seat is anchored in CSS, and the size it's drawn at there. Every
      transform is measured from here. */
  anchor: Slot[];
  turn: Turning[];
  /** how much of the resting cloud's true rotation it travels */
  reach: number;
  ring: Slot[];
  cx: number;
  cy: number;
  /** radius of the stage-3 network */
  netR: number;
  netSize: number;
  /** the two stage-2 clusters: how far out either side, and how big */
  splitX: number;
  shellR: number;
  shellSize: number;
  latticeR: number;
  latticeSize: number;
};

function layout(): View {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh);
  const n = TEAMS;

  /* Formations gather in the gutter to the right of the hero copy. Below ~900px
     there is no gutter, so they run down the middle and the hero's scrim is what
     keeps the copy readable over them. */
  const wide = vw >= 900;
  const cx = wide ? vw * 0.735 : vw * 0.5;
  const cy = vh * 0.5;
  const reach = wide ? Math.min(vw * 0.115, vh * 0.3) : Math.min(vw * 0.32, vh * 0.28);

  const anchor: Slot[] = NODES.map((ball) => {
    const size = (ball.size / 100) * vmin;
    return {
      x: (ball.left / 100) * vw + size / 2,
      y: (ball.top / 100) * vh + size / 2,
      size,
      alpha: ball.opacity,
      depth: 0,
    };
  });

  /* Ring: neighbours sit a chord apart, so that chord sets the ball size. The
     ring is squashed vertically to sit better in a landscape gutter, which
     pinches the gap between neighbours at the left and right extremes — so the
     squash has to come off the size too, or those two pairs collide. */
  const SQUASH = 0.88;
  const ringGap = 2 * reach * Math.sin(Math.PI / n) * SQUASH;
  const ring: Slot[] = BALLS.map((ball, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    return {
      x: cx + reach * Math.cos(a),
      y: cy + reach * SQUASH * Math.sin(a),
      size: ringGap * 0.92,
      alpha: ball.opacity,
      depth: 0,
    };
  });

  /* The network is the widest thing the field ever makes, and perspective swings
     its near side wider still, so it's sized off the room in the gutter rather
     than off `reach` alone. Both stage-2 clusters then divide that same footprint
     between them, which is what lets one resolve into the other without the
     composition jumping. */
  /* How far the network actually reaches, per unit of its radius — the shell, plus
     the pair split, plus a ball's own radius, plus what perspective adds on the
     near side. Wider than tall by construction: the split is vertical. */
  const NET_WIDE = 1.22;
  const NET_TALL = 1.33;
  const netR = Math.min(
    reach * 1.24,
    // A hard ceiling in page widths as well, or a tall narrow viewport — where
    // `reach` is deliberately generous because the formations run down the middle
    // rather than off to one side — hands the network the whole screen.
    vw * 0.31,
    (Math.min(cx, vw - cx) * 0.96) / NET_WIDE,
    (vh * 0.46) / NET_TALL
  );
  /* A pair's two balls sit about a third of a ball apart: close enough to read as
     one deal rather than two neighbours, with enough daylight between them for the
     join to be visible. That makes the split the thing that sets ball size for the
     whole network — and the clusters take the same size, so nothing changes scale
     as the two shapes resolve into one. */
  const netSize = netR * PAIR_SPLIT * 2 * 0.64;

  const splitX = netR * 0.62;
  const shellR = netR * 0.46;
  const latticeR = (netR * 0.5) / LATTICE_SPAN;

  return {
    vh,
    anchor,
    ring,
    cx,
    cy,
    netR,
    netSize,
    splitX,
    shellR,
    /* Sizes are held to the network's, within what each shape can take: on a
       shell, two balls a comfortable distance apart in space can still land on top
       of each other on screen, so the nearest-neighbour spacing is an upper bound
       and not the target. */
    shellSize: Math.min(netSize, shellR * SHELL_GAP * 0.62),
    latticeR,
    latticeSize: Math.min(netSize, latticeR * LATTICE_GAP * 0.74),

    /* The turning cloud, measured off the resting scatter: its axis stands at the
       middle of the page, whatever the formations do off to one side. */
    ...(() => {
      const axis = vw / 2;
      const turn = NODES.map((ball, i) => {
        const dx = anchor[i].x - axis;
        const dz = ball.z * CLOUD_DEPTH * vmin;
        const radius = Math.hypot(dx, dz) || 1;
        const depth0 = dz / radius;
        return { dx, dz, radius, near0: nearness(depth0), dim0: dimness(depth0) };
      });
      /* One factor for the whole cloud, so the turn stays rigid. A ball's
         furthest reach from its resting spot over a revolution is |dx| + radius,
         so capping the worst of those caps every ball's travel. */
      const worst = turn.reduce((m, o) => Math.max(m, Math.abs(o.dx) + o.radius), 1);
      return { turn, reach: Math.min(TURN_REACH, (TURN_TRAVEL * vmin) / worst) };
    })(),
  };
}

/** Turn a unit-shape point about the upright axis, tip it toward the camera and
    project it. One perspective factor scales the offset and the ball together, so
    a node swinging forward doesn't crowd its neighbours as it grows. */
function place(
  out: Slot,
  p: V3,
  cx: number,
  cy: number,
  r: number,
  size: number,
  cos: number,
  sin: number
) {
  const x1 = p[0] * cos + p[2] * sin;
  const z1 = p[2] * cos - p[0] * sin;
  const y2 = p[1] * TIP_COS - z1 * TIP_SIN;
  const z2 = p[1] * TIP_SIN + z1 * TIP_COS;
  const near = NET_PERSP / (NET_PERSP - z2);

  out.x = cx + r * x1 * near;
  out.y = cy + r * y2 * near;
  out.size = size * near;
  out.alpha = NODE_ALPHA * dimness(z2);
  out.depth = z2;
}

/** Ball i's place in its stage-2 cluster: teams on the shell to one side, brands
    in the lattice to the other. */
function cluster(out: Slot, i: number, v: View, cos: number, sin: number) {
  if (isBrand(i)) {
    place(out, LATTICE[i - TEAMS], v.cx + v.splitX, v.cy, v.latticeR, v.latticeSize, cos, sin);
  } else {
    place(out, SHELL[i], v.cx - v.splitX, v.cy, v.shellR, v.shellSize, cos, sin);
  }
}

/** Scratch for the one point `fill` has to compute rather than look up. Reused
    so the frame loop allocates nothing. */
const SEAT: V3 = [0, 0, 0];

/** Writes every node's slot for one stage. */
function fill(out: Slot[], stage: number, v: View, cloud: number, spin: number) {
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const cosCloud = Math.cos(cloud);
  const sinCloud = Math.sin(cloud);

  for (let i = 0; i < NODES.length; i++) {
    const s = out[i];

    /* Before they emerge, brands wait wherever their lattice slot is — pulled in
       toward the middle of it and shrunk to nothing. That's what makes the third
       stage an emergence rather than an arrival: they grow outward into the shape
       from a knot at its centre, in the pose the lattice already holds. */
    if (isBrand(i) && stage < 2) {
      cluster(s, i, v, cos, sin);
      const hx = v.cx + v.splitX;
      s.x = hx + (s.x - hx) * SEED_PULL;
      s.y = v.cy + (s.y - v.cy) * SEED_PULL;
      s.size *= SEED_SIZE;
      s.alpha = 0;
      continue;
    }

    if (stage === 0) {
      /* The resting scatter, turning. Both shadings are ratios against the ball's
         own resting depth, so a field at phase 0 is exactly the composed scatter
         and the turn only ever modulates it. */
      const o = v.turn[i];
      const a = v.anchor[i];
      const across = o.dx * cosCloud + o.dz * sinCloud;
      const depth = (o.dz * cosCloud - o.dx * sinCloud) / o.radius;
      s.x = a.x + v.reach * (across - o.dx);
      s.y = a.y;
      s.size = a.size * (nearness(depth) / o.near0);
      s.alpha = NODES[i].opacity * (dimness(depth) / o.dim0);
      s.depth = depth;
    } else if (stage === 1) {
      const r = v.ring[i];
      s.x = r.x;
      s.y = r.y;
      s.size = r.size;
      s.alpha = r.alpha;
      s.depth = 0;
    } else if (stage === 2) {
      cluster(s, i, v, cos, sin);
    } else {
      /* The network: twelve sites on one shell, each holding a team and its brand
         a short step either side of it. */
      const site = SHELL[i % TEAMS];
      SEAT[0] = site[0];
      // The shape's y axis points down the screen, so the brand takes the minus.
      SEAT[1] = site[1] + (isBrand(i) ? -PAIR_SPLIT : PAIR_SPLIT);
      SEAT[2] = site[2];
      place(s, SEAT, v.cx, v.cy, v.netR, v.netSize, cos, sin);
    }
  }
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

/** Brands don't all arrive at once. Each one's share of the leg starts a little
    after the one before, so the lattice fills in ball by ball instead of the whole
    box fading up at once — and the last one is still in by the end of the leg. */
const EMERGE_STAGGER = 0.55;

function emerge(t: number, i: number) {
  const u = clamp01((t - ((i - TEAMS) / TEAMS) * EMERGE_STAGGER) / (1 - EMERGE_STAGGER));
  return u * u * (3 - 2 * u);
}

/** One `d` string for a set of edges, read off wherever the balls actually are
    this frame. Endpoints are node indices, so an edge can never drift out of step
    with the nodes it joins. */
function strand(live: Slot[], edges: Edge[], offset: number) {
  let d = "";
  for (const [i, j] of edges) {
    const a = live[i + offset];
    const b = live[j + offset];
    d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

export default function SportsBalls({ className = "" }: { className?: string }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<SVGPathElement>(null);
  const gridRef = useRef<SVGPathElement>(null);
  const dealRef = useRef<SVGPathElement>(null);
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

    let view = layout();
    // Last value written per seat, so the expensive properties are only touched
    // when they actually change.
    const lastAmp = seats.map(() => -1);
    const lastFilter = seats.map(() => "");
    const lastFade = seats.map(() => -1);
    const lastZ = seats.map(() => -999);
    const lastShown = seats.map(() => false);
    const lastEdges = [-1, -1, -1];
    let lastGone = false;

    /* Three buffers, filled in place: the stage on either side of where the scroll
       sits, and the blend of the two that everything downstream reads. Stages 2
       and 3 turn, so they can't be worked out once and cached — but they can be
       written into the same objects every frame, which keeps the loop free of
       allocation. */
    const blank = () => NODES.map(() => ({ x: 0, y: 0, size: 0, alpha: 0, depth: 0 }));
    const from0 = blank();
    const from1 = blank();
    const live = blank();

    /* Phase 0 is the composed scatter, so the turn starts from the first frame
       the field is on screen: no travel yet, and the speed easing up from nothing
       (see `turnAt`). */
    let startedAt = -1;

    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * -28;
      target.y = (e.clientY / window.innerHeight - 0.5) * -28;
    };

    const onResize = () => {
      view = layout();
    };

    const tick = (now: number) => {
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;

      /* The hero has unpinned and the page is moving again: the field goes up with
         it, one pixel per pixel, so the closed network scrolls away under the
         copy that built it instead of following the reader into the CTA below.
         While the hero is still pinned this is zero and nothing changes.

         It rides the same transform as the pointer parallax rather than a
         separate wrapper — one composited layer either way, and two elements each
         holding half the offset would only be two things to keep in step. */
      const release = stageScroll.pinned ? stageScroll.release : 0;

      /* Past a viewport of travel the last ball has cleared the top of the screen.
         Nothing below would be visible, so the field leaves the page and the whole
         loop — twenty-four seats, three sets of edges — is skipped until the reader
         comes back up to it. */
      const gone = release > view.vh;
      if (gone !== lastGone) {
        lastGone = gone;
        field.style.visibility = gone ? "hidden" : "";
      }
      if (gone) {
        raf = requestAnimationFrame(tick);
        return;
      }

      field.style.transform = `translate3d(${current.x.toFixed(2)}px, ${(
        current.y - release
      ).toFixed(2)}px, 0)`;

      const progress = stageScroll.pinned ? stageScroll.progress : 0;
      const { from, t } = blend(progress);

      /* How far out of the resting scatter the field is — drives how still and
         how sharp the balls become as they gather. Tied to the first leg, which
         ends at ⅓ of the runway. */
      const gathered = smoothstep(0.02, 0.3, progress);
      const amp = 1 - 0.82 * gathered;

      /* Two clocks, both read off elapsed time rather than accumulated, so
         scrolling away and back finds everything where it would have been all
         along: the resting cloud's turn, which starts from a standstill because
         the field is on screen from the first frame, and the shapes' turn, which
         is at speed by the time anyone scrolls far enough to see it. */
      if (startedAt < 0) startedAt = now;
      const elapsed = (now - startedAt) / 1000;
      const cloud = turnAt(elapsed);
      const spin = NET_SPEED * elapsed;

      fill(from0, from, view, cloud, spin);
      fill(from1, from + 1, view, cloud, spin);

      /* The field comes up out of the background as the sequence runs: faint
         behind the opening headline, full strength by the time the network closes.
         The per-theme ceiling lives on the wrapper in SiteBackground, so this one
         ramp brightens correctly against both white and #0d1117. */
      const brightness = smoothstep(0.02, 0.95, progress);
      field.style.opacity = `${lerp(0.55, 1, brightness).toFixed(3)}`;

      // The bloom builds alongside it and is strongest as the network closes at
      // the very end — the deals lighting up as they come together.
      const glow = smoothstep(0.04, 0.96, progress);

      seats.forEach((seat, i) => {
        const a = from0[i];
        const b = from1[i];
        const rest = view.anchor[i];
        /* Brands come in one after another rather than all together, which is a
           different position along this leg for each of them. */
        const u = from === 1 && isBrand(i) ? emerge(t, i) : t;

        const x = lerp(a.x, b.x, u);
        const y = lerp(a.y, b.y, u);
        const size = lerp(a.size, b.size, u);
        const alpha = lerp(a.alpha, b.alpha, u);
        const depth = lerp(a.depth, b.depth, u);

        live[i].x = x;
        live[i].y = y;
        live[i].size = size;
        live[i].alpha = alpha;

        /* A brand that hasn't emerged is taken out of the page entirely, not just
           made transparent: for most of the scroll there are twelve balls on
           screen rather than twenty-four, and nothing is spent drawing the ones
           nobody can see. */
        const shown = alpha > 0.004;
        if (shown !== lastShown[i]) {
          lastShown[i] = shown;
          seat.style.display = shown ? "block" : "none";
        }
        if (!shown) return;

        const scale = rest.size > 0 ? size / rest.size : 1;
        seat.style.transform = `translate3d(${(x - rest.x).toFixed(2)}px, ${(
          y - rest.y
        ).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;

        const fade = Math.round(alpha * 200) / 200;
        if (fade !== lastFade[i]) {
          lastFade[i] = fade;
          seat.style.opacity = `${fade}`;
        }

        /* Balls nearer the camera have to paint over the ones behind them, or a
           turning shape reads as a flat shuffle. Kept non-negative: a negative
           index would drop the ball behind the network's edges, which are a
           sibling drawn earlier precisely so they stay behind. */
        const stack = 20 + Math.round(depth * 18);
        if (stack !== lastZ[i]) {
          lastZ[i] = stack;
          seat.style.zIndex = `${stack}`;
        }

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
        const dof = Math.round((NODES[i].blur ?? 0) * (1 - gathered) * 4) / 4;
        // Two shadows, tight over wide: one shadow reads as a flat outline,
        // while a bright core inside a soft falloff reads as light coming off
        // the ball.
        const halo = Math.round(glow * size * 0.44 * 2) / 2;
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

      /* Three sets of edges, each with its own say in the story: the teams' shell
         wires up as they take it and stays wired; the brands' box comes in with
         them and unbuilds itself as the two shapes resolve into one; the deals
         only exist at the end, and are the last thing to arrive. */
      const mesh = Math.round(smoothstep(0.4, 0.62, progress) * 100) / 100;
      const grid =
        Math.round(
          smoothstep(0.42, 0.62, progress) * (1 - smoothstep(0.72, 0.9, progress)) * 100
        ) / 100;
      const deal = Math.round(smoothstep(0.76, 0.97, progress) * 100) / 100;

      const paint = (
        ref: React.RefObject<SVGPathElement | null>,
        at: number,
        fade: number,
        edges: Edge[],
        offset: number
      ) => {
        const el = ref.current;
        if (!el) return;
        if (fade !== lastEdges[at]) {
          lastEdges[at] = fade;
          el.style.opacity = `${fade}`;
        }
        if (fade > 0) el.setAttribute("d", strand(live, edges, offset));
      };

      paint(meshRef, 0, mesh, SHELL_EDGES, 0);
      paint(gridRef, 1, grid, LATTICE_EDGES, TEAMS);
      paint(dealRef, 2, deal, DEAL_EDGES, 0);

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      /* Hand the balls back to the stylesheet, or they'd freeze wherever the last
         frame left them — mid-turn, in the shading and stacking that went with it.
         Brands go back to being absent: with no loop running there is nothing to
         bring them on, and twelve of them stacked at the middle of the page is not
         a background. */
      field.style.transform = "translate3d(0,0,0)";
      field.style.opacity = "";
      field.style.visibility = "";
      seats.forEach((seat, i) => {
        seat.style.transform = "";
        seat.style.removeProperty("--amp");
        seat.style.filter = NODES[i].blur ? `blur(${NODES[i].blur}px)` : "";
        seat.style.opacity = `${NODES[i].opacity}`;
        seat.style.zIndex = "";
        seat.style.display = isBrand(i) ? "none" : "block";
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
        {/* The network's edges: the teams' mesh, the brands' box, and the deals
            that join the two. No viewBox, so one SVG user unit is one CSS pixel
            and the frame loop can hand it viewport coordinates directly. First in
            the field, so every line passes behind the balls. */}
        <svg
          className="sports-ball-links"
          aria-hidden
          focusable="false"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <g fill="none" strokeLinecap="round" filter="url(#cnLinkGlow)">
            <path ref={meshRef} stroke={TEAM.mid} strokeWidth="1.5" opacity="0" />
            <path ref={gridRef} stroke={BRAND.mid} strokeWidth="1.5" opacity="0" />
            {/* The deals are the point of the whole sequence, so they're the
                heaviest line on the page and the only dashed one — a join being
                made rather than a beam of a structure. */}
            <path
              ref={dealRef}
              stroke={BRAND.mid}
              strokeWidth="2.6"
              strokeDasharray="4 3"
              opacity="0"
            />
          </g>
        </svg>

        {NODES.map((ball, i) => {
          const { shape, texture, rigid, Surface } = TYPES[ball.type];
          const p = isBrand(i) ? BRAND : TEAM;

          const spin: React.CSSProperties = {
            animationDuration: `${ball.spin}s`,
            animationDirection: ball.reverse ? "reverse" : "normal",
            animationDelay: `${ball.delay}s`,
          };

          const base = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Base shape={shape} texture={texture} p={p} />
            </svg>
          );
          const surface = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Surface p={p} />
            </svg>
          );
          const shade = (
            <svg className="sports-ball-layer" viewBox="0 0 100 100" focusable="false" style={FILL}>
              <Shade shape={shape} p={p} />
            </svg>
          );

          return (
            /* Three nested jobs, outermost first: the seat is where the ball
               belongs right now (resting spot, plus whatever the scroll
               formation asks for), then the two sway layers, then the ball.

               A brand's seat starts out of the page rather than merely
               transparent, which is also what it falls back to if the frame loop
               never runs — no loop, no emergence, so nothing to show. */
            <div
              key={i}
              className="sports-ball-seat"
              data-tint={p.id}
              style={{
                position: "absolute",
                left: `${ball.left}%`,
                top: `${ball.top}%`,
                width: `${ball.size}vmin`,
                height: `${ball.size}vmin`,
                opacity: ball.opacity,
                display: isBrand(i) ? "none" : "block",
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
