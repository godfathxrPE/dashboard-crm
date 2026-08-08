import { describe, it, expect } from 'vitest';
import { mergeAiRunRows, type AiRunTimelineRow } from '@/lib/timeline/ai-run-merge';
import { presetTitle } from '@/lib/constants/ai-presets';

// S-AI-VIS-1. Два источника прогонов в ленте (по звонкам/встречам сущности и по
// самой сущности) и человеческое имя пресета вместо машинного ключа.

const row = (
  id: string,
  created_at: string,
  preset_key = 'analytic_note',
  status = 'done',
): AiRunTimelineRow => ({
  id,
  preset_key,
  entity_type: 'call',
  created_at,
  status,
});

describe('mergeAiRunRows', () => {
  it('дубли по id не возникают', () => {
    const shared = row('a', '2026-08-01T10:00:00Z');
    const merged = mergeAiRunRows([[shared], [shared, row('b', '2026-08-02T10:00:00Z')]], 50);
    expect(merged.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('порядок — по дате убыванию через границу источников', () => {
    const merged = mergeAiRunRows(
      [
        [row('c1', '2026-08-03T10:00:00Z'), row('c2', '2026-08-01T10:00:00Z')],
        [row('s1', '2026-08-04T10:00:00Z'), row('s2', '2026-08-02T10:00:00Z')],
      ],
      50,
    );
    expect(merged.map((r) => r.id)).toEqual(['s1', 'c1', 's2', 'c2']);
  });

  it('лимит применяется ПОСЛЕ слияния, а не к каждому источнику', () => {
    // Иначе два источника по «50 последних» дали бы до 100 событий в ленте.
    const a = Array.from({ length: 30 }, (_, i) => row(`a${i}`, `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`));
    const b = Array.from({ length: 30 }, (_, i) => row(`b${i}`, `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`));
    const merged = mergeAiRunRows([a, b], 50);
    expect(merged).toHaveLength(50);
    // Самое свежее — из первого источника (июль позже июня), самое старое в срезе — из второго.
    expect(merged[0].id).toBe('a29');
    expect(merged.some((r) => r.id.startsWith('b'))).toBe(true);
  });

  it('пустые источники не ломают слияние', () => {
    expect(mergeAiRunRows([[], []], 50)).toEqual([]);
  });
});

describe('presetTitle', () => {
  it('известный ключ даёт человеческое название', () => {
    expect(presetTitle('analytic_note')).toBe('Аналитическая записка');
    expect(presetTitle('company_brief')).toBe('Бриф по компании');
  });

  it('неизвестный ключ отдаёт сам ключ, а не undefined', () => {
    // Реестр пресетов здесь клиентский: edge может уйти вперёд, и прогон приедет
    // по ключу, которого этот клиент ещё не знает.
    expect(presetTitle('future_preset')).toBe('future_preset');
  });
});
