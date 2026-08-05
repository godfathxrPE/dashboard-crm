// S-DROPDOWN-VIEWPORT: геометрия порталённого попапа. Чистая функция без DOM —
// окружение (высота окна, прямоугольник триггера) приходит параметрами, поэтому
// расчёт тестируется без jsdom, а хук остаётся тонкой обёрткой над ней.

/** Отступ от края окна, чтобы попап не лип к нему вплотную. */
export const VIEWPORT_MARGIN = 8;
/**
 * Ниже этого попап бесполезен: лучше налезть на триггер, чем показать полоску
 * в один пункт. Вырожденный случай (окно ниже ~140px) — не наш сценарий.
 */
export const MIN_HEIGHT = 120;

export interface AnchorInput {
  triggerTop: number;
  triggerBottom: number;
  triggerLeft: number;
  triggerWidth: number;
  viewportHeight: number;
  gap: number;
  /** Желаемая высота попапа в px. Раньше жила классом `max-h-*` у потребителя. */
  preferredHeight: number;
}

export interface AnchoredRect {
  top: number;
  left: number;
  width: number;
  /** Сколько по вертикали реально доступно попапу. Потребитель ОБЯЗАН применить. */
  maxHeight: number;
  /** true — попап раскрыт вверх (для тестов и отладки; стилей не меняет). */
  flipped: boolean;
}

/**
 * Позиция и максимальная высота попапа с гарантией `top + maxHeight <= viewportHeight`.
 *
 * До этой функции попап ставился всегда под триггером и всегда на фиксированную
 * высоту: у нижней кромки экрана нижние пункты уезжали за край, а внутреннего
 * скролла не возникало (контент влезал в `max-h-*`, `scrollHeight === clientHeight`),
 * так что «доскроллить» до них было физически нечем.
 */
export function computeAnchoredRect(i: AnchorInput): AnchoredRect {
  const spaceBelow = i.viewportHeight - i.triggerBottom - i.gap - VIEWPORT_MARGIN;
  const spaceAbove = i.triggerTop - i.gap - VIEWPORT_MARGIN;

  // Флипаем ТОЛЬКО если снизу не помещается желаемое И сверху объективно лучше.
  // Без второго условия попап прыгал бы вверх даже там, где снизу места больше.
  const flipped = spaceBelow < Math.min(i.preferredHeight, spaceAbove);

  const available = Math.max(MIN_HEIGHT, flipped ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(i.preferredHeight, available);

  const top = flipped
    ? Math.max(VIEWPORT_MARGIN, i.triggerTop - i.gap - maxHeight)
    // Кламп для вырожденного случая (снизу меньше MIN_HEIGHT и сверху не лучше):
    // попап частично накроет триггер, но останется целиком на экране.
    : Math.min(i.triggerBottom + i.gap, i.viewportHeight - VIEWPORT_MARGIN - maxHeight);

  return { top, left: i.triggerLeft, width: i.triggerWidth, maxHeight, flipped };
}
