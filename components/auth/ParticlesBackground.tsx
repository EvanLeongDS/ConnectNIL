"use client";

import Particles from "@/components/Particles";

/** Full-viewport WebGL particle layer (matches home page). Sits behind content with z-0. */
export default function ParticlesBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-white dark:bg-[#0d1117]" aria-hidden />
      <div className="absolute inset-0 z-[1]">
        <Particles
          particleCount={140}
          particleSpread={18}
          speed={0.07}
          particleColors={["#1f7ae0", "#251bb6", "#93c5fd"]}
          moveParticlesOnHover={false}
          alphaParticles={false}
          particleBaseSize={36}
          sizeRandomness={0}
          cameraDistance={20}
          disableRotation={false}
        />
      </div>
    </div>
  );
}
