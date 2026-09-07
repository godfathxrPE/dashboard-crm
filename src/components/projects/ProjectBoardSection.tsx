'use client';

import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useProjectColumns } from '@/lib/hooks/use-project-columns';
import { useProjectBoard } from '@/lib/hooks/use-tasks';
import { ProjectBoard } from '@/components/tasks/ProjectBoard';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (задача 2): доска задач сделки — из вкладки в стопку зоны
// «Работа». Только для сделки (type='client'): у delivery/internal доска
// остаётся вкладкой в `workContent` (ProjectDetail.tsx) — там своя механика,
// эту секцию они не монтируют.
//
// `useProjectColumns`/`useProjectBoard` вызваны здесь ВТОРОЙ раз (те же, что
// внутри `ProjectBoard`) — не второй запрос: одинаковый ключ кэша React Query
// дедуплицирует конкурентные вызовы в одном рендере и отдаёт общие данные.
// ═══════════════════════════════════════════════════════

export interface ProjectBoardSectionProps {
  projectId: string;
  canManage: boolean;
}

export function ProjectBoardSection({ projectId, canManage }: ProjectBoardSectionProps) {
  const { data: columns = [] } = useProjectColumns(projectId);
  const { tasks, tasksByColumn } = useProjectBoard(projectId);

  const total = tasks?.length ?? 0;
  let started = 0;
  let paused = 0;
  let done = 0;
  for (const col of columns) {
    const n = tasksByColumn[col.id]?.length ?? 0;
    if (col.category === 'started') started += n;
    else if (col.category === 'paused') paused += n;
    else if (col.category === 'done') done += n;
  }

  return (
    <CollapsibleSection
      projectId={projectId}
      sectionId="board"
      title="Доска задач"
      badge={
        total > 0 && (
          <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
            {total}
          </span>
        )
      }
      summary={`${started} в работе · ${paused} ждёт · ${done} готово`}
      defaultExpanded={false}
    >
      <ProjectBoard projectId={projectId} canManageColumns={canManage} />
    </CollapsibleSection>
  );
}
