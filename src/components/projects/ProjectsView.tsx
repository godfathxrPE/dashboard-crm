'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { PipelineBoard } from './PipelineBoard';
import { StageBoard } from './StageBoard';
import { ProjectsTable } from './ProjectsTable';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
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

  const switchTo = useCallback(
    (target: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (target === 'pipeline') {
        params.delete('view');
      } else {
        params.set('view', target);
      }
      const qs = params.toString();
      router.push(`/projects${qs ? `?${qs}` : ''}`);
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
      router.push(`/projects${qs ? `?${qs}` : ''}`);
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

  return (
    <div>
      {/* Direction filter — above view content */}
      <div className="mb-4">
        <ChipFilter
          options={directionOptions}
          selected={directionFilter === 'all' ? [] : [directionFilter]}
          onToggle={(val) => setDirection(val === directionFilter ? 'all' : val as DirectionFilter)}
          onReset={() => setDirection('all')}
        />
      </div>

      {view === 'table' ? (
        <ProjectsTable directionFilter={directionFilter} onSwitchView={switchTo} />
      ) : view === 'board' ? (
        <StageBoard directionFilter={directionFilter} onSwitchView={() => switchTo('pipeline')} />
      ) : (
        <PipelineBoard directionFilter={directionFilter} onSwitchView={() => switchTo('board')} />
      )}
    </div>
  );
}
