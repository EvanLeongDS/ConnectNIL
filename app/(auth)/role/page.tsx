"use client";

import { useRouter } from "next/navigation";
import AuthNav from "@/components/auth/AuthNav";
import ParticlesBackground from "@/components/auth/ParticlesBackground";
import TiltedCard from "@/components/TiltedCard";

const roles = [
  {
    label: "Athlete",
    href: "/signup/athlete",
    imageSrc:
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=900&q=60",
  },
  {
    label: "Brand Manager",
    href: "/signup/brand-manager",
    imageSrc:
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=900&q=60",
  },
  {
    label: "Team Manager",
    href: "/signup/team-manager",
    imageSrc:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=60",
  },
];

export default function RoleSelectPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen overflow-x-hidden text-black dark:text-white">
      <ParticlesBackground />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <AuthNav />
        <div className="w-full max-w-5xl space-y-10 text-center">
          <h1 className="text-5xl font-black tracking-tight text-black dark:text-white sm:text-6xl">
            I am a...
          </h1>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.label} className="flex justify-center">
                <TiltedCard
                  imageSrc={role.imageSrc}
                  altText={`${role.label} role`}
                  captionText={role.label}
                  containerHeight="280px"
                  containerWidth="280px"
                  imageHeight="280px"
                  imageWidth="280px"
                  rotateAmplitude={12}
                  scaleOnHover={1.06}
                  showMobileWarning={false}
                  showTooltip
                  displayOverlayContent
                  overlayContent={
                    <div className="inline-flex flex-col gap-1.5 rounded-xl bg-black/45 px-3 py-2 backdrop-blur-[2px]">
                      <p className="text-lg font-black leading-tight text-white">{role.label}</p>
                      <p className="text-xs font-semibold text-white/85">Continue</p>
                    </div>
                  }
                  onClick={() => router.push(role.href)}
                  className="w-[280px]"
                />
              </div>
            ))}
          </div>

          <p className="text-sm text-black/40 dark:text-white/30">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-[#1f7ae0] hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
