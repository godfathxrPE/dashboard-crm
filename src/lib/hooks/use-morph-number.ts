'use client';

import { useEffect, useState } from 'react';

/**
 * Number Morphing — animates from 0 to target with easeOutQuart.
 * Only used in Cupertino theme.
 */
export function useMorphNumber(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }

    setValue(0);

    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        setValue(Math.round(eased * target));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);

    return () => clearTimeout(timer);
  }, [target, duration, delay]);

  return value;
}
