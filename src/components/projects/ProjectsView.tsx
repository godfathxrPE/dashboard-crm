'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { PipelineBoard } from './PipelineBoard';
import { StageBoard } from './StageBoard';

interface ProjectsViewProps {
  initialView: 'pipeline' | 'board';
}

export function ProjectsView({ initialView }: ProjectsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = (searchParams.get('view') as 'board' | null) === 'board' ? 'board' : initialView;

  const switchTo = useCallback(
    (target: 'pipeline' | 'board') => {
      const params = new URLSearchParams(searchParams.toString());
      if (target === 'pipeline') {
        params.delete('view');
      } else {
        params.set('view', 'board');
      }
      const qs = params.toString();
      router.push(`/projects${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  if (view === 'board') {
    return <StageBoard onSwitchView={() => switchTo('pipeline')} />;
  }

  return <PipelineBoard onSwitchView={() => switchTo('board')} />;
}
