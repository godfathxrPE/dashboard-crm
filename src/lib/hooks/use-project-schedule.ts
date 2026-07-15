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
      const gt: GanttTask = { task, ...span, isMilestone: task.is_milestone === true };
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
    for (const sl of swimlanes) {
      sl.tasks.sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
    }
    return { swimlanes, undated, phaseMode, isLoading: tL || cL, isError: tE || cE };
  }, [tasks, columns, tL, cL, tE, cE]);
}
