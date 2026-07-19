'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { useStagesForPipeline } from '@/lib/hooks/use-pipelines';
import type { PipelineStage } from '@/types/database';

interface DealProgressBarProps {
  pipelineId: string;
  currentStageId: string;
  readOnly?: boolean;
  onStageClick?: (stageId: string) => void;
}

export function DealProgressBar({
  pipelineId,
  currentStageId,
  readOnly = false,
  onStageClick,
}: DealProgressBarProps) {
  const allStages = useStagesForPipeline(pipelineId);

  // Active stages only (exclude won/lost terminals)
  const stages = useMemo(
    () => allStages.filter((s) => !s.is_won && !s.is_lost),
    [allStages],
  );

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  // If current stage is won/lost (terminal), mark everything as done
  const isTerminal = currentIndex === -1 && allStages.some((s) => s.id === currentStageId && (s.is_won || s.is_lost));
  const isWon = allStages.some((s) => s.id === currentStageId && s.is_won);

  if (stages.length === 0) return null;

  return (
    <div>
      {/* Chevron segments */}
      <div className="flex h-8 overflow-hidden rounded-md">
        {stages.map((stage, i) => {
          const isFirst = i === 0;
          const isLast = i === stages.length - 1;

          let state: 'done' | 'current' | 'future';
          if (readOnly || isTerminal) {
            // Won: all done. Lost/readOnly: all muted
            state = isWon ? 'done' : 'future';
          } else if (i < currentIndex) {
            state = 'done';
          } else if (i === currentIndex) {
            state = 'current';
          } else {
            state = 'future';
          }

          return (
            <Segment
              key={stage.id}
              stage={stage}
              state={state}
              isFirst={isFirst}
              isLast={isLast}
              readOnly={readOnly || isTerminal}
              onClick={() => onStageClick?.(stage.id)}
            />
          );
        })}
      </div>

      {/* Meta info */}
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-text-dim">
          {(() => {
            if (isTerminal) {
              const terminal = allStages.find((s) => s.id === currentStageId);
              return terminal ? terminal.name : '—';
            }
            const current = stages[currentIndex];
            if (!current) return '—';
            return `${current.name}${current.probability != null ? ` · ${current.probability}%` : ''}`;
          })()}
        </span>
        {!isTerminal && currentIndex >= 0 && (
          <span className="text-text-mute">
            {currentIndex + 1} из {stages.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Single chevron segment
// ═══════════════════════════════════════════════════════

function Segment({
  stage,
  state,
  isFirst,
  isLast,
  readOnly,
  onClick,
}: {
  stage: PipelineStage;
  state: 'done' | 'current' | 'future';
  isFirst: boolean;
  isLast: boolean;
  readOnly: boolean;
  onClick: () => void;
}) {
  // Clip-path: chevron arrow shape
  // First segment: flat left. Last segment: flat right. Middle: arrow both sides.
  const arrow = 6; // px for arrow notch
  const clip = isFirst && isLast
    ? undefined
    : isFirst
      ? `polygon(0 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%)`
      : isLast
        ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${arrow}px 50%)`
        : `polygon(0 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%, ${arrow}px 50%)`;

  return (
    <div
      onClick={readOnly ? undefined : onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center px-1 text-xs font-medium whitespace-nowrap transition-[filter] duration-150',
        isFirst ? 'pl-2' : 'pl-3',
        readOnly ? 'cursor-default' : 'cursor-pointer hover:brightness-[0.92]',
      )}
      style={{
        clipPath: clip,
        backgroundColor:
          // S-UI-POLISH-1 (п.3): акцентная заливка активного сегмента + инверсия
          // текста на --bg (у тёмных тем --surface полупрозрачен → текст пропадал).
          state === 'current' ? 'var(--accent)' :
          state === 'done' ? 'var(--border2)' :
          'var(--surface2)',
        color:
          state === 'current' ? 'var(--bg)' :
          state === 'done' ? 'var(--text-dim)' :
          'var(--text-mute)',
      }}
      title={`${stage.name}${stage.probability != null ? ` (${stage.probability}%)` : ''}`}
    >
      <span className="overflow-hidden text-ellipsis">
        {stage.name}
      </span>
    </div>
  );
}
