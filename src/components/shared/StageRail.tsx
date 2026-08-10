'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-PIPELINE-COCKPIT-1: карта воронки — узлы на линии, группы по phase_group.
//
// Раскрывается под строкой кокпита и остаётся ЕДИНСТВЕННЫМ местом отката назад
// (клик по пройденному узлу). Пришла на смену чевронам StackedPipeline:
// узел — обычный <button> с обычным focus-ring, без clip-path. Именно clip-path
// заставлял рисовать focus-ring на внутреннем span — полигон срезал outline
// самого сегмента; вместе с шевронами уходит и этот костыль.
//
// Компонент чисто презентационный: ни одного запроса, ни знания о сущностях —
// стадии и обработчики приходят от вызывающего (ProjectDetail, LeadDetail).
// ═══════════════════════════════════════════════════════

export interface StageRailStage {
  id: string;
  name: string;
  phase_group?: string | null;
}

export interface StageRailProps {
  /** Активные стадии, уже отфильтрованные и отсортированные вызывающим. */
  stages: StageRailStage[];
  /** Индекс текущей стадии; -1 — терминал (won/lost/converted). */
  currentIndex: number;
  /** Терминал: узлы некликабельны. */
  locked?: boolean;
  /** won: все узлы галками — воронка пройдена целиком. */
  allDone?: boolean;
  /** Клик по узлу: done — откат, future — переход вперёд. Не задан ⇒ карта read-only. */
  onStageClick?: (stageId: string) => void;
  /** phase_group → подпись группы; не задан ⇒ группы не подписываются. */
  groupLabels?: Record<string, string>;
}

interface RailGroup {
  key: string;
  label: string;
  stages: { stage: StageRailStage; index: number }[];
}

export function StageRail({
  stages,
  currentIndex,
  locked = false,
  allDone = false,
  onStageClick,
  groupLabels,
}: StageRailProps) {
  // Группы — подряд идущие phase_group (логика tracks из StackedPipeline:
  // устойчива к любым значениям, неизвестная группа получает label = raw-ключ).
  const groups = useMemo<RailGroup[]>(() => {
    const out: RailGroup[] = [];
    stages.forEach((stage, index) => {
      const key = stage.phase_group ?? '—';
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.stages.push({ stage, index });
      } else {
        out.push({ key, label: groupLabels?.[key] ?? key, stages: [{ stage, index }] });
      }
    });
    return out;
  }, [stages, groupLabels]);

  if (stages.length === 0) return null;

  const hasGroupLabels = !!groupLabels && groups.some((g) => g.key !== '—');

  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {groups.map((group, gi) => {
        const groupActive = group.stages.some(({ index }) => index === currentIndex);
        return (
          <div key={`${group.key}-${gi}`} className="flex items-start">
            {gi > 0 && <span className="mx-1.5 w-px self-stretch bg-border2" aria-hidden />}
            <div className="flex flex-col gap-1">
              {hasGroupLabels && (
                <span
                  className="px-0.5 text-meta font-semibold uppercase tracking-wider"
                  style={{ color: groupActive ? 'var(--accent-text, var(--accent))' : 'var(--text-mute)' }}
                >
                  {group.label}
                </span>
              )}
              <div className="flex items-start">
                {group.stages.map(({ stage, index }, si) => {
                  const state = allDone
                    ? 'done'
                    : currentIndex >= 0 && index < currentIndex
                      ? 'done'
                      : index === currentIndex
                        ? 'current'
                        : 'future';
                  return (
                    <div key={stage.id} className="flex items-start">
                      {si > 0 && <Connector filled={allDone || (currentIndex >= 0 && index <= currentIndex)} />}
                      <RailNode
                        stage={stage}
                        state={state}
                        locked={locked}
                        onClick={onStageClick ? () => onStageClick(stage.id) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Линия между узлами: пройденная часть — акцентом, дальше — border2. */
function Connector({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('mt-[0.4375rem] h-[2px] min-w-2 flex-1 rounded', filled ? 'bg-accent' : 'bg-border2')}
    />
  );
}

function RailNode({
  stage,
  state,
  locked,
  onClick,
}: {
  stage: StageRailStage;
  state: 'done' | 'current' | 'future';
  locked: boolean;
  onClick?: () => void;
}) {
  // Текущий узел кликом ничего не делает (обработчик и так отсекает равный
  // order_index) — не рендерим его кнопкой, чтобы не обещать действие.
  const clickable = !locked && !!onClick && state !== 'current';
  const title =
    state === 'done'
      ? `Вернуть на стадию «${stage.name}»`
      : state === 'future'
        ? `Перейти на стадию «${stage.name}»`
        : stage.name;

  const dot = (
    <span
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full',
        state === 'done' && 'bg-accent',
        state === 'current' && 'border-2 border-accent bg-surface',
        state === 'future' && 'border-[1.5px] border-border2 bg-surface',
      )}
    >
      {state === 'done' && <Check size={9} strokeWidth={3} style={{ color: 'var(--on-accent)' }} />}
      {state === 'current' && (
        <span className="h-[0.3125rem] w-[0.3125rem] rounded-full bg-accent" aria-hidden />
      )}
    </span>
  );

  const label = (
    <span
      className={cn(
        'max-w-[7.5rem] text-center text-xs leading-tight',
        state === 'done' && 'text-text-dim',
        state === 'current' && 'font-semibold text-text-main',
        state === 'future' && 'text-text-mute',
      )}
    >
      {stage.name}
    </span>
  );

  if (!clickable) {
    return (
      <span className="flex flex-col items-center gap-1 px-1" title={stage.name}>
        {dot}
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex flex-col items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-surface2
                 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {dot}
      {label}
    </button>
  );
}
