import { describe, it, expect } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  resolvePersistedTheme,
} from '@/lib/stores/theme-store';
import { THEME_SWATCH } from '@/lib/constants/themes';

/**
 * S-LIME-TOKENS-1: дефолт сменился с `t-aura` на `t-lime`; S-THEME-COBALT-1 — с `t-lime`
 * на `t-cobalt` (ключ лайма удалён). Смена `DEFAULT_THEME`
 * меняет поведение миграции persisted-значения в `merge()` — это логика, а не
 * стиль, и ломается она молча: пользователь просто просыпается в другой теме.
 */
describe('resolvePersistedTheme', () => {
  const cases: Array<[string, unknown, string]> = [
    ['валидная тема пережила смену дефолта', 't-minimal', 't-minimal'],
    ['бывший дефолт остаётся выбором пользователя', 't-aura', 't-aura'],
    ['новый дефолт', 't-cobalt', 't-cobalt'],
    ['сохранённый t-lime → новый дефолт', 't-lime', 't-cobalt'],
    ['LEGACY → НОВЫЙ дефолт, не старый', 't-scandi', 't-cobalt'],
    ['неизвестное значение → дефолт', 't-nonsense', 't-cobalt'],
    ['пустой localStorage → дефолт', undefined, 't-cobalt'],
    ['пустая строка не проходит как валидная', '', 't-cobalt'],
  ];

  it.each(cases)('%s: %s → %s', (_why, input, expected) => {
    expect(resolvePersistedTheme(input)).toBe(expected);
  });

  it('дефолт объявлен темой t-cobalt и лежит в списке тем', () => {
    expect(DEFAULT_THEME).toBe('t-cobalt');
    expect(THEMES).toContain(DEFAULT_THEME);
  });

  it('восемь тем, t-cobalt первая (порядок = порядок cycleTheme)', () => {
    expect(THEMES).toHaveLength(8);
    expect(THEMES[0]).toBe('t-cobalt');
  });
});

/** Забытый свотч ловится тестом, а не глазами в настройках. */
describe('THEME_SWATCH', () => {
  it('состав совпадает с THEMES', () => {
    expect(Object.keys(THEME_SWATCH).sort()).toEqual([...THEMES].sort());
  });
});
