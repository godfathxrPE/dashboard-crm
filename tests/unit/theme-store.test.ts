import { describe, it, expect } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  resolvePersistedTheme,
} from '@/lib/stores/theme-store';
import { THEME_SWATCH } from '@/lib/constants/themes';

/**
 * S-LIME-TOKENS-1: дефолт сменился с `t-aura` на `t-lime`. Смена `DEFAULT_THEME`
 * меняет поведение миграции persisted-значения в `merge()` — это логика, а не
 * стиль, и ломается она молча: пользователь просто просыпается в другой теме.
 */
describe('resolvePersistedTheme', () => {
  const cases: Array<[string, unknown, string]> = [
    ['валидная тема пережила смену дефолта', 't-minimal', 't-minimal'],
    ['бывший дефолт остаётся выбором пользователя', 't-aura', 't-aura'],
    ['новый дефолт', 't-lime', 't-lime'],
    ['LEGACY → НОВЫЙ дефолт, не старый', 't-scandi', 't-lime'],
    ['неизвестное значение → дефолт', 't-nonsense', 't-lime'],
    ['пустой localStorage → дефолт', undefined, 't-lime'],
    ['пустая строка не проходит как валидная', '', 't-lime'],
  ];

  it.each(cases)('%s: %s → %s', (_why, input, expected) => {
    expect(resolvePersistedTheme(input)).toBe(expected);
  });

  it('дефолт объявлен темой t-lime и лежит в списке тем', () => {
    expect(DEFAULT_THEME).toBe('t-lime');
    expect(THEMES).toContain(DEFAULT_THEME);
  });

  it('восемь тем, t-lime первая (порядок = порядок cycleTheme)', () => {
    expect(THEMES).toHaveLength(8);
    expect(THEMES[0]).toBe('t-lime');
  });
});

/** Забытый свотч ловится тестом, а не глазами в настройках. */
describe('THEME_SWATCH', () => {
  it('состав совпадает с THEMES', () => {
    expect(Object.keys(THEME_SWATCH).sort()).toEqual([...THEMES].sort());
  });
});
