import { describe, test, expect } from 'vitest';
import {
  evaluateCompleteness,
  resolveRules,
  DEFAULT_RULES,
  type ProjectForCompleteness,
} from '@/lib/domain/deal-completeness';
import {
  buildCompletenessPatch,
  completenessToForm,
  readCompletenessOverrides,
} from '@/lib/validators/org-settings';

// S-R3-TRUST-1 — полнота записи сделки: чистый домен + веса из настроек организации.

/** Полностью заполненная открытая сделка. */
const full = (over: Partial<ProjectForCompleteness> = {}): ProjectForCompleteness => ({
  type: 'client',
  status: 'open',
  company_id: 'c1',
  contact_id: 'p1',
  budget: 500_000,
  stage_id: 's1',
  deadline: '2026-09-01',
  next_step: 'Позвонить',
  next_action_date: '2026-08-10',
  owner_id: 'u1',
  loss_reason: null,
  won_reason: null,
  ...over,
});

const keys = (r: ReturnType<typeof evaluateCompleteness>) => r.missing.map((m) => m.key);

describe('evaluateCompleteness — база', () => {
  test('полная открытая сделка ⇒ score 100 и пустой missing', () => {
    const r = evaluateCompleteness(full());
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.filled).toBe(r.total);
  });

  test('budget = 0 ⇒ НЕ заполнено (нулевой бюджет = не указан)', () => {
    const r = evaluateCompleteness(full({ budget: 0 }));
    expect(keys(r)).toContain('budget');
    expect(r.score).toBeLessThan(100);
  });

  test('next_step из пробелов ⇒ не заполнено', () => {
    expect(keys(evaluateCompleteness(full({ next_step: '   ' })))).toContain('next_step');
  });

  test('score — доля ВЕСА, а не полей, и округляется вниз', () => {
    // open: company 3 + contact 2 + budget 3 + stage 3 + deadline 1 + next_step 2
    //     + next_action_date 2 + owner 2 = 18; без contact (2) → 16/18 = 88.88 → 88
    const r = evaluateCompleteness(full({ contact_id: null }));
    expect(r.score).toBe(88);
    expect(r.total).toBe(8);
    expect(r.filled).toBe(7);
  });

  test('missing отсортирован по весу убыванию', () => {
    const r = evaluateCompleteness(full({ deadline: null, company_id: null, contact_id: null }));
    expect(keys(r)).toEqual(['company_id', 'contact_id', 'deadline']);
    const weights = r.missing.map((m) => m.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});

describe('evaluateCompleteness — применимость по статусу и типу', () => {
  test('status=won ⇒ причина победы в missing, причина проигрыша не применяется', () => {
    const r = evaluateCompleteness(full({ status: 'won', next_step: null, next_action_date: null }));
    expect(keys(r)).toContain('won_reason');
    expect(keys(r)).not.toContain('loss_reason');
    // next_step/next_action_date — правила только для open, у выигранной не в счёт
    expect(keys(r)).not.toContain('next_step');
    expect(keys(r)).not.toContain('next_action_date');
  });

  test('status=lost ⇒ зеркально: причина проигрыша в missing, победы — нет', () => {
    const r = evaluateCompleteness(full({ status: 'lost' }));
    expect(keys(r)).toContain('loss_reason');
    expect(keys(r)).not.toContain('won_reason');
  });

  test('status=open ⇒ ни одна из причин не применяется, total меньше', () => {
    const open = evaluateCompleteness(full());
    const lost = evaluateCompleteness(full({ status: 'lost' }));
    expect(keys(open)).not.toContain('loss_reason');
    expect(keys(open)).not.toContain('won_reason');
    // у lost исчезают next_step/next_action_date (2 правила) и приходит loss_reason (1)
    expect(open.total).toBe(8);
    expect(lost.total).toBe(7);
  });

  test('type=internal ⇒ стадии в missing нет (поля у типа не бывает)', () => {
    const r = evaluateCompleteness(full({ type: 'internal', stage_id: null }));
    expect(keys(r)).not.toContain('stage_id');
    expect(r.score).toBe(100);
  });

  test('правила name в составе нет — projects.name NOT NULL', () => {
    expect(DEFAULT_RULES.some((r) => r.key === 'name')).toBe(false);
  });
});

describe('resolveRules — веса организации', () => {
  test('пустые настройки ⇒ РОВНО DEFAULT_RULES (та же ссылка)', () => {
    expect(resolveRules(DEFAULT_RULES, undefined)).toBe(DEFAULT_RULES);
    expect(resolveRules(DEFAULT_RULES, {})).toBe(DEFAULT_RULES);
  });

  test('вес 0 ⇒ правило исчезает и из total, и из missing', () => {
    const rules = resolveRules(DEFAULT_RULES, { deadline: { weight: 0 } });
    expect(rules.some((r) => r.key === 'deadline')).toBe(false);

    const r = evaluateCompleteness(full({ deadline: null }), rules);
    expect(keys(r)).not.toContain('deadline');
    expect(r.total).toBe(7);
    expect(r.score).toBe(100);
  });

  test('неизвестный ключ игнорируется, разбор не падает', () => {
    const rules = resolveRules(DEFAULT_RULES, {
      no_such_field: { weight: 5 },
      budget: { weight: 7 },
    });
    expect(rules.some((r) => r.key === 'no_such_field')).toBe(false);
    expect(rules.find((r) => r.key === 'budget')?.weight).toBe(7);
  });

  test('вес вне 0..10 и дробный отбрасываются — остаётся дефолтный', () => {
    const rules = resolveRules(DEFAULT_RULES, {
      budget: { weight: 42 },
      company_id: { weight: 2.5 },
    });
    expect(rules.find((r) => r.key === 'budget')?.weight).toBe(3);
    expect(rules.find((r) => r.key === 'company_id')?.weight).toBe(3);
  });

  test('перевес меняет score, не меняя состав', () => {
    const rules = resolveRules(DEFAULT_RULES, { deadline: { weight: 10 } });
    // 18 - 1 + 10 = 27 общего веса; без дедлайна заполнено 17 → 62.9 → 62
    const r = evaluateCompleteness(full({ deadline: null }), rules);
    expect(r.total).toBe(8);
    expect(r.score).toBe(62);
  });
});

describe('org settings ↔ форма', () => {
  test('пустое поле не превращается в ключ, «0» превращается', () => {
    const form = completenessToForm(undefined);
    expect(Object.values(form).every((v) => v === '')).toBe(true);

    const patch = buildCompletenessPatch({ ...form, deadline: '0', budget: '5' });
    const overrides = readCompletenessOverrides(patch);
    expect(overrides).toEqual({ deadline: { weight: 0 }, budget: { weight: 5 } });
  });

  test('readCompletenessOverrides отбрасывает мусор и не падает', () => {
    expect(readCompletenessOverrides(undefined)).toBeUndefined();
    expect(
      readCompletenessOverrides({
        completeness_rules: { budget: { weight: '3' }, deadline: { weight: 99 }, owner_id: null },
      } as never),
    ).toBeUndefined();
  });

  test('чужой ключ из будущей версии переживает сохранение формы', () => {
    const patch = buildCompletenessPatch(completenessToForm(undefined), {
      future_field: { weight: 4 },
    });
    expect(readCompletenessOverrides(patch)).toEqual({ future_field: { weight: 4 } });
  });

  test('круговой прогон: настройки → форма → патч → те же настройки', () => {
    const before = { budget: { weight: 7 }, deadline: { weight: 0 } };
    const patch = buildCompletenessPatch(completenessToForm(before), before);
    expect(readCompletenessOverrides(patch)).toEqual(before);
  });
});
