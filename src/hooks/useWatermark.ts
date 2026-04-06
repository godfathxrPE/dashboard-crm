'use client';
import { useEffect, useRef } from 'react';

export function useWatermark(delay: number = 0) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.add('watermark');

    const timer = setTimeout(() => {
      el.classList.add('animate');
    }, delay * 1000);

    const handleEnd = () => {
      el.classList.remove('animate');
      el.classList.add('alive');
    };

    el.addEventListener('animationend', handleEnd);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('animationend', handleEnd);
    };
  }, [delay]);

  return ref;
}
