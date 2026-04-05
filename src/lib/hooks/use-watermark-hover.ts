'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * Hook for delayed watermark color activation on hover.
 * After `delay` ms of hovering, isActive becomes true and letters colorize.
 */
export function useWatermarkHover(delay: number = 1000) {
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setIsActive(true), delay);
  }, [delay]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsActive(false);
  }, []);

  return { isActive, onMouseEnter, onMouseLeave };
}
