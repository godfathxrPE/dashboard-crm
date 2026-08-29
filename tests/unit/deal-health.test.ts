import { describe, it, expect } from 'vitest';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';

// ═══════════════════════════════════════════════════════
// S-TAILS-1. Off-by-one в просрочке шага сделки: до правки функция сравнивала
// ЛОКАЛЬНУЮ полночь сегодня с UTC-полуночью `next_action_date` (date-колонка).
// В MSK (UTC+3) разница теряла три часа, и `floor` съедал сутки — менеджер видел
// «просрочен 0 дн.» на сделке, которую просрочил вчера. Дефект жил в проде и
// нашёлся тестами лида (`getLeadActionOverdueDays`), а не глазами.
//
// ⚠️ `now` передаём явно во ВСЕХ кейсах: с системным временем тест зелёный
// круглый год и ничего не проверяет.
//
// Полдень UTC как точка отсчёта — не для красоты: он даёт один и тот же
// локальный ключ дня во всех зонах от UTC-11 до UTC+11, поэтому тест не зависит
// от TZ прогона (в MSK это 15:00 того же дня).
// ═══════════════════════════════════════════════════════

const NOW = new Date('2026-08-10T12:00:00Z');
/** Дата-ключ (YYYY-MM-DD) со сдвигом в днях от «сегодня». */
const dateKey = (offset: number) =>
  new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);

describe('getNextActionOverdueDays', () => {
  it('вчерашний шаг — 1 день, а не 0 (ровно тот дефект, что был в проде)', () => {
    expect(getNextActionOverdueDays(dateKey(-1), NOW)).toBe(1);
  });

  it('позавчерашний шаг — 2 дня', () => {
    expect(getNextActionOverdueDays(dateKey(-2), NOW)).toBe(2);
  });

  it('недельный шаг — 7 дней, а не 6', () => {
    expect(getNextActionOverdueDays(dateKey(-7), NOW)).toBe(7);
  });

  it('сегодняшний шаг — 0: срок ещё не вышел', () => {
    expect(getNextActionOverdueDays(dateKey(0), NOW)).toBe(0);
  });

  it('завтрашний шаг — 0, а не отрицательное число', () => {
    expect(getNextActionOverdueDays(dateKey(1), NOW)).toBe(0);
  });

  it('далёкое будущее тоже 0 — клэмп, а не «минус 30»', () => {
    expect(getNextActionOverdueDays(dateKey(30), NOW)).toBe(0);
  });

  it('совпадает с лидовой реализацией — расхождение сигналов и было болезнью', async () => {
    const { getLeadActionOverdueDays } = await import('@/lib/utils/lead-health');
    for (const offset of [-14, -7, -3, -1, 0, 1, 7]) {
      expect(getNextActionOverdueDays(dateKey(offset), NOW)).toBe(
        getLeadActionOverdueDays(dateKey(offset), NOW),
      );
    }
  });

  it('переход через границу месяца считается календарно', () => {
    // 2026-07-31 → 2026-08-10 ровно 10 дней; арифметика на UTC-полдне
    // не спотыкается ни о длину месяца, ни о DST.
    expect(getNextActionOverdueDays('2026-07-31', NOW)).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════
// Детерминизм вердикта. `getDealHealth` читала часы сама, и `nextStepSignal`
// передавал фиксированное `now` только в арифметику просрочки, а вердикт брала
// от реального времени: deal-signals.test.ts зеленел в день написания и краснел
// через двое суток (5 падений в CI 25–29.08). Кейсы ниже падают, если `now`
// снова перестанет доходить до сравнения.
// ═══════════════════════════════════════════════════════

describe('getDealHealth — now доходит до сравнения', () => {
  const deal = (nextActionDate: string) => ({
    status: 'open' as const,
    next_step: 'Позвонить',
    next_action_date: nextActionDate,
  });

  it('завтрашний шаг относительно ПЕРЕДАННОГО now — ok, а не просрочка', () => {
    expect(getDealHealth(deal(dateKey(1)), NOW)).toBe('ok');
  });

  it('тот же шаг с now на неделю позже — overdue-action', () => {
    const later = new Date(NOW.getTime() + 7 * 86400000);
    expect(getDealHealth(deal(dateKey(1)), later)).toBe('overdue-action');
  });

  it('вчерашний шаг относительно переданного now — overdue-action', () => {
    expect(getDealHealth(deal(dateKey(-1)), NOW)).toBe('overdue-action');
  });

  it('шаг без даты — no-action независимо от now', () => {
    expect(
      getDealHealth({ status: 'open', next_step: 'Позвонить', next_action_date: null }, NOW),
    ).toBe('no-action');
  });

  it('терминальная сделка — ok независимо от now', () => {
    expect(getDealHealth({ ...deal(dateKey(-30)), status: 'won' }, NOW)).toBe('ok');
  });
});
