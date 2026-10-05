'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * S-TODAY-FOCUS-1: элемент не уже `minRem` (в rem корня) — замер `ResizeObserver`.
 *
 * Нужен там, где одного CSS мало: экран «Сегодня» в узком режиме рисует фокус
 * порталом поверх списка, и Esc должен отличать «закрыть панель» от «к плану дня».
 * Порог обязан совпадать с `@container`-правилом в `globals.css` — число одно,
 * оно записано комментарием в обоих местах.
 *
 * До первого замера — `true`: широкий режим не даёт вспышки панели поверх списка.
 * Меряется content-box — та же ширина, от которой считает `container-type: inline-size`.
 */
export function useContainerWide(ref: RefObject<HTMLElement | null>, minRem = 56): boolean {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) return;
      setWide(width >= minRem * rootPx());
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, minRem]);

  return wide;
}
