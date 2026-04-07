'use client';

import { useRef, useState, useCallback } from 'react';

/**
 * Cursor Spotlight — warm amber spot follows cursor over a card.
 * Only used in Cupertino theme.
 */
export function useCursorSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlightStyle({
      background: `radial-gradient(circle at ${x}% ${y}%, var(--accent-l) 0%, var(--surface) 50%)`,
    });
  }, []);

  const onMouseLeave = useCallback(() => {
    setSpotlightStyle({});
  }, []);

  return { ref, spotlightStyle, onMouseMove, onMouseLeave };
}
