'use client';

import { cn } from '@/lib/utils/cn';
import { STAGE_CONFIG, type DealStage } from '@/lib/validators/project';

// ═══════════════════════════════════════════════════════
// 3-Track Pipeline — 11 stages across 3 tracks
// Uses inline styles for solid (non-transparent) backgrounds
// ═══════════════════════════════════════════════════════

interface TrackStage {
  key: DealStage;
  label: string;
}

interface Track {
  id: string;
  label: string;
  stages: TrackStage[];
  dot: string;         // CSS var for dot + header text + done text color
  doneBg: string;      // CSS var for solid done background
  currentBg: string;   // CSS var for solid current background
}

const TRACKS: Track[] = [
  {
    id: 'prep',
    label: 'Подготовка',
    dot: 'var(--green)',
    doneBg: 'var(--track-prep-done)',
    currentBg: 'var(--track-prep-current)',
    stages: [
      { key: 'new_lead', label: 'Лид' },
      { key: 'qualification', label: 'Квалификация' },
      { key: 'waiting_materials', label: 'Материалы' },
      { key: 'preparing_kp', label: 'Подготовка КП' },
    ],
  },
  {
    id: 'exp',
    label: 'Эксперимент',
    dot: 'var(--purple)',
    doneBg: 'var(--track-exp-done)',
    currentBg: 'var(--track-exp-current)',
    stages: [
      { key: 'preparing_docs', label: 'Документы' },
      { key: 'cz_approval', label: 'Согласование ЧЗ' },
      { key: 'trilateral_meeting', label: 'Встреча 3х' },
      { key: 'experiment_setup', label: 'Эксперимент' },
    ],
  },
  {
    id: 'proj',
    label: 'Проект',
    dot: 'var(--accent)',
    doneBg: 'var(--track-proj-done)',
    currentBg: 'var(--track-proj-current)',
    stages: [
      { key: 'contract_review', label: 'Защита КП' },
      { key: 'contract_signing', label: 'Договор' },
      { key: 'won', label: 'Запуск проекта' },
    ],
  },
];

// All stage keys used in pipeline (11 total)
const ALL_PIPELINE_STAGES = TRACKS.flatMap((t) => t.stages.map((s) => s.key));

function getTrackState(track: Track, currentStage: DealStage): 'future' | 'active' | 'done' {
  const currentOrder = STAGE_CONFIG[currentStage]?.order ?? -1;
  const firstOrder = STAGE_CONFIG[track.stages[0].key].order;
  const lastOrder = STAGE_CONFIG[track.stages[track.stages.length - 1].key].order;

  if (currentStage === 'won') return 'done';
  if (currentOrder > lastOrder) return 'done';
  if (currentOrder >= firstOrder && currentOrder <= lastOrder) return 'active';
  return 'future';
}

interface StackedPipelineProps {
  currentStage: DealStage;
  onStageClick?: (stage: DealStage) => void;
}

export function StackedPipeline({ currentStage, onStageClick }: StackedPipelineProps) {
  const currentOrder = STAGE_CONFIG[currentStage]?.order ?? 0;
  const isTerminal = currentStage === 'won' || currentStage === 'lost';

  // Overall progress (11 stages)
  const totalStages = ALL_PIPELINE_STAGES.length;
  const completedStages = currentStage === 'won'
    ? totalStages
    : ALL_PIPELINE_STAGES.filter((s) => STAGE_CONFIG[s].order < currentOrder).length + 1;
  const pct = Math.round((Math.min(completedStages, totalStages) / totalStages) * 100);

  return (
    <div className="flex flex-col gap-3">
      {TRACKS.map((track) => {
        const trackState = getTrackState(track, currentStage);
        const currentLabel = track.stages.find((s) => s.key === currentStage)?.label;

        return (
          <div key={track.id} className={trackState === 'future' ? 'opacity-50' : ''}>
            {/* Track header */}
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: track.dot }} />
              <span className="text-[11px] font-medium" style={{ color: track.dot }}>
                {track.label}
              </span>
              {trackState === 'active' && currentLabel && (
                <span
                  className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: track.doneBg, color: track.dot }}
                >
                  {currentLabel}
                </span>
              )}
              {trackState === 'done' && (
                <span className="ml-1 text-[10px] text-text-mute">✓</span>
              )}
            </div>

            {/* Chevron bar */}
            <div className="flex h-9 overflow-hidden rounded-md">
              {track.stages.map((stage, i) => {
                const stageOrder = STAGE_CONFIG[stage.key].order;
                const isLast = i === track.stages.length - 1;

                let state: 'done' | 'current' | 'future';
                if (isTerminal && currentStage === 'won') {
                  state = 'done';
                } else if (stageOrder < currentOrder) {
                  state = 'done';
                } else if (stage.key === currentStage) {
                  state = 'current';
                } else {
                  state = 'future';
                }

                const bg = state === 'done' ? track.doneBg
                  : state === 'current' ? track.currentBg
                  : 'var(--surface2)';
                const color = state === 'done' ? track.dot
                  : state === 'current' ? 'white'
                  : 'var(--text-mute)';

                return (
                  <div
                    key={stage.key}
                    onClick={() => !isTerminal && onStageClick?.(stage.key)}
                    className={cn(
                      'relative flex flex-1 items-center justify-center px-1 pl-3',
                      'text-[11px] font-medium whitespace-nowrap',
                      'transition-[filter] duration-150',
                      !isTerminal && 'cursor-pointer hover:brightness-[0.92]',
                    )}
                    style={{ background: bg, color }}
                  >
                    <span className="overflow-hidden text-ellipsis">
                      {stage.label}
                    </span>
                    {!isLast && (
                      <div
                        className="absolute -right-[7px] top-0 z-[1] h-0 w-0 border-y-[18px] border-l-[7px] border-y-transparent"
                        style={{ borderLeftColor: bg }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Overall progress bar */}
      <div className="mt-1 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-text-dim">{pct}%</span>
      </div>
    </div>
  );
}
