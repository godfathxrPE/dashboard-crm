'use client';

import { useEffect, useState, type RefObject } from 'react';
import { computeAnchoredRect, type AnchoredRect } from '@/lib/utils/anchored-position';

export type { AnchoredRect } from '@/lib/utils/anchored-position';

/**
 * Позиция И максимальная высота для попапа, вынесенного в портал (position: fixed).
 *
 * Отвечает за две вещи:
 *  1. «Прилипание» к триггеру: считает rect через getBoundingClientRect и
 *     пересчитывает на scroll (в любом предке — capture) и resize, чтобы попап
 *     ехал за триггером даже внутри overflow-скролла модалки (AUDIT UI-D1:
 *     дропдаун клипался телом Modal).
 *  2. S-DROPDOWN-VIEWPORT: попап целиком помещается в окно — при нехватке места
 *     снизу раскрывается ВВЕРХ, а высота ужимается до доступной. Раньше высоту
 *     задавал потребитель классом `max-h-*` без связи со свободным местом, и у
 *     нижней кромки экрана нижние пункты становились недостижимы: `position: fixed`
 *     режется краем viewport'а, а внутренний скролл не появлялся — контент влезал
 *     в `max-h-*`, поэтому `overflow-auto` скроллбар не создавал.
 *
 * Сама геометрия живёт в чистой `computeAnchoredRect` (`utils/anchored-position`),
 * хук — тонкая обёртка: getBoundingClientRect → расчёт → setRect.
 *
 * @param gap отступ от триггера в px (соответствует mt-1 = 4px)
 * @param preferredHeight желаемая высота попапа в px; потребитель ОБЯЗАН применить
 *        вернувшийся `maxHeight` вместо фиксированного класса высоты
 */
export function useAnchoredRect(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  gap = 4,
  preferredHeight = 224,
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
      setRect(
        computeAnchoredRect({
          triggerTop: r.top,
          triggerBottom: r.bottom,
          triggerLeft: r.left,
          triggerWidth: r.width,
          viewportHeight: window.innerHeight,
          gap,
          preferredHeight,
        }),
      );
    };
    update();
    // capture: ловим scroll в любом контейнере-предке, не только на window
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef, open, gap, preferredHeight]);

  return rect;
}
