import { describe, test, expect } from 'vitest';
import {
  buildStageDwellDefaults,
  stageDwellToForm,
  orgSettingsFormSchema,
  STAGE_DWELL_MAX,
  STAGE_DWELL_MIN,
} from '@/lib/validators/org-settings';
import { resolveDwellThreshold } from '@/lib/utils/deal-health';

// S-R2-DWELL-CFG — форма нормативов «дней в стадии» ↔ jsonb organizations.settings.
const EMPTY_FORM = { attraction: '', working: '', approval: '', closing: '' };

describe('buildStageDwellDefaults — пустое поле не превращается в ключ', () => {
  test('все поля пустые ⇒ пустой объект (ни одного ключа, ни одного null)', () => {
    const out = buildStageDwellDefaults(EMPTY_FORM);
    expect(out).toEqual({});
    expect(Object.keys(out)).toHaveLength(0);
  });

  test('заполнено одно из четырёх ⇒ ровно один ключ', () => {
    const out = buildStageDwellDefaults({ ...EMPTY_FORM, working: '7' });
    expect(out).toEqual({ working: 7 });
    expect(Object.keys(out)).toEqual(['working']);
    // и ничего похожего на null в значениях
    expect(Object.values(out).every((v) => typeof v === 'number')).toBe(true);
  });

  test('незаполненные группы падают на фолбэк через резолвер', () => {
    const out = buildStageDwellDefaults({ ...EMPTY_FORM, working: '7' });
    expect(resolveDwellThreshold('working', out)).toBe(7);
    expect(resolveDwellThreshold('attraction', out)).toBe(14); // как было
    expect(resolveDwellThreshold('closing', out)).toBe(30); // как было
  });

  test('пробелы = пусто; вне диапазона и мусор отбрасываются', () => {
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, working: '   ' })).toEqual({});
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, working: String(STAGE_DWELL_MAX + 1) })).toEqual({});
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, working: '0' })).toEqual({});
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, working: 'abc' })).toEqual({});
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, working: String(STAGE_DWELL_MIN) })).toEqual({
      working: STAGE_DWELL_MIN,
    });
  });

  test('ключ default в форме не редактируется, но переживает сохранение', () => {
    expect(buildStageDwellDefaults(EMPTY_FORM, { default: 9 })).toEqual({ default: 9 });
    expect(buildStageDwellDefaults({ ...EMPTY_FORM, closing: '40' }, { default: 9 })).toEqual({
      default: 9,
      closing: 40,
    });
  });

  test('очистка поля убирает ключ (перезапись объекта целиком)', () => {
    const saved = buildStageDwellDefaults({ ...EMPTY_FORM, working: '7' });
    const cleared = buildStageDwellDefaults(EMPTY_FORM, saved);
    expect(cleared).toEqual({});
    expect(resolveDwellThreshold('working', cleared)).toBe(21);
  });
});

describe('stageDwellToForm — обратное преобразование', () => {
  test('нет настроек ⇒ все поля пустые', () => {
    expect(stageDwellToForm(undefined)).toEqual(EMPTY_FORM);
    expect(stageDwellToForm({})).toEqual(EMPTY_FORM);
  });

  test('round-trip форма → jsonb → форма', () => {
    const form = { attraction: '10', working: '', approval: '5', closing: '' };
    expect(stageDwellToForm(buildStageDwellDefaults(form))).toEqual(form);
  });

  test('ключ default в поля формы не протекает', () => {
    expect(stageDwellToForm({ default: 9 })).toEqual(EMPTY_FORM);
  });
});

describe('orgSettingsFormSchema — валидация полей норматива', () => {
  const base = { reconnect_days: 21, stage_dwell: EMPTY_FORM };

  test('пустые поля валидны', () => {
    expect(orgSettingsFormSchema.safeParse(base).success).toBe(true);
  });

  test('число в диапазоне валидно, вне — нет', () => {
    expect(
      orgSettingsFormSchema.safeParse({ ...base, stage_dwell: { ...EMPTY_FORM, working: '30' } })
        .success,
    ).toBe(true);
    expect(
      orgSettingsFormSchema.safeParse({ ...base, stage_dwell: { ...EMPTY_FORM, working: '0' } })
        .success,
    ).toBe(false);
    expect(
      orgSettingsFormSchema.safeParse({
        ...base,
        stage_dwell: { ...EMPTY_FORM, working: String(STAGE_DWELL_MAX + 1) },
      }).success,
    ).toBe(false);
  });

  test('нецелое и нечисловое отбиваются', () => {
    expect(
      orgSettingsFormSchema.safeParse({ ...base, stage_dwell: { ...EMPTY_FORM, working: '7.5' } })
        .success,
    ).toBe(false);
    expect(
      orgSettingsFormSchema.safeParse({ ...base, stage_dwell: { ...EMPTY_FORM, working: '-3' } })
        .success,
    ).toBe(false);
  });
});
