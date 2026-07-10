'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { PipelineBoard } from './PipelineBoard';
import { StageBoard } from './StageBoard';
import { ProjectsTable } from './ProjectsTable';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { SavedViewChips } from '@/components/ui/SavedViewChips';
import { applyProjectQuickFilter, isQuickFilter, type ProjectQuickFilter } from '@/lib/utils/project-filters';
import type { Direction } from '@/types/database';

type ViewMode = 'pipeline' | 'board' | 'table';
type DirectionFilter = 'all' | Direction;

const DIRECTION_OPTIONS: ChipOption[] = [
  { label: 'Все', value: 'all' },
  { label: 'IIoT', value: 'iiot' },
  { label: 'ERP', value: 'erp' },
];

interface ProjectsViewProps {
  initialView: 'pipeline' | 'board';
}

export function ProjectsView({ initialView }: ProjectsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawView = searchParams.get('view');
  const view: ViewMode = rawView === 'board' ? 'board' : rawView === 'table' ? 'table' : initialView;

  const directionFilter = (searchParams.get('direction') ?? 'all') as DirectionFilter;

  const rawQuick = searchParams.get('q');
  const quickFilter: ProjectQuickFilter | null = isQuickFilter(rawQuick) ? rawQuick : null;

  const setQuick = useCallback(
    (q: ProjectQuickFilter | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set('q', q); else params.delete('q');
      const qs = params.toString();
      router.push(`/deals${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  const switchTo = useCallback(
    (target: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (target === 'pipeline') {
        params.delete('view');
      } else {
        params.set('view', target);
      }
      const qs = params.toString();
      router.push(`/deals${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  const setDirection = useCallback(
    (dir: DirectionFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (dir === 'all') {
        params.delete('direction');
      } else {
        params.set('direction', dir);
      }
      const qs = params.toString();
      router.push(`/deals${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  // Counts for chip badges
  const { data: allProjects } = useProjects();
  const directionOptions: ChipOption[] = useMemo(() => {
    const all = allProjects ?? [];
    return DIRECTION_OPTIONS.map((opt) => ({
      ...opt,
      count: opt.value === 'all' ? all.length : all.filter((p) => p.direction === opt.value).length,
    }));
  }, [allProjects]);

  // Быстрые пресеты: гниющие / без бюджета (в рамках выбранного направления)
  const quickOptions: ChipOption[] = useMemo(() => {
    const all = (allProjects ?? []).filter(
      (p) => directionFilter === 'all' || p.direction === directionFilter,
    );
    return [
      { label: 'Требуют внимания', value: 'attention', count: applyProjectQuickFilter(all, 'attention').length },
      { label: 'Без бюджета', value: 'nobudget', count: applyProjectQuickFilter(all, 'nobudget').length },
    ];
  }, [allProjects, directionFilter]);

  return (
    <div>
      {/* Direction filter — above view content */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ChipFilter
          options={directionOptions}
          selected={directionFilter === 'all' ? [] : [directionFilter]}
          onToggle={(val) => setDirection(val === directionFilter ? 'all' : val as DirectionFilter)}
          onReset={() => setDirection('all')}
        />
        <span className="h-4 w-px bg-border" />
        <ChipFilter
          options={quickOptions}
          selected={quickFilter ? [quickFilter] : []}
          onToggle={(val) => setQuick(val === quickFilter ? null : val as ProjectQuickFilter)}
          onReset={() => setQuick(null)}
        />
        <SavedViewChips />
      </div>

      {view === 'table' ? (
        <ProjectsTable directionFilter={directionFilter} quickFilter={quickFilter} onSwitchView={switchTo} />
      ) : view === 'board' ? (
        <StageBoard directionFilter={directionFilter} quickFilter={quickFilter} onSwitchView={() => switchTo('pipeline')} />
      ) : (
        <PipelineBoard directionFilter={directionFilter} quickFilter={quickFilter} onSwitchView={() => switchTo('board')} />
      )}
    </div>
  );
}
