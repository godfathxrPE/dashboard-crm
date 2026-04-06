'use client';
import { useEffect, useRef } from 'react';

export function useWatermark(delay: number = 0) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Устанавливаем data-text для ::before и ::after
    el.setAttribute('data-text', el.textContent || '');
    el.classList.add('watermark');

    // Через задержку запускаем проявление
    const timer = setTimeout(() => {
      el.classList.add('alive');
    }, 1000 + delay * 1000);

    return () => clearTimeout(timer);
  }, [delay]);

  return ref;
}
