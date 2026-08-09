import { describe, it, expect } from 'vitest';
import {
  canDeleteTask,
  bulkDeleteSet,
  deleteScopeLabel,
  pluralTasksAcc,
  type DeletableTaskLike,
  type DeleteActor,
} from '@/lib/domain/task-delete';
import { pluralRu } from '@/lib/utils/plural';

const ME = 'me-uuid';
const OTHER = 'other-uuid';

function task(over: Partial<DeletableTaskLike> = {}): DeletableTaskLike {
  return {
    id: over.id ?? 'task-1',
    lane: 'done',
    created_by: ME,
    assigned_to: null,
    project_id: null,
    wbs_code: null,
    ...over,
  };
}

const owner: DeleteActor = { userId: ME, role: 'owner' };
const admin: DeleteActor = { userId: ME, role: 'admin' };
const manager: DeleteActor = { userId: ME, role: 'manager' };

describe('canDeleteTask — зеркало RLS tasks_delete', () => {
  it('owner и admin удаляют любую строку организации', () => {
    const foreign = task({ created_by: OTHER, assigned_to: OTHER });
    expect(canDeleteTask(foreign, owner)).toBe(true);
    expect(canDeleteTask(foreign, admin)).toBe(true);
  });

  it('manager удаляет только то, что создал сам', () => {
    expect(canDeleteTask(task({ created_by: ME }), manager)).toBe(true);
    expect(canDeleteTask(task({ created_by: OTHER }), manager)).toBe(false);
  });

  it('назначение НЕ даёт права на удаление (в отличие от tasks_update)', () => {
    // Задача создана другим, назначена мне: редактировать можно, удалять — нет.
    const assignedToMe = task({ created_by: OTHER, assigned_to: ME });
    expect(canDeleteTask(assignedToMe, manager)).toBe(false);
  });

  it('viewer, создавший строку, удалить её по RLS может — гейт роли живёт в UI (canEdit)', () => {
    expect(canDeleteTask(task({ created_by: ME }), { userId: ME, role: 'viewer' })).toBe(true);
  });

  it('без пользователя — нет', () => {
    expect(canDeleteTask(task(), { userId: null, role: 'owner' })).toBe(false);
  });

  it('роль ещё летит с сервера (undefined) — работает только правило автора', () => {
    const loading: DeleteActor = { userId: ME, role: undefined };
    expect(canDeleteTask(task({ created_by: ME }), loading)).toBe(true);
    expect(canDeleteTask(task({ created_by: OTHER }), loading)).toBe(false);
  });

  it('created_by = null (строка без автора) — только owner/admin', () => {
    const orphan = task({ created_by: null });
    expect(canDeleteTask(orphan, owner)).toBe(true);
    expect(canDeleteTask(orphan, manager)).toBe(false);
  });
});

describe('bulkDeleteSet — набор под «Удалить выполненные (N)»', () => {
  it('берёт только выполненные', () => {
    const set = bulkDeleteSet(
      [task({ id: 'a', lane: 'done' }), task({ id: 'b', lane: 'now' }), task({ id: 'c', lane: 'next' })],
      owner,
    );
    expect(set.map((t) => t.id)).toEqual(['a']);
  });

  it('НЕ берёт строки плана (wbs_code + project_id), даже у owner и даже выполненные', () => {
    const planItem = task({ id: 'plan', wbs_code: '1.3.11', project_id: 'proj-1' });
    const set = bulkDeleteSet([planItem, task({ id: 'normal' })], owner);
    expect(set.map((t) => t.id)).toEqual(['normal']);
  });

  it('признак строки плана требует ОБА поля: код без проекта — обычная задача', () => {
    const codeNoProject = task({ id: 'code-only', wbs_code: '2.1' });
    const projectNoCode = task({ id: 'proj-only', project_id: 'proj-1' });
    const blankCode = task({ id: 'blank-code', wbs_code: '   ', project_id: 'proj-1' });
    const set = bulkDeleteSet([codeNoProject, projectNoCode, blankCode], owner);
    expect(set.map((t) => t.id).sort()).toEqual(['blank-code', 'code-only', 'proj-only']);
  });

  it('в режиме «Все» чужие задачи не попадают в набор — даже когда RLS их разрешает owner’у', () => {
    const mine = task({ id: 'mine', created_by: ME });
    const foreign = task({ id: 'foreign', created_by: OTHER, assigned_to: OTHER });
    expect(bulkDeleteSet([mine, foreign], owner).map((t) => t.id)).toEqual(['mine']);
  });

  it('назначенная мне, созданная другим: у owner’а входит, у manager’а — нет (RLS)', () => {
    const rows = [task({ id: 'assigned', created_by: OTHER, assigned_to: ME })];
    expect(bulkDeleteSet(rows, owner).map((t) => t.id)).toEqual(['assigned']);
    expect(bulkDeleteSet(rows, manager)).toEqual([]);
  });

  it('без пользователя набор пуст', () => {
    expect(bulkDeleteSet([task()], { userId: null, role: 'owner' })).toEqual([]);
  });

  it('порядок входа сохраняется — счётчик кнопки и строки на экране совпадают', () => {
    const rows = [task({ id: 'x' }), task({ id: 'y' }), task({ id: 'z' })];
    expect(bulkDeleteSet(rows, owner).map((t) => t.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('deleteScopeLabel — скоуп в тексте подтверждения', () => {
  it('«Мои» + два источника', () => {
    expect(deleteScopeLabel({ who: 'mine', sources: ['deal', 'personal'] })).toBe(
      'Мои · Сделки, Личное',
    );
  });

  it('«Все» без источников', () => {
    expect(deleteScopeLabel({ who: 'all', sources: [] })).toBe('Все · —');
  });

  it('активный поиск попадает в текст — он сузил набор', () => {
    expect(deleteScopeLabel({ who: 'mine', sources: ['personal'], query: 'фитнес' })).toBe(
      'Мои · Личное · поиск «фитнес»',
    );
  });

  it('пробелы поиском не считаются', () => {
    expect(deleteScopeLabel({ who: 'mine', sources: ['personal'], query: '   ' })).toBe(
      'Мои · Личное',
    );
  });
});

describe('счётное числительное', () => {
  it('«Удалить N задач…» — винительный падеж', () => {
    expect(pluralTasksAcc(1)).toBe('задачу');
    expect(pluralTasksAcc(2)).toBe('задачи');
    expect(pluralTasksAcc(4)).toBe('задачи');
    expect(pluralTasksAcc(5)).toBe('задач');
    expect(pluralTasksAcc(79)).toBe('задач');
    expect(pluralTasksAcc(0)).toBe('задач');
  });

  it('11–19 — исключение целиком, последняя цифра не решает', () => {
    expect(pluralTasksAcc(11)).toBe('задач');
    expect(pluralTasksAcc(12)).toBe('задач');
    expect(pluralTasksAcc(14)).toBe('задач');
    expect(pluralTasksAcc(21)).toBe('задачу');
    expect(pluralTasksAcc(22)).toBe('задачи');
    expect(pluralTasksAcc(111)).toBe('задач');
  });

  it('pluralRu отдаёт форму слова без числа', () => {
    expect(pluralRu(3, 'событие', 'события', 'событий')).toBe('события');
  });
});
