'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { useStagesForPipeline } from '@/lib/hooks/use-pipelines';
import { DELIVERY_PHASE_LABELS, DELIVERY_PHASE_COLOR, DELIVERY_PHASE_TEXT } from '@/lib/constants/delivery-phases';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Multi-track pipeline (детальная страница IIoT) — Sprint 29.1
//
// Источник истины — pipeline_stages текущей воронки сделки, а НЕ legacy enum.
// Треки = phase_group (attraction/working/approval/closing), внутри трека —
// order_index. Никакого хардкода названий стадий. Клик пишет stage_id (через
// onStageClick → moveToStageId в родителе), legacy `stage` этим компонентом
// больше не трогается.
// ═══════════════════════════════════════════════════════

// Delivery P1: компонент переиспользован фазовым гридом карточки внедрения —
// подмешиваем delivery-слаги (initiated/…) из единого источника. Слаги deal и
// delivery не пересекаются, deal-набор не тронут.
const PHASE_LABELS: Record<string, string> = {
  attraction: 'Привлечение',
  working: 'Проработка',
  approval: 'Согласование',
  closing: 'Закрытие',
  ...DELIVERY_PHASE_LABELS,
};

// Цвет трека — только для заголовка/точки (сегменты нейтральны, тема-безопасно,
// как в DealProgressBar). Ключ — phase_group; fallback на accent.
const PHASE_COLOR: Record<string, string> = {
  attraction: 'var(--track-prep-current)',
  working: 'var(--track-exp-current)',
  approval: 'var(--track-nego-current, var(--track-exp-current))',
  closing: 'var(--track-proj-current)',
  ...DELIVERY_PHASE_COLOR,
};

// Цвет ТЕКСТА лейбла трека — семантические *-text токены (visual-audit P1 §T3).
// track.color (заливка) остаётся только на точке-маркере; active/done лейблы
// красились track-current как текст (3–4:1 на светлом). Fallback на базовый
// семантический токен (в светлых темах track-current — нечитаемая пастель).
const PHASE_TEXT: Record<string, string> = {
  attraction: 'var(--accent-text, var(--accent))',
  working: 'var(--purple-text, var(--purple))',
  approval: 'var(--yellow-text, var(--yellow))',
  closing: 'var(--blue-text, var(--blue))',
  ...DELIVERY_PHASE_TEXT,
};

interface StackedPipelineProps {
  pipelineId: string;
  currentStageId: string;
  readOnly?: boolean;
  onStageClick?: (stageId: string) => void;
}

interface TrackGroup {
  key: string;
  label: string;
  color: string;
  textColor: string;
  stages: PipelineStage[];
}

export function StackedPipeline({
  pipelineId,
  currentStageId,
  readOnly = false,
  onStageClick,
}: StackedPipelineProps) {
  const allStages = useStagesForPipeline(pipelineId);

  // Активные стадии (без терминалов won/lost), по order_index.
  const stages = useMemo(
    () =>
      allStages
        .filter((s) => !s.is_won && !s.is_lost)
        .sort((a, b) => a.order_index - b.order_index),
    [allStages],
  );

  // Треки — группы phase_group, идущие подряд по order_index (устойчиво к любым
  // значениям phase_group; неизвестная группа получает свой label = raw-ключ).
  const tracks = useMemo<TrackGroup[]>(() => {
    const out: TrackGroup[] = [];
    for (const s of stages) {
      const key = s.phase_group ?? '—';
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.stages.push(s);
      } else {
        out.push({
          key,
          label: PHASE_LABELS[key] ?? key,
          color: PHASE_COLOR[key] ?? 'var(--accent)',
          textColor: PHASE_TEXT[key] ?? 'var(--accent-text, var(--accent))',
          stages: [s],
        });
      }
    }
    return out;
  }, [stages]);

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  const isWon = allStages.some((s) => s.id === currentStageId && s.is_won);
  const isLost = allStages.some((s) => s.id === currentStageId && s.is_lost);
  const isTerminal = currentIndex === -1 && (isWon || isLost);

  // Прогресс-бар — производная позиции stage_id (order_index среди активных
  // стадий), НЕ legacy probability. Won → 100%, lost/неизвестно → 0%.
  const pct = isWon
    ? 100
    : currentIndex >= 0
      ? Math.round(((currentIndex + 1) / stages.length) * 100)
      : 0;

  if (stages.length === 0) return null;

  const locked = readOnly || isTerminal;

  return (
    <div className="flex flex-col gap-3">
      {tracks.map((track) => {
        const trackHasCurrent = track.stages.some((s) => s.id === currentStageId);
        const firstOrder = track.stages[0].order_index;
        const lastOrder = track.stages[track.stages.length - 1].order_index;
        const currentOrder = stages[currentIndex]?.order_index ?? -1;
        // Состояние трека: будущие приглушаем ТОКЕНОМ (--text-mute), не opacity —
        // opacity-50 на контейнере ронял контраст текста до 1.7–2:1 (a11y-аудит P0).
        const trackState: 'future' | 'active' | 'done' =
          isWon || (currentOrder >= 0 && currentOrder > lastOrder)
            ? 'done'
            : trackHasCurrent
              ? 'active'
              : currentOrder >= 0 && currentOrder >= firstOrder
                ? 'active'
                : 'future';

        return (
          <div key={track.key} className={trackState === 'future' ? 'stage-future' : ''}>
            {/* Заголовок трека: у future лейбл — text-mute, цветная точка остаётся вторичным сигналом */}
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: track.color }} />
              <span
                className="phase-label text-[11px] font-medium"
                style={{ color: trackState === 'future' ? 'var(--text-mute)' : track.textColor }}
              >
                {track.label}
              </span>
              {trackHasCurrent && !locked && (
                <span
                  className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: 'var(--accent-l)', color: 'var(--accent)' }}
                >
                  {track.stages.find((s) => s.id === currentStageId)?.name}
                </span>
              )}
              {trackState === 'done' && (
                <span className="ml-1 text-[10px] text-text-mute">✓</span>
              )}
            </div>

            {/* Чеврон-бар трека */}
            <div className="flex h-9 overflow-hidden rounded-md">
              {track.stages.map((stage, i) => {
                const globalIdx = stages.findIndex((s) => s.id === stage.id);
                const isFirst = i === 0;
                const isLast = i === track.stages.length - 1;

                let state: 'done' | 'current' | 'future';
                if (locked) {
                  state = isWon ? 'done' : 'future';
                } else if (globalIdx < currentIndex) {
                  state = 'done';
                } else if (globalIdx === currentIndex) {
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
                    locked={locked}
                    onClick={() => onStageClick?.(stage.id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Общий прогресс */}
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

// ═══════════════════════════════════════════════════════
// Один сегмент-чеврон (нейтральная раскраска — тема-безопасно, как DealProgressBar)
// ═══════════════════════════════════════════════════════

function Segment({
  stage,
  state,
  isFirst,
  isLast,
  locked,
  onClick,
}: {
  stage: PipelineStage;
  state: 'done' | 'current' | 'future';
  isFirst: boolean;
  isLast: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const arrow = 7; // px — глубина стрелки-выемки
  const clip =
    isFirst && isLast
      ? undefined
      : isFirst
        ? `polygon(0 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%)`
        : isLast
          ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${arrow}px 50%)`
          : `polygon(0 0, calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%, 0 100%, ${arrow}px 50%)`;

  return (
    <div
      onClick={locked ? undefined : onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center px-1 text-[11px] font-medium whitespace-nowrap transition-[filter] duration-150',
        isFirst ? 'pl-2' : 'pl-3',
        locked ? 'cursor-default' : 'cursor-pointer hover:brightness-[0.92]',
      )}
      style={{
        clipPath: clip,
        backgroundColor:
          state === 'current' ? 'var(--text)' :
          state === 'done' ? 'var(--border2)' :
          'var(--surface2)',
        // current: инверсия через --bg, НЕ --surface — у тёмных тем surface
        // полупрозрачно-белый и текст пропадал на светлой заливке --text
        color:
          state === 'current' ? 'var(--bg)' :
          state === 'done' ? 'var(--text-dim)' :
          'var(--text-mute)',
      }}
      title={`${stage.name}${stage.probability != null ? ` (${stage.probability}%)` : ''}`}
    >
      <span className="overflow-hidden text-ellipsis">{stage.name}</span>
    </div>
  );
}
