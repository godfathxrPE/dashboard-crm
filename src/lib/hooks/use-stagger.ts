'use client';

import { useEffect, useRef } from 'react';

/**
 * Staggered entry animation on child elements.
 * Each child fades in with translateY, delayed by staggerMs * index.
 */
export function useStagger<T extends HTMLElement>(staggerMs = 30) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const children = Array.from(el.children) as HTMLElement[];
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(8px)';
      child.style.transition = `opacity 0.3s ease-out ${i * staggerMs}ms, transform 0.3s ease-out ${i * staggerMs}ms`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          child.style.opacity = '1';
          child.style.transform = 'translateY(0)';
        });
      });
    });

    const cleanup = setTimeout(() => {
      children.forEach((child) => {
        child.style.opacity = '';
        child.style.transform = '';
        child.style.transition = '';
      });
    }, children.length * staggerMs + 400);

    return () => clearTimeout(cleanup);
  }, [staggerMs]);

  return ref;
}
