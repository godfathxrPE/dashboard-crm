import { describe, test, expect } from 'vitest';
import {
  PROJECT_MEMBER_ROLE_LABELS,
  PROJECT_MEMBER_ROLE_ORDER,
  PROJECT_ROLES_BY_CATEGORY,
  rolesForProject,
  hasTaskProgress,
} from '@/lib/constants/delivery-phases';
import { groupMembersByRole, type ProjectMember } from '@/lib/hooks/use-project-members';

describe('project_members — роли (S-TEAM-ROLES-1, миграция 063)', () => {
  test('8 ролей в ORDER', () => {
    expect(PROJECT_MEMBER_ROLE_ORDER).toEqual([
      'pm', 'manager', 'analyst', 'architect', 'developer',
      'implementer', 'installer', 'launch_lead',
    ]);
  });

  test('лейблы полны и согласованы с ORDER (роли только из констант)', () => {
    for (const role of PROJECT_MEMBER_ROLE_ORDER) {
      expect(PROJECT_MEMBER_ROLE_LABELS[role]).toBeTruthy();
    }
    expect(Object.keys(PROJECT_MEMBER_ROLE_LABELS).sort()).toEqual(
      [...PROJECT_MEMBER_ROLE_ORDER].sort(),
    );
  });

  test('ключевые лейблы', () => {
    expect(PROJECT_MEMBER_ROLE_LABELS.pm).toBe('Руководитель проекта');
    expect(PROJECT_MEMBER_ROLE_LABELS.manager).toBe('Менеджер проекта');
    expect(PROJECT_MEMBER_ROLE_LABELS.launch_lead).toBe('Руководитель запуска');
  });

  test('каждая категория — подмножество ORDER (нет ролей мимо CHECK 063)', () => {
    for (const roles of Object.values(PROJECT_ROLES_BY_CATEGORY)) {
      for (const role of roles) expect(PROJECT_MEMBER_ROLE_ORDER).toContain(role);
    }
  });

  test('rolesForProject: ERP без монтажника/внедренца/РЗ', () => {
    const erp = rolesForProject('erp', 'delivery');
    expect(erp).toContain('architect');
    expect(erp).toContain('developer');
    expect(erp).not.toContain('installer');
    expect(erp).not.toContain('implementer');
    expect(erp).not.toContain('launch_lead');
  });

  test('rolesForProject: IIoT с монтажником/внедренцем/РЗ, без архитектора/программиста', () => {
    const iiot = rolesForProject('iiot', 'delivery');
    expect(iiot).toContain('implementer');
    expect(iiot).toContain('installer');
    expect(iiot).toContain('launch_lead');
    expect(iiot).not.toContain('architect');
    expect(iiot).not.toContain('developer');
  });

  test('rolesForProject: internal — только pm/manager/analyst (direction игнорируется)', () => {
    expect(rolesForProject(null, 'internal')).toEqual(['pm', 'manager', 'analyst']);
    expect(rolesForProject('iiot', 'internal')).toEqual(['pm', 'manager', 'analyst']);
  });

  test('rolesForProject: manager есть в каждой категории (дефолт add-формы валиден)', () => {
    for (const roles of Object.values(PROJECT_ROLES_BY_CATEGORY)) {
      expect(roles).toContain('manager');
    }
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
