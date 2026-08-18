import { describe, it, expect } from 'vitest';
import {
  qualifyLead,
  formatDateKeyRu,
  type LeadForQualification,
} from '@/lib/domain/lead-qualification';

const EMPTY: LeadForQualification = {
  pain: null,
  budget_status: 'unknown',
  decision_role: null,
  chz_groups: null,
  regulatory_deadline: null,
  estimated_value: null,
};

const FULL: LeadForQualification = {
  pain: 'Ручной учёт партий, срывают сроки отгрузки',
  budget_status: 'estimated',
  decision_role: 'decision_maker',
  chz_groups: ['Удобрения'],
  regulatory_deadline: '2026-08-31',
  estimated_value: 150_000_000, // копейки → 1.5M ₽
};

describe('qualifyLead — заполненность пунктов', () => {
  it('budget_status = unknown ⇒ пункт НЕ заполнен', () => {
    const q = qualifyLead({ ...EMPTY, budget_status: 'unknown' });
    expect(q.items.find((i) => i.key === 'budget')?.filled).toBe(false);
  });

  it('budget_status = none ⇒ пункт ЗАПОЛНЕН: «бюджета нет» — выясненный факт', () => {
    const q = qualifyLead({ ...EMPTY, budget_status: 'none' });
    const budget = q.items.find((i) => i.key === 'budget');
    expect(budget?.filled).toBe(true);
    expect(budget?.value).toBe('Нет бюджета');
  });

  it('пустая строка и пробелы в pain ⇒ не заполнен', () => {
    expect(qualifyLead({ ...EMPTY, pain: '' }).items[0].filled).toBe(false);
    expect(qualifyLead({ ...EMPTY, pain: '   \n ' }).items[0].filled).toBe(false);
    expect(qualifyLead({ ...EMPTY, pain: 'Ручной учёт' }).items[0].filled).toBe(true);
  });

  it('chz_groups: [] ⇒ не заполнен, непустой массив ⇒ заполнен', () => {
    expect(qualifyLead({ ...EMPTY, chz_groups: [] }).items.find((i) => i.key === 'chz')?.filled)
      .toBe(false);
    const q = qualifyLead({ ...EMPTY, chz_groups: ['Удобрения', 'Вода'] });
    const chz = q.items.find((i) => i.key === 'chz');
    expect(chz?.filled).toBe(true);
    expect(chz?.value).toBe('Удобрения, Вода');
  });

  it('estimated_value = 0 ⇒ ЗАПОЛНЕН (нулевая оценка — тоже оценка), null ⇒ нет', () => {
    expect(qualifyLead({ ...EMPTY, estimated_value: 0 }).items.find((i) => i.key === 'value')?.filled)
      .toBe(true);
    expect(qualifyLead({ ...EMPTY, estimated_value: null }).items.find((i) => i.key === 'value')?.filled)
      .toBe(false);
  });

  it('значения зоны «Известно»: роль по словарю, сумма из копеек, дата по-русски', () => {
    const q = qualifyLead(FULL);
    const byKey = Object.fromEntries(q.items.map((i) => [i.key, i.value]));
    expect(byKey.role).toBe('Принимает решение (ЛПР)');
    expect(byKey.value).toBe('1.5M ₽');
    expect(byKey.deadline).toBe('31 августа 2026 г.');
    expect(byKey.budget).toBe('Оценён');
  });

  it('неизвестная роль отдаётся как есть — БД словарь не проверяет', () => {
    const q = qualifyLead({ ...EMPTY, decision_role: 'снабженец' });
    expect(q.items.find((i) => i.key === 'role')?.value).toBe('снабженец');
  });

  it('длинная боль обрезается многоточием, короткая — нет', () => {
    const long = 'а'.repeat(120);
    const value = qualifyLead({ ...EMPTY, pain: long }).items[0].value ?? '';
    expect(value.length).toBeLessThanOrEqual(60);
    expect(value.endsWith('…')).toBe(true);
    expect(qualifyLead({ ...EMPTY, pain: 'Короткая боль' }).items[0].value).toBe('Короткая боль');
  });
});

describe('qualifyLead — конверсия и счётчики', () => {
  it('canConvert только при ОБОИХ обязательных', () => {
    expect(qualifyLead(EMPTY).canConvert).toBe(false);
    expect(qualifyLead({ ...EMPTY, pain: 'Боль' }).canConvert).toBe(false);
    expect(qualifyLead({ ...EMPTY, budget_status: 'confirmed' }).canConvert).toBe(false);
    expect(qualifyLead({ ...EMPTY, pain: 'Боль', budget_status: 'confirmed' }).canConvert).toBe(true);
  });

  it('необязательные пункты конверсию не держат', () => {
    const q = qualifyLead({
      ...EMPTY,
      pain: 'Боль',
      budget_status: 'none',
      // роль/группы/дедлайн/оценка пусты
    });
    expect(q.canConvert).toBe(true);
    expect(q.missing).toHaveLength(4);
    expect(q.requiredMissing).toHaveLength(0);
  });

  it('missing: обязательные первыми, внутри — порядок объявления', () => {
    const q = qualifyLead({ ...EMPTY, chz_groups: ['Удобрения'] });
    expect(q.missing.map((i) => i.key)).toEqual(['pain', 'budget', 'role', 'deadline', 'value']);
    expect(q.missing.slice(0, 2).every((i) => i.required)).toBe(true);
  });

  it('счётчики на пустом лиде', () => {
    const q = qualifyLead(EMPTY);
    expect(q.filledCount).toBe(0);
    expect(q.total).toBe(6);
    expect(q.known).toHaveLength(0);
    expect(q.missing).toHaveLength(6);
    expect(q.requiredMet).toBe(0);
    expect(q.requiredTotal).toBe(2);
  });

  it('счётчики на полном лиде', () => {
    const q = qualifyLead(FULL);
    expect(q.filledCount).toBe(6);
    expect(q.missing).toHaveLength(0);
    expect(q.requiredMet).toBe(2);
    expect(q.canConvert).toBe(true);
    expect(q.known.map((i) => i.key)).toEqual(['pain', 'budget', 'role', 'chz', 'deadline', 'value']);
  });

  it('частичное заполнение: 4 из 6, готовность 1/2', () => {
    const q = qualifyLead({
      ...EMPTY,
      budget_status: 'confirmed',
      chz_groups: ['Удобрения'],
      regulatory_deadline: '2026-08-31',
      estimated_value: 100_000,
    });
    expect(q.filledCount).toBe(4);
    expect(q.requiredMet).toBe(1);
    expect(q.canConvert).toBe(false);
    expect(q.requiredMissing.map((i) => i.key)).toEqual(['pain']);
  });

  it('undefined-поля (частичный объект) равны пустым', () => {
    expect(qualifyLead({}).filledCount).toBe(0);
    expect(qualifyLead({}).canConvert).toBe(false);
  });
});

describe('formatDateKeyRu', () => {
  it('печатает ключ дня без сдвига на сутки', () => {
    expect(formatDateKeyRu('2026-01-01')).toBe('1 января 2026 г.');
    expect(formatDateKeyRu('2026-12-31')).toBe('31 декабря 2026 г.');
  });

  it('мусор отдаётся как есть, а не как Invalid Date', () => {
    expect(formatDateKeyRu('не дата')).toBe('не дата');
  });
});
