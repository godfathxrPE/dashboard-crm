import { describe, test, expect } from 'vitest';
import {
  PROJECT_MEMBER_ROLE_LABELS,
  PROJECT_MEMBER_ROLE_ORDER,
  hasTaskProgress,
} from '@/lib/constants/delivery-phases';
import { groupMembersByRole, type ProjectMember } from '@/lib/hooks/use-project-members';

describe('project_members — роли (P2b, миграция 037)', () => {
  test('ровно 3 роли в порядке manager → implementer → installer', () => {
    expect(PROJECT_MEMBER_ROLE_ORDER).toEqual(['manager', 'implementer', 'installer']);
  });

  test('лейблы полны и согласованы с ORDER (роли только из констант)', () => {
    for (const role of PROJECT_MEMBER_ROLE_ORDER) {
      expect(PROJECT_MEMBER_ROLE_LABELS[role]).toBeTruthy();
    }
    expect(Object.keys(PROJECT_MEMBER_ROLE_LABELS).sort()).toEqual(
      [...PROJECT_MEMBER_ROLE_ORDER].sort(),
    );
  });

  test('русские лейблы ролей', () => {
    expect(PROJECT_MEMBER_ROLE_LABELS.manager).toBe('Менеджер');
    expect(PROJECT_MEMBER_ROLE_LABELS.implementer).toBe('Внедренец');
    expect(PROJECT_MEMBER_ROLE_LABELS.installer).toBe('Монтажник');
  });
});

function member(id: string, role: ProjectMember['role']): ProjectMember {
  return {
    id,
    org_id: 'org',
    project_id: 'proj',
    profile_id: `profile-${id}`,
    role,
    created_at: '2026-07-11T00:00:00Z',
    profile: { id: `profile-${id}`, full_name: `User ${id}`, avatar_url: null },
  };
}

describe('groupMembersByRole — группировка виджета «Команда»', () => {
  test('группы в порядке PROJECT_MEMBER_ROLE_ORDER, пустые роли скрыты', () => {
    const groups = groupMembersByRole([
      member('a', 'installer'),
      member('b', 'manager'),
      member('c', 'installer'),
    ]);
    expect(groups.map((g) => g.role)).toEqual(['manager', 'installer']);
    expect(groups[1].members.map((m) => m.id)).toEqual(['a', 'c']);
  });

  test('пустой список → нет групп (empty state)', () => {
    expect(groupMembersByRole([])).toEqual([]);
  });
});

describe('hasTaskProgress — предикат показа «N/M задач»', () => {
  test('total > 0 → показываем', () => {
    expect(hasTaskProgress(137)).toBe(true);
    expect(hasTaskProgress(1)).toBe(true);
  });

  test('0 / null / undefined → не показываем', () => {
    expect(hasTaskProgress(0)).toBe(false);
    expect(hasTaskProgress(null)).toBe(false);
    expect(hasTaskProgress(undefined)).toBe(false);
  });
});
