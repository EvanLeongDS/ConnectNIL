"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  imageSrc: string;
  altText: string;
  captionText?: string;
  containerHeight: string;
  containerWidth: string;
  imageHeight?: string;
  imageWidth?: string;
  rotateAmplitude?: number;
  scaleOnHover?: number;
  showMobileWarning?: boolean;
  showTooltip?: boolean;
  displayOverlayContent?: boolean;
  overlayContent?: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function TiltedCard({
  imageSrc,
  altText,
  captionText,
  containerHeight,
  containerWidth,
  imageHeight,
  imageWidth,
  rotateAmplitude = 12,
  scaleOnHover = 1.06,
  showMobileWarning = false,
  showTooltip = false,
  displayOverlayContent = false,
  overlayContent,
  onClick,
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);

  const isTouchDevice = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      (navigator?.maxTouchPoints ?? 0) > 0 ||
      // @ts-expect-error - older browsers
      (navigator?.msMaxTouchPoints ?? 0) > 0
    );
  }, []);

  const cardStyle: React.CSSProperties = {
    width: containerWidth,
    height: containerHeight,
    transform: hovered
      ? `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scaleOnHover})`
      : "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)",
  };

  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height; // 0..1
    const tiltY = (px - 0.5) * 2 * rotateAmplitude;
    const tiltX = -((py - 0.5) * 2 * rotateAmplitude);
    setRy(clamp(tiltY, -rotateAmplitude, rotateAmplitude));
    setRx(clamp(tiltX, -rotateAmplitude, rotateAmplitude));
  }

  function reset() {
    setHovered(false);
    setRx(0);
    setRy(0);
  }

  return (
    <div className={`relative ${className}`} style={{ width: containerWidth }}>
      <div
        ref={ref}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!onClick) return;
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={reset}
        onMouseMove={handleMove}
        className={[
          "relative isolate overflow-hidden rounded-2xl border border-black/10 bg-white/70 shadow-sm backdrop-blur",
          "transition-transform duration-200 will-change-transform",
          "dark:border-white/10 dark:bg-white/5",
          onClick ? "cursor-pointer" : "",
        ].join(" ")}
        style={cardStyle}
        aria-label={altText}
        title={showTooltip ? captionText : undefined}
      >
        <img
          src={imageSrc}
          alt={altText}
          draggable={false}
          className="h-full w-full object-cover"
          style={{ width: imageWidth ?? "100%", height: imageHeight ?? "100%" }}
        />

        {displayOverlayContent ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-start bg-gradient-to-t from-black/75 via-black/10 to-black/0 p-4">
            <div className="text-left text-sm font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
              {overlayContent ?? captionText}
            </div>
          </div>
        ) : null}
      </div>

      {captionText ? (
        <div className="mt-3 text-center text-sm font-semibold text-black/70 dark:text-white/65">
          {captionText}
        </div>
      ) : null}

      {showMobileWarning && isTouchDevice ? (
        <div className="mt-2 text-center text-xs text-black/40 dark:text-white/35">
          Tilt effect is limited on touch devices.
        </div>
      ) : null}
    </div>
  );
}

