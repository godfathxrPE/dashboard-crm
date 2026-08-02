import { describe, test, expect } from 'vitest';
import { sortStakeholders, parseStakeholderError, type StakeholderRow } from '@/lib/hooks/use-deal-stakeholders';
import {
  STAKEHOLDER_ROLE_ORDER,
  STAKEHOLDER_ROLE_CONFIG,
} from '@/lib/constants/stakeholders';
import { STAKEHOLDER_ROLES, type StakeholderRole } from '@/types/database';
import { stakeholderInsertSchema, stakeholderUpdateSchema } from '@/lib/validators/stakeholder';

// ═══ S-R2-D3: карта стейкхолдеров сделки (миграция 092) ═══

const row = (
  id: string,
  contact_id: string,
  role: StakeholderRole | null,
  created_at = '2026-08-01T10:00:00.000Z',
): StakeholderRow => ({ id, contact_id, role, created_at });

describe('sortStakeholders — порядок карты', () => {
  test('primary поднимается наверх независимо от роли', () => {
    const rows = [
      row('a', 'c1', 'decision_maker'),
      row('b', 'c2', 'end_user'),
      row('c', 'c3', 'expert'),
    ];
    const sorted = sortStakeholders(rows, 'c2');
    expect(sorted[0].id).toBe('b');
    expect(sorted[0].isPrimary).toBe(true);
    expect(sorted.slice(1).every((s) => !s.isPrimary)).toBe(true);
  });

  test('порядок ролей соответствует STAKEHOLDER_ROLE_ORDER', () => {
    // на входе — обратный порядок словаря
    const rows = [...STAKEHOLDER_ROLE_ORDER]
      .reverse()
      .map((r, i) => row(`id-${r}`, `c-${i}`, r));
    const sorted = sortStakeholders(rows, null);
    expect(sorted.map((s) => s.role)).toEqual([...STAKEHOLDER_ROLE_ORDER]);
  });

  test('role = null уходит в конец, а не в начало', () => {
    const rows = [
      row('a', 'c1', null),
      row('b', 'c2', 'blocker'),
      row('c', 'c3', 'decision_maker'),
    ];
    const sorted = sortStakeholders(rows, null);
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  test('primaryContactId = null — не падает, порядок только по ролям', () => {
    const rows = [row('a', 'c1', 'expert'), row('b', 'c2', 'champion')];
    const sorted = sortStakeholders(rows, null);
    expect(sorted.map((s) => s.id)).toEqual(['b', 'a']);
    expect(sorted.every((s) => !s.isPrimary)).toBe(true);
  });

  test('primary с ролью blocker всё равно первый (primary сильнее роли)', () => {
    const rows = [
      row('a', 'c1', 'decision_maker'),
      row('b', 'c2', 'blocker'),
      row('c', 'c3', 'economic_buyer'),
    ];
    const sorted = sortStakeholders(rows, 'c2');
    expect(sorted[0].id).toBe('b');
    expect(sorted.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  test('внутри роли — по created_at по возрастанию', () => {
    const rows = [
      row('late', 'c1', 'expert', '2026-08-02T10:00:00.000Z'),
      row('early', 'c2', 'expert', '2026-07-30T10:00:00.000Z'),
      row('mid', 'c3', 'expert', '2026-08-01T10:00:00.000Z'),
    ];
    expect(sortStakeholders(rows, null).map((s) => s.id)).toEqual(['early', 'mid', 'late']);
  });

  test('исходный массив не мутируется', () => {
    const rows = [row('a', 'c1', 'end_user'), row('b', 'c2', 'decision_maker')];
    sortStakeholders(rows, 'c1');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  test('пустой список — пустой результат', () => {
    expect(sortStakeholders([], 'c1')).toEqual([]);
  });

  test('primaryContactId, которого нет в строках, никого не помечает', () => {
    const sorted = sortStakeholders([row('a', 'c1', 'expert')], 'c-missing');
    expect(sorted[0].isPrimary).toBe(false);
  });
});

describe('словарь ролей — согласованность с БД-CHECK (092)', () => {
  test('ORDER и union совпадают по составу', () => {
    expect([...STAKEHOLDER_ROLE_ORDER].sort()).toEqual([...STAKEHOLDER_ROLES].sort());
  });

  test('у каждой роли есть ярлык и цвет', () => {
    for (const role of STAKEHOLDER_ROLES) {
      expect(STAKEHOLDER_ROLE_CONFIG[role].label).toBeTruthy();
      expect(STAKEHOLDER_ROLE_CONFIG[role].color).toBeTruthy();
    }
    expect(Object.keys(STAKEHOLDER_ROLE_CONFIG).sort()).toEqual([...STAKEHOLDER_ROLES].sort());
  });
});

describe('parseStakeholderError — человеческий текст вместо кода PG', () => {
  test('23505 — дубль контакта в карте', () => {
    expect(parseStakeholderError({ code: '23505' })).toBe('Контакт уже в карте сделки');
  });

  test('42501 — не хватает прав (RLS)', () => {
    expect(parseStakeholderError({ code: '42501' })).toContain('Недостаточно прав');
  });

  test('неизвестный код — сообщение как есть', () => {
    expect(parseStakeholderError({ code: 'XX000', message: 'boom' })).toBe('boom');
  });

  test('не-объект — дефолтный текст', () => {
    expect(parseStakeholderError(null)).toBe('Не удалось изменить карту стейкхолдеров');
  });
});

describe('stakeholderInsertSchema / UpdateSchema', () => {
  const ids = {
    project_id: '00000000-0000-4000-8000-000000000001',
    contact_id: '00000000-0000-4000-8000-000000000002',
  };

  test('пустая строка роли трактуется как «не выбрано» → null', () => {
    const parsed = stakeholderInsertSchema.parse({ ...ids, role: '', note: '' });
    expect(parsed.role).toBeNull();
    expect(parsed.note).toBeNull();
  });

  test('роль вне словаря отвергается', () => {
    expect(stakeholderInsertSchema.safeParse({ ...ids, role: 'ceo' }).success).toBe(false);
  });

  test('заметка длиннее 500 символов отвергается (зеркало CHECK)', () => {
    expect(stakeholderUpdateSchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
    expect(stakeholderUpdateSchema.safeParse({ note: 'x'.repeat(500) }).success).toBe(true);
  });

  test('валидная роль проходит', () => {
    const parsed = stakeholderInsertSchema.parse({ ...ids, role: 'champion' });
    expect(parsed.role).toBe('champion');
  });
});
