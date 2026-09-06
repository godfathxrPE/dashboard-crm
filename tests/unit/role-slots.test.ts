import { describe, it, expect } from 'vitest';
import { resolveRoleSlots } from '@/lib/domain/role-slots';
import type { StakeholderRow } from '@/lib/hooks/use-deal-stakeholders';
import type { PipelineExpectedRole, StakeholderRole } from '@/types/database';

// S-DEAL-ROLES-1: слоты ролей контура. Тесты — ПОВЕДЕНИЕМ: «кого не хватает»,
// «кто закрыл слот», «что видно, когда ожиданий нет».

const PIPELINE = 'pipeline-1';

function expected(
  role: StakeholderRole,
  patch: Partial<PipelineExpectedRole> = {},
): PipelineExpectedRole {
  return {
    id: `exp-${role}`,
    org_id: 'org-1',
    pipeline_id: PIPELINE,
    role,
    is_required: false,
    hint: null,
    sort_order: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

/** `created_at` задаётся явно: им разрешается, кто из двух одинаковых ролей в слоте. */
function person(id: string, role: StakeholderRole | null, createdAt: string): StakeholderRow {
  return { id, contact_id: `contact-${id}`, role, created_at: createdAt };
}

const day = (n: number) => `2026-09-0${n}T10:00:00.000Z`;

describe('resolveRoleSlots — воронка без ожиданий', () => {
  it('слот только primary, трое в хвосте, hasExpectations false', () => {
    const rows = [
      person('a', 'decision_maker', day(1)),
      person('b', 'expert', day(2)),
      person('c', null, day(3)),
    ];

    const r = resolveRoleSlots([], rows, null);

    expect(r.hasExpectations).toBe(false);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].kind).toBe('primary');
    expect(r.rest.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.missingRequired).toEqual([]);
  });
});

describe('resolveRoleSlots — покрытие ролей', () => {
  const exp = [
    expected('decision_maker', { is_required: true, sort_order: 1, hint: 'ЛПР не в контуре' }),
    expected('expert', { sort_order: 2 }),
  ];

  it('закрыт только эксперт — ЛПР в missingRequired, primary считается слотом', () => {
    const rows = [person('e', 'expert', day(1))];

    const r = resolveRoleSlots(exp, rows, 'contact-p');

    expect(r.missingRequired).toEqual(['decision_maker']);
    expect(r.totalCount).toBe(3);
    // primary (контакт сделки задан) + эксперт = 2 закрытых слота.
    expect(r.filledCount).toBe(2);
    expect(r.slots[1].isFilled).toBe(false);
    expect(r.slots[2].filled?.id).toBe('e');
  });

  it('ЛПР — он же основной контакт: слоты РАЗНЫЕ, оба закрыты одним человеком', () => {
    const boss = person('boss', 'decision_maker', day(1));

    const r = resolveRoleSlots(exp, [boss], boss.contact_id);

    expect(r.slots[0].kind).toBe('primary');
    expect(r.slots[0].filled?.id).toBe('boss');
    expect(r.slots[1].role).toBe('decision_maker');
    expect(r.slots[1].filled?.id).toBe('boss');
    // Считаются СЛОТЫ, не головы: два закрытых слота из трёх.
    expect(r.filledCount).toBe(2);
    expect(r.totalCount).toBe(3);
    expect(r.missingRequired).toEqual([]);
    // Человек израсходован на слоты — в хвосте его нет.
    expect(r.rest).toEqual([]);
  });

  it('стейкхолдер без роли не закрывает ни один слот и уходит в хвост', () => {
    const rows = [person('x', null, day(1))];

    const r = resolveRoleSlots(exp, rows, null);

    expect(r.missingRequired).toEqual(['decision_maker']);
    expect(r.filledCount).toBe(0);
    expect(r.rest.map((p) => p.id)).toEqual(['x']);
  });

  it('два человека с ролью expert — слот закрыт первым по created_at, второй в хвост', () => {
    const rows = [person('late', 'expert', day(5)), person('early', 'expert', day(2))];

    const r = resolveRoleSlots(exp, rows, null);

    expect(r.slots[2].filled?.id).toBe('early');
    expect(r.rest.map((p) => p.id)).toEqual(['late']);
  });

  it('primaryContactId = null — слот primary пуст, функция не падает', () => {
    const r = resolveRoleSlots(exp, [], null);

    expect(r.slots[0].isFilled).toBe(false);
    expect(r.slots[0].virtualContactId).toBeNull();
    expect(r.filledCount).toBe(0);
    expect(r.totalCount).toBe(3);
  });

  it('основной контакт задан, но строки в карте нет — слот закрыт виртуально', () => {
    const r = resolveRoleSlots(exp, [], 'contact-p');

    expect(r.slots[0].isFilled).toBe(true);
    expect(r.slots[0].filled).toBeNull();
    expect(r.slots[0].virtualContactId).toBe('contact-p');
  });

  it('порядок слотов — по sort_order, а не по порядку строк', () => {
    const shuffled = [
      expected('expert', { sort_order: 2 }),
      expected('decision_maker', { sort_order: 1, is_required: true }),
    ];

    const r = resolveRoleSlots(shuffled, [], null);

    expect(r.slots.map((s) => s.role)).toEqual([null, 'decision_maker', 'expert']);
  });

  it('роль, которой воронка не ждёт, слота не создаёт — человек в хвосте', () => {
    const rows = [person('blk', 'blocker', day(1))];

    const r = resolveRoleSlots(exp, rows, null);

    expect(r.slots.map((s) => s.role)).toEqual([null, 'decision_maker', 'expert']);
    expect(r.rest.map((p) => p.id)).toEqual(['blk']);
  });

  it('незакрытая НЕобязательная роль в missingRequired не попадает', () => {
    const r = resolveRoleSlots(exp, [person('d', 'decision_maker', day(1))], null);

    expect(r.missingRequired).toEqual([]);
    expect(r.slots[2].isFilled).toBe(false);
  });
});
