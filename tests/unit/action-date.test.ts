import { describe, it, expect } from 'vitest';
import { formatActionDate } from '@/lib/utils/action-date';

// S-LEAD-V2-LAYOUT-1: общая дата шага сделки и лида. `now` фиксирован — полдень
// 27.09.2026 по локальным часам, чтобы граница суток не зависела от машины.
const NOW = new Date(2026, 8, 27, 12, 0, 0);

describe('formatActionDate', () => {
  it('сегодня / завтра / вчера', () => {
    expect(formatActionDate('2026-09-27', NOW)).toBe('сегодня');
    expect(formatActionDate('2026-09-28', NOW)).toBe('завтра');
    expect(formatActionDate('2026-09-26', NOW)).toBe('вчера');
  });

  it('дальше — «день месяц»', () => {
    expect(formatActionDate('2026-10-02', NOW)).toBe('2 октября');
  });

  it('невалидная строка возвращается как есть', () => {
    expect(formatActionDate('не дата', NOW)).toBe('не дата');
  });
});
