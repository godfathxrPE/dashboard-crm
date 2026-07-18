'use client';

import { useMemo } from 'react';
import { useProjectBoard } from './use-tasks';
import { useProjectColumns } from './use-project-columns';
import { isPhaseBoard } from '@/lib/constants/delivery-phases';
import { mskDateKey } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

export interface GanttTask {
  task: Task;
  start: string;          // YYYY-MM-DD (MSK для deadline)
  end: string;            // YYYY-MM-DD; == start у однодневных
  isMilestone: boolean;   // is_milestone === true — рендерим ромбом на start
  // S-WBS-1: иерархия внутри свимлейна.
  depth: number;          // 0 = корень; +1 на уровень вложенности (отступ строки)
  isSummary: boolean;     // есть дети-в-расписании → сводный бар (span = обёртка детей)
  parentId: string | null;// родитель В ЭТОМ ЖЕ свимлейне (иначе null — см. W7)
  // S-WBS-1.1: у задачи нет собственных дат, span целиком вычислен из детей
  // (undated-родитель, материализованный сводным баром вместо бакета «Без дат»).
  datesFromChildren?: boolean;
}
export interface GanttSwimlane {
  id: string;             // column.id | '__none__' | '__flat__'
  label: string | null;   // имя фазы; null → без заголовка (плоский режим)
  tasks: GanttTask[];
}
export interface ProjectSchedule {
  swimlanes: GanttSwimlane[];
  undated: Task[];        // ни start/end/deadline
  phaseMode: boolean;
  isLoading: boolean;
  isError: boolean;
}

// effective span: deadline (timestamptz) → MSK-дата; fallback + inversion-клэмп (как v0)
function effectiveSpan(task: Task): { start: string; end: string } | null {
  const dl = task.deadline ? mskDateKey(task.deadline) : null;
  const start = task.start_date ?? task.end_date ?? dl;
  let end = task.end_date ?? dl ?? task.start_date;
  if (!start || !end) return null;
  if (end < start) end = start;
  return { start, end };
}

// стабильный порядок баров: раньше по start, при равенстве — по end
const bySpan = (a: GanttTask, b: GanttTask) =>
  a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start);

/**
 * S-WBS-1: превращает плоский список задач свимлейна в дерево-порядок.
 * - Корни = задачи без parent_task_id ИЛИ с родителем ВНЕ этого свимлейна (W7).
 * - Обход pre-order: родитель, затем его дети (рекурсивно) с depth+1.
 * - Сводный бар: у задачи с детьми-в-расписании isSummary=true, span = обёртка
 *   детей (min start / max end), перекрывает собственные даты родителя.
 */
function buildTree(items: GanttTask[]): GanttTask[] {
  if (items.length < 2) return items;                 // 0/1 — дерева нет, sort не нужен
  const idSet = new Set(items.map((it) => it.task.id));
  const childrenOf = new Map<string, GanttTask[]>();
  const roots: GanttTask[] = [];
  for (const it of items) {
    const p = it.task.parent_task_id;
    if (p && idSet.has(p)) {
      (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(it);
    } else {
      roots.push(it);                                 // корень или родитель в другом свимлейне
    }
  }

  // Проход 1 (S-WBS-1.1): span снизу вверх, ДО сортировки — datesFromChildren-узлы
  // приходят с пустым сентинел-span и должны сортироваться по вычисленной обёртке.
  // Собственный span сводного узла кандидатом в min/max НЕ является (как в S-WBS-1).
  const computeSpan = (node: GanttTask): void => {
    const kids = childrenOf.get(node.task.id);
    if (!kids?.length) {
      node.isSummary = false;
      return;
    }
    node.isSummary = true;
    let minS = '';
    let maxE = '';
    for (const kid of kids) {
      computeSpan(kid);
      if (!kid.start) continue;                       // пустой span — не кандидат в обёртку
      if (!minS || kid.start < minS) minS = kid.start;
      if (!maxE || kid.end > maxE) maxE = kid.end;
    }
    if (minS) {
      node.start = minS;                              // сводный span = обёртка детей
      node.end = maxE;
    }
    // minS пуст ⇒ у узла нет датированных потомков в дереве: datesFromChildren-узел
    // остаётся с пустым span и защитно выбрасывается в visit ниже.
  };
  for (const root of roots) computeSpan(root);

  // Проход 2: pre-order (родитель в out ДО детей) по финальным спанам.
  const out: GanttTask[] = [];
  const visit = (node: GanttTask, depth: number, parentId: string | null): void => {
    if (!node.start) {
      // Не должно случаться: материализация (keepsInLane) гарантирует датированного
      // потомка в цепочке того же лейна. Защита от рассинхрона — не роняем Гант.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[gantt] узел без вычислимого span выброшен из дерева:', node.task.id);
      }
      return;
    }
    node.depth = depth;
    node.parentId = parentId;
    out.push(node);
    for (const kid of (childrenOf.get(node.task.id) ?? []).sort(bySpan)) {
      visit(kid, depth + 1, node.task.id);
    }
  };
  for (const root of roots.sort(bySpan)) visit(root, 0, null);
  return out;
}

export function useProjectSchedule(projectId: string): ProjectSchedule {
  const { tasks, isLoading: tL, isError: tE } = useProjectBoard(projectId);
  const { data: columns = [], isLoading: cL, isError: cE } = useProjectColumns(projectId);

  return useMemo(() => {
    const phaseMode = isPhaseBoard(columns);
    const all = tasks ?? [];
    const laneOf = (t: Task) => (phaseMode ? (t.column_id ?? '__none__') : '__flat__');

    // S-WBS-1.1 (закрытие F1): undated-задача с датированным потомком по цепочке
    // parent_task_id, НЕ покидающей её свимлейн, материализуется в лейне сводным
    // узлом (span из детей) вместо бакета «Без дат». Цепочка строго внутри лейна:
    // кросс-фазовый промежуточный узел рвёт дерево (W7, v1 split) — потомок в лейне
    // всплыл бы отдельным корнем, а предок остался бы пустым листом.
    const childrenByParent = new Map<string, Task[]>();
    for (const t of all) {
      if (!t.parent_task_id) continue;
      const arr = childrenByParent.get(t.parent_task_id) ?? [];
      arr.push(t);
      childrenByParent.set(t.parent_task_id, arr);
    }
    // Мемо по id корректен: лейн вдоль цепочки не меняется (равен лейну самой задачи).
    const keepMemo = new Map<string, boolean>();
    const keepsInLane = (t: Task, visited: Set<string>): boolean => {
      const memo = keepMemo.get(t.id);
      if (memo !== undefined) return memo;
      if (visited.has(t.id)) return false;            // защита от цикла (гард 048/052 в БД)
      visited.add(t.id);
      const lane = laneOf(t);
      let keep = false;
      for (const child of childrenByParent.get(t.id) ?? []) {
        if (laneOf(child) !== lane) continue;
        if (effectiveSpan(child) || keepsInLane(child, visited)) { keep = true; break; }
      }
      keepMemo.set(t.id, keep);
      return keep;
    };

    const undated: Task[] = [];
    const byLane = new Map<string, GanttTask[]>();

    for (const task of all) {
      const span = effectiveSpan(task);
      if (!span && !keepsInLane(task, new Set())) { undated.push(task); continue; }
      // depth/isSummary/parentId проставляет buildTree ниже (после сбора свимлейна).
      // Без span — summary-only узел: пустой сентинел, computeSpan перезапишет из детей.
      const gt: GanttTask = span
        ? { task, ...span, isMilestone: task.is_milestone === true, depth: 0, isSummary: false, parentId: null }
        : { task, start: '', end: '', isMilestone: task.is_milestone === true, depth: 0, isSummary: false, parentId: null, datesFromChildren: true };
      const laneId = laneOf(task);
      const arr = byLane.get(laneId) ?? [];
      arr.push(gt);
      byLane.set(laneId, arr);
    }

    let swimlanes: GanttSwimlane[];
    if (phaseMode) {
      swimlanes = [...columns]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, label: c.name, tasks: byLane.get(c.id) ?? [] }));
      const orphan = byLane.get('__none__');
      if (orphan?.length) swimlanes.push({ id: '__none__', label: 'Без фазы', tasks: orphan });
    } else {
      swimlanes = [{ id: '__flat__', label: null, tasks: byLane.get('__flat__') ?? [] }];
    }
    // S-WBS-1: внутри КАЖДОГО свимлейна — 1 дерево по parent_task_id (порядок
    // «родитель → дети», сводные бары). Группировка ТОЛЬКО внутри свимлейна: если
    // родитель и ребёнок в разных фазах (column_id) — оба остаются корнями в своих
    // лейнах (v1; кросс-фазовые деревья — v2, см. роадмап).
    for (const sl of swimlanes) {
      sl.tasks = buildTree(sl.tasks);
    }
    // Fix (прод): бакет «Без дат» шёл в порядке выборки из БД (вразнобой). Ключ —
    // wbs_code если заполнен, иначе номер этапа в начале task.text; numeric-aware,
    // чтобы «1.2» < «1.10» и «1.x» < «2.x». Array.sort в V8 стабильна.
    const sortKey = (t: Task) => (t.wbs_code && t.wbs_code.trim()) ? t.wbs_code : t.text;
    undated.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'ru', { numeric: true }));
    return { swimlanes, undated, phaseMode, isLoading: tL || cL, isError: tE || cE };
  }, [tasks, columns, tL, cL, tE, cE]);
}
