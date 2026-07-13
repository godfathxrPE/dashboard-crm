'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface AnchoredRect {
  top: number;
  left: number;
  width: number;
}

/**
 * Позиция для попапа, вынесенного в портал (position: fixed). Считает низ/лево/
 * ширину триггера через getBoundingClientRect и пересчитывает на scroll (в любом
 * предке — capture) и resize, чтобы попап «прилипал» к триггеру даже внутри
 * overflow-скролла модалки (AUDIT UI-D1: дропдаун клипался телом Modal).
 *
 * @param gap отступ под триггером в px (соответствует mt-1 = 4px)
 */
export function useAnchoredRect(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  gap = 4,
): AnchoredRect | null {
  const [rect, setRect] = useState<AnchoredRect | null>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + gap, left: r.left, width: r.width });
    };
    update();
    // capture: ловим scroll в любом контейнере-предке, не только на window
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef, open, gap]);

  return rect;
}
