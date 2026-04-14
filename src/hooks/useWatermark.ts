'use client';
import { useEffect, useRef } from 'react';

// Module-level Set — survives remounts, resets only on full page reload
const shownWatermarks = new Set<string>();

export function useWatermark(delay: number = 0) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const text = el.textContent || '';
    el.setAttribute('data-text', text);
    el.classList.add('watermark');

    // Already shown this session — skip to final state immediately
    if (shownWatermarks.has(text)) {
      el.classList.add('alive');
      return;
    }

    // First visit — animate with delay
    const timer = setTimeout(() => {
      el.classList.add('alive');
      shownWatermarks.add(text);
    }, 1000 + delay * 1000);

    return () => clearTimeout(timer);
  }, [delay]);

  return ref;
}
