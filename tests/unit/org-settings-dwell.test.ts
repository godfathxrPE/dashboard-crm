import { describe, test, expect } from 'vitest';
import {
  buildStageDwellDefaults,
  stageDwellToForm,
  buildStageTargetDays,
  stageTargetsToFormValues,
  orgSettingsFormSchema,
  STAGE_DWELL_MAX,
  STAGE_DWELL_MIN,
} from '@/lib/validators/org-settings';
import { resolveDwellThreshold } from '@/lib/utils/deal-health';
import { resolveStageNorm } from '@/lib/domain/stage-norm';

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

// ═══════════════════════════════════════════════════════
// S-STAGE-NORMS-UI-3 — нормы по КОНКРЕТНЫМ стадиям (settings.stage_target_days).
// Зеркало пары выше; отличие контракта одно и намеренное: пустой итог — undefined.
// ═══════════════════════════════════════════════════════

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

describe('buildStageTargetDays — пустое поле не превращается в ключ', () => {
  test('все поля пустые ⇒ undefined (ключ в патч не попадает вовсе)', () => {
    expect(buildStageTargetDays({ [S1]: '', [S2]: '' }, undefined)).toBeUndefined();
  });

  test('заполнено одно ⇒ ровно один ключ числом', () => {
    const out = buildStageTargetDays({ [S1]: '5', [S2]: '' }, undefined);
    expect(out).toEqual({ [S1]: 5 });
    expect(Object.values(out!).every((v) => typeof v === 'number')).toBe(true);
  });

  test('пробелы = пусто; мусор и выход за диапазон отбрасываются', () => {
    expect(buildStageTargetDays({ [S1]: '   ' }, undefined)).toBeUndefined();
    expect(buildStageTargetDays({ [S1]: '0' }, undefined)).toBeUndefined();
    expect(buildStageTargetDays({ [S1]: 'abc' }, undefined)).toBeUndefined();
    expect(buildStageTargetDays({ [S1]: '7.5' }, undefined)).toBeUndefined();
    expect(buildStageTargetDays({ [S1]: String(STAGE_DWELL_MAX + 1) }, undefined)).toBeUndefined();
    expect(buildStageTargetDays({ [S1]: String(STAGE_DWELL_MIN) }, undefined)).toEqual({
      [S1]: STAGE_DWELL_MIN,
    });
  });

  test('очистка поля убирает ключ этой стадии, чужие оверрайды живы', () => {
    const saved = { [S1]: 5, [S2]: 9 };
    expect(buildStageTargetDays({ [S1]: '', [S2]: '9' }, saved)).toEqual({ [S2]: 9 });
  });

  test('оверрайд стадии, которой нет в форме, переживает сохранение', () => {
    // Стадия удалена из словаря или воронки ещё не догрузились — стирать нельзя.
    expect(buildStageTargetDays({ [S1]: '' }, { [S2]: 12 })).toEqual({ [S2]: 12 });
  });
});

describe('stageTargetsToFormValues — обратное преобразование', () => {
  test('нет оверрайдов ⇒ поле на каждую стадию, все пустые', () => {
    expect(stageTargetsToFormValues(undefined, [S1, S2])).toEqual({ [S1]: '', [S2]: '' });
  });

  test('оверрайд чужой стадии в поля не протекает', () => {
    expect(stageTargetsToFormValues({ 'other-id': 8 }, [S1])).toEqual({ [S1]: '' });
  });

  test('round-trip форма → jsonb → форма', () => {
    const form = { [S1]: '10', [S2]: '' };
    expect(stageTargetsToFormValues(buildStageTargetDays(form, undefined), [S1, S2])).toEqual(form);
  });
});

describe('resolveStageNorm поверх пары — приоритет оверрайда над порогом группы', () => {
  test('оверрайд стадии бьёт норматив группы, пустое поле — нет', () => {
    const targets = buildStageTargetDays({ [S1]: '3', [S2]: '' }, undefined);
    const groups = buildStageDwellDefaults({ ...EMPTY_FORM, attraction: '9' });
    expect(resolveStageNorm({ id: S1, phase_group: 'attraction' }, targets, groups)).toBe(3);
    expect(resolveStageNorm({ id: S2, phase_group: 'attraction' }, targets, groups)).toBe(9);
  });
});

describe('orgSettingsFormSchema — валидация полей норм стадий', () => {
  const base = { reconnect_days: 21, stage_dwell: EMPTY_FORM };

  test('пустое поле валидно, число в диапазоне валидно', () => {
    expect(orgSettingsFormSchema.safeParse({ ...base, stage_targets: { [S1]: '' } }).success).toBe(true);
    expect(orgSettingsFormSchema.safeParse({ ...base, stage_targets: { [S1]: '30' } }).success).toBe(true);
  });

  test('вне диапазона и нецелое отбиваются', () => {
    expect(orgSettingsFormSchema.safeParse({ ...base, stage_targets: { [S1]: '0' } }).success).toBe(false);
    expect(
      orgSettingsFormSchema.safeParse({ ...base, stage_targets: { [S1]: String(STAGE_DWELL_MAX + 1) } }).success,
    ).toBe(false);
    expect(orgSettingsFormSchema.safeParse({ ...base, stage_targets: { [S1]: '7.5' } }).success).toBe(false);
  });

  test('секция необязательна на входе — прежние вызовы схемы остаются валидными', () => {
    expect(orgSettingsFormSchema.safeParse(base).success).toBe(true);
  });
});
