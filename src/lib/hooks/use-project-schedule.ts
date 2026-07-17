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

  const out: GanttTask[] = [];
  // visit проставляет depth/isSummary/parentId и возвращает эффективный span
  // (для сводных — обёртку детей; DFS снизу вверх, порядок в out — сверху вниз).
  const visit = (node: GanttTask, depth: number, parentId: string | null): { start: string; end: string } => {
    node.depth = depth;
    node.parentId = parentId;
    out.push(node);                                   // родитель в out ДО детей (pre-order)
    const kids = (childrenOf.get(node.task.id) ?? []).sort(bySpan);
    if (kids.length === 0) {
      node.isSummary = false;
      return { start: node.start, end: node.end };
    }
    node.isSummary = true;
    let minS = kids[0].start;
    let maxE = kids[0].end;
    for (const kid of kids) {
      const span = visit(kid, depth + 1, node.task.id);
      if (span.start < minS) minS = span.start;
      if (span.end > maxE) maxE = span.end;
    }
    node.start = minS;                                // сводный span = обёртка детей
    node.end = maxE;
    return { start: minS, end: maxE };
  };

  for (const root of roots.sort(bySpan)) visit(root, 0, null);
  return out;
}

export function useProjectSchedule(projectId: string): ProjectSchedule {
  const { tasks, isLoading: tL, isError: tE } = useProjectBoard(projectId);
  const { data: columns = [], isLoading: cL, isError: cE } = useProjectColumns(projectId);

  return useMemo(() => {
    const phaseMode = isPhaseBoard(columns);
    const undated: Task[] = [];
    const byLane = new Map<string, GanttTask[]>();

    for (const task of tasks ?? []) {
      const span = effectiveSpan(task);
      if (!span) { undated.push(task); continue; }
      // depth/isSummary/parentId проставляет buildTree ниже (после сбора свимлейна).
      const gt: GanttTask = { task, ...span, isMilestone: task.is_milestone === true, depth: 0, isSummary: false, parentId: null };
      const laneId = phaseMode ? (task.column_id ?? '__none__') : '__flat__';
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
    return { swimlanes, undated, phaseMode, isLoading: tL || cL, isError: tE || cE };
  }, [tasks, columns, tL, cL, tE, cE]);
}
