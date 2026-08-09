// ═══════════════════════════════════════════════════════
// S-TASKS-FIX-2: кого разрешено удалять из списка задач.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Удаление тут физическое: `deleted_at` в схеме нет ни у
// одной таблицы, `useDeleteTask`/`useDeleteTasks` делают `DELETE`, отката нет.
// Значит набор строк, попадающий под кнопку «Удалить выполненные (N)», — это
// решение, которое обязано быть проверяемым тестом, а не выражением внутри JSX,
// которое перепишут при следующей правке вёрстки.
//
// ДВА РАЗНЫХ ГЕЙТА, И ЭТО НАМЕРЕННО:
//
//  • `canDeleteTask` — точечное удаление (иконка в строке). Зеркало RLS-политики
//    `tasks_delete`: owner/admin ЛИБО автор строки. Показывать иконку шире
//    политики нельзя — клик давал бы 403 «в пустоту»; уже́ (только автор) —
//    отняло бы у владельца организации право убрать чужой мусор поштучно.
//
//  • `bulkDeleteSet` — массовое удаление. Строго уже: плюс «только мои».
//    У owner'а RLS разрешает снести выполненные задачи всей команды, и именно
//    поэтому массовая кнопка так не делает: человек смотрит на список в режиме
//    «Все», жмёт «Удалить выполненные», и чужая закрытая работа исчезает без
//    отката. Точечное удаление чужой строки остаётся — там это осознанный клик
//    по конкретной задаче, а не сгребание набора.
//
// ⚠️ RLS — второй рубеж, не первый. Клиентский предикат нужен, чтобы кнопка не
//    врала о числе; сервер всё равно отвергнет лишнее.
// ═══════════════════════════════════════════════════════

import { isPlanItem, type PlanItemLike } from './plan-item';
import { isMine, SOURCE_LABELS, type OwnedTaskLike, type TaskSource } from '@/lib/utils/task-view';
import { pluralRu } from '@/lib/utils/plural';
import type { OrgRole } from '@/types/database';

/** Минимум, от которого зависят предикаты удаления. */
export interface DeletableTaskLike extends PlanItemLike, OwnedTaskLike {
  id: string;
  lane: string;
}

/** Кто удаляет: id и роль в текущей организации (`useOrgRole`). */
export interface DeleteActor {
  userId: string | null;
  /** `undefined` — роль ещё летит с сервера; трактуется как «не owner/admin». */
  role: OrgRole | null | undefined;
}

/**
 * Зеркало политики `tasks_delete`:
 * `org_id = current_org_id() AND (current_org_role() IN ('owner','admin') OR created_by = auth.uid())`.
 *
 * `org_id` здесь не проверяется намеренно: в кэш `useTasks` попадают только
 * строки своей организации — SELECT-политика уже отсекла чужие, второй раз
 * сверять нечего и нечем (org_id клиенту не нужен).
 *
 * ⚠️ `assigned_to` права на удаление НЕ даёт — в отличие от `tasks_update`.
 *    Задача, назначенная мне, но созданная другим, редактируется мной и НЕ
 *    удаляется. Предикат «Мои» её включает, этот — нет; расхождение реальное,
 *    поэтому `bulkDeleteSet` пересекает оба, а не полагается на один.
 */
export function canDeleteTask(task: DeletableTaskLike, actor: DeleteActor): boolean {
  if (!actor.userId) return false;
  if (actor.role === 'owner' || actor.role === 'admin') return true;
  return !!task.created_by && task.created_by === actor.userId;
}

/**
 * Набор под кнопку «Удалить выполненные (N)».
 *
 * Вход — то, что видно на экране (после источника, Мои/Все, режима «Выполнено»
 * и поиска), а не все задачи организации: владелец смотрит на отфильтрованный
 * список, и удалиться должен ровно он.
 *
 * Четыре конъюнкта, каждый закрывает свой промах:
 *  1. `lane === 'done'` — невыполненное из списка не удаляем вовсе.
 *  2. `!isPlanItem` — строка плана живёт на доске «План» и в Ганте. `TasksView`
 *     режет их раньше (`excludePlanItems`), и всё равно проверяем здесь: гейт
 *     обязан держаться на самом наборе, а не на порядке фильтров у вызывающего.
 *  3. `isMine` — чужая закрытая работа под массовое удаление не попадает.
 *  4. `canDeleteTask` — то, что всё равно отвергнет RLS, не попадает в счётчик.
 */
export function bulkDeleteSet<T extends DeletableTaskLike>(
  visible: readonly T[],
  actor: DeleteActor,
): T[] {
  if (!actor.userId) return [];
  return visible.filter(
    (t) =>
      t.lane === 'done' &&
      !isPlanItem(t) &&
      isMine(t, actor.userId) &&
      canDeleteTask(t, actor),
  );
}

/** Скоуп, в котором человек нажал массовое удаление — для текста подтверждения. */
export interface DeleteScope {
  who: 'mine' | 'all';
  sources: readonly TaskSource[];
  /** Строка поиска; пустая — поиска нет. */
  query?: string;
}

/**
 * Что именно удаляется, словами. Подтверждение обязано назвать скоуп: «Удалить
 * 79 задач» без него читается как «все выполненные в базе», а удалится
 * отфильтрованное подмножество (или наоборот — человек решит, что чистит
 * «Личное», а в наборе ещё и сделки).
 */
export function deleteScopeLabel(scope: DeleteScope): string {
  const sources = scope.sources.length
    ? scope.sources.map((s) => SOURCE_LABELS[s]).join(', ')
    : '—';
  const parts = [scope.who === 'mine' ? 'Мои' : 'Все', sources];
  const q = scope.query?.trim();
  if (q) parts.push(`поиск «${q}»`);
  return parts.join(' · ');
}

/** «1 задачу / 2 задачи / 5 задач» — винительный падеж, для «Удалить N …». */
export function pluralTasksAcc(n: number): string {
  return pluralRu(n, 'задачу', 'задачи', 'задач');
}
