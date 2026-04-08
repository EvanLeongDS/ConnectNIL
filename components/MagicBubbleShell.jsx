'use client';

import { useCallback, useRef } from 'react';

/**
 * Visual-only “magic bento” (glow + spotlight) on top of your existing Tailwind bubble.
 * Does not change layout: pass the same className you used on the original div.
 */
export default function MagicBubbleShell({
  className = '',
  children,
  glowColor = '31, 122, 224',
  spotlightRadiusPx = 320,
}) {
  const ref = useRef(null);

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--glow-intensity', '0');
  }, []);

  const onMove = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--glow-x', `${x}%`);
      el.style.setProperty('--glow-y', `${y}%`);
      el.style.setProperty('--glow-radius', `${spotlightRadiusPx}px`);
      el.style.setProperty('--glow-color', glowColor);
      el.style.setProperty('--glow-intensity', '1');
    },
    [glowColor, spotlightRadiusPx]
  );

  return (
    <div
      ref={ref}
      className={`magic-bubble-shell ${className}`.trim()}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onBlur={reset}
    >
      {children}
    </div>
  );
}
