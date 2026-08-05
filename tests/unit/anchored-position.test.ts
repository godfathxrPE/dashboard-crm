import { describe, it, expect } from 'vitest';
import {
  computeAnchoredRect,
  MIN_HEIGHT,
  VIEWPORT_MARGIN,
  type AnchorInput,
} from '@/lib/utils/anchored-position';

// ═══════════════════════════════════════════════════════
// S-DROPDOWN-VIEWPORT — геометрия порталённого попапа.
//
// Расчёт вынесен из хука в чистую функцию именно ради этих тестов: DOM-геометрию
// в jsdom пришлось бы подделывать моками getBoundingClientRect, и тест проверял бы
// моки, а не правило. Здесь окружение — обычные числа.
//
// Инвариант, ради которого всё затевалось: попап целиком помещается в окно, то
// есть `top >= VIEWPORT_MARGIN` и `top + maxHeight <= viewportHeight`. Проверяется
// в КАЖДОМ кейсе через `expectInsideViewport`.
// ═══════════════════════════════════════════════════════

const base = {
  triggerLeft: 100,
  triggerWidth: 300,
  gap: 4,
  preferredHeight: 224,
};

const input = (over: Partial<AnchorInput>): AnchorInput => ({ ...base, ...over } as AnchorInput);

function expectInsideViewport(r: { top: number; maxHeight: number }, viewportHeight: number) {
  expect(r.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  expect(r.top + r.maxHeight).toBeLessThanOrEqual(viewportHeight);
}

describe('computeAnchoredRect', () => {
  it('места снизу с запасом — раскрывается вниз на желаемую высоту', () => {
    const r = computeAnchoredRect(input({
      viewportHeight: 1000, triggerTop: 100, triggerBottom: 140,
    }));
    expect(r.flipped).toBe(false);
    expect(r.maxHeight).toBe(224);
    expect(r.top).toBe(144); // triggerBottom + gap
    expect(r.left).toBe(100);
    expect(r.width).toBe(300);
    expectInsideViewport(r, 1000);
  });

  it('живой баг: vh 917, триггер снизу — флип вверх, попап целиком в окне', () => {
    // Замер с прода: под триггером 136 px, над ним 743 — обрезалось ~70 px (2 пункта).
    const r = computeAnchoredRect(input({
      viewportHeight: 917, triggerTop: 743, triggerBottom: 781,
    }));
    expect(r.flipped).toBe(true);
    expect(r.maxHeight).toBe(224); // сверху места хватает на желаемую высоту
    expect(r.top).toBe(743 - 4 - 224);
    expectInsideViewport(r, 917);
  });

  it('снизу мало и сверху не лучше — высота падает до MIN_HEIGHT, попап на экране', () => {
    // Триггер по центру низкого окна: и сверху, и снизу по 118 px.
    const r = computeAnchoredRect(input({
      viewportHeight: 300, triggerTop: 130, triggerBottom: 170,
    }));
    expect(r.maxHeight).toBe(MIN_HEIGHT);
    // Кламп подтянул попап вверх — он частично накрывает триггер, но виден весь.
    expect(r.top).toBeLessThan(170 + 4);
    expectInsideViewport(r, 300);
  });

  it('снизу 150, сверху 160 — флип вверх, но высота ужата до 160, а не 224', () => {
    const r = computeAnchoredRect(input({
      viewportHeight: 374, triggerTop: 172, triggerBottom: 212,
    }));
    expect(r.flipped).toBe(true);
    expect(r.maxHeight).toBe(160);
    expectInsideViewport(r, 374);
  });

  it('снизу 300, сверху 800 — вниз, потому что желаемое снизу помещается', () => {
    // Сверху объективно больше места, но прыгать вверх незачем: 300 > 224.
    const r = computeAnchoredRect(input({
      viewportHeight: 1200, triggerTop: 812, triggerBottom: 888,
    }));
    expect(r.flipped).toBe(false);
    expect(r.maxHeight).toBe(224);
    expect(r.top).toBe(892);
    expectInsideViewport(r, 1200);
  });

  it('триггер у самого верха окна — остаётся вниз (флипать некуда)', () => {
    // Фильтры таблиц: Combobox стоит у верхней кромки. Регресс-страховка к тому,
    // что «лечение» нижнего края не сломало верхний.
    const r = computeAnchoredRect(input({
      viewportHeight: 900, triggerTop: 12, triggerBottom: 48, preferredHeight: 192,
    }));
    expect(r.flipped).toBe(false);
    expect(r.maxHeight).toBe(192);
    expect(r.top).toBe(52);
    expectInsideViewport(r, 900);
  });

  // ── Якорь при флипе (правка гейта) ────────────────────────────────────────
  //
  // `top` при флипе считается от ЖЕЛАЕМОЙ высоты, а не от фактической. В смоке
  // это видно числами: попап 515→717 при триггере с top 743 — зазор 26px вместо
  // gap 4px, потому что 6 пунктов дали 202px из разрешённых 224. В Combobox с
  // фильтрацией разрыв доходил бы до ~150px. Лечится якорем по нижнему краю.

  it('флип — отдаёт bottom, прижимающий попап к триггеру при любой высоте контента', () => {
    const r = computeAnchoredRect(input({
      viewportHeight: 917, triggerTop: 743, triggerBottom: 781,
    }));
    expect(r.flipped).toBe(true);
    // Нижний край попапа = triggerTop - gap, независимо от того, сколько пунктов.
    expect(r.bottom).toBe(917 - 743 + 4);
    const popupBottomEdge = 917 - (r.bottom as number);
    expect(743 - popupBottomEdge).toBe(4); // ровно gap, без «повисания»
  });

  it('раскрытие вниз — bottom не отдаётся, позиционирование по top', () => {
    const r = computeAnchoredRect(input({
      viewportHeight: 1000, triggerTop: 100, triggerBottom: 140,
    }));
    expect(r.flipped).toBe(false);
    expect(r.bottom).toBeNull();
  });

  it('вырожденное окно: флип есть, но попап выше доступного места — bottom не отдаётся', () => {
    // vh 190: сверху 68, снизу 58. Флип есть, но maxHeight ужат до MIN_HEIGHT (120)
    // и над триггером не помещается — работает кламп по top, иначе попап уехал бы
    // за верхнюю кромку.
    const r = computeAnchoredRect(input({
      viewportHeight: 190, triggerTop: 80, triggerBottom: 120,
    }));
    expect(r.flipped).toBe(true);
    expect(r.maxHeight).toBe(MIN_HEIGHT);
    expect(r.bottom).toBeNull();
    expectInsideViewport(r, 190);
  });

  it('высота попапа не превышает желаемую даже при огромном окне', () => {
    const r = computeAnchoredRect(input({
      viewportHeight: 4000, triggerTop: 100, triggerBottom: 140, preferredHeight: 192,
    }));
    expect(r.maxHeight).toBe(192);
    expectInsideViewport(r, 4000);
  });
});
