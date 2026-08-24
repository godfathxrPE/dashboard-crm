'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useActivityLog } from '@/lib/hooks/use-activity-log';
import { useDealStakeholders } from '@/lib/hooks/use-deal-stakeholders';
import { useStagesForPipeline } from '@/lib/hooks/use-pipelines';
import {
  useDealSignalThresholds,
  useDwellThresholds,
  useStageTargetDays,
} from '@/lib/hooks/use-org-settings';
import { resolveStageNorm, stageTimeGauge } from '@/lib/domain/stage-norm';
import {
  getDealSignals,
  VERDICT_CONFIG,
  type DealSignal,
  type DealSignalsResult,
  type SignalKey,
  type SignalState,
} from '@/lib/domain/deal-signals';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-HEALTH-V2-1: панель сигналов сделки вместо точки «здоровье N/8».
//
// Свёрнуто — вердикт + топ-причина; раскрыто — все сигналы с причиной и кнопкой.
// Цвет ТОЛЬКО семантическими токенами (--danger/--warning/--success): `--accent`
// для смысла не годится — в теме `t-washi` акцент === `--red`, и «в порядке»
// стало бы красным. `-l`-токен с альфа-модификатором запрещён (полупрозрачная
// заливка на тёмных темах просвечивает подложку).
// ═══════════════════════════════════════════════════════

const VERDICT_STYLES: Record<
  keyof typeof VERDICT_CONFIG,
  { chip: string; glyph: string }
> = {
  new:       { chip: 'bg-surface2 text-text-dim',        glyph: 'text-text-mute' },
  ok:        { chip: 'bg-success-l text-success-text',   glyph: 'text-success-text' },
  attention: { chip: 'bg-warning-l text-warning-text',   glyph: 'text-warning-text' },
  rotting:   { chip: 'bg-danger-l text-danger-text',     glyph: 'text-danger-text' },
};

// Глиф состояния сигнала — форма + цвет (CVD-safe), как у вердикта.
const STATE_STYLES: Record<Exclude<SignalState, 'na'>, { glyph: string; color: string }> = {
  bad:  { glyph: '▲', color: 'text-danger-text' },
  warn: { glyph: '◐', color: 'text-warning-text' },
  ok:   { glyph: '●', color: 'text-success-text' },
};

/**
 * Контекст сигналов собирается ОДИН раз — здесь, и передаётся в панель пропом.
 * Второй сборщик в соседнем компоненте означал бы вторую формулу нормы стадии и
 * второй запрос стейкхолдеров.
 *
 * `useActivityLog` — ТОТ ЖЕ хук и тот же ключ, что уже зовёт `DealFocusPanel`:
 * React Query отдаёт из кеша, второго запроса не будет.
 */
export function useDealSignals(project: Project): DealSignalsResult {
  const { data: entries } = useActivityLog(project.id);
  const { data: stakeholders } = useDealStakeholders(project.id);
  const allStages = useStagesForPipeline(project.pipeline_id);
  const targetDays = useStageTargetDays();
  const dwell = useDwellThresholds();
  const thresholds = useDealSignalThresholds();

  const stage = allStages.find((s) => s.id === project.stage_id) ?? null;

  // Норма стадии — ТОТ ЖЕ путь, что у кокпита (`resolveStageNorm` →
  // `stageTimeGauge`): вторая формула нормы разошлась бы с заливкой ячейки.
  const gauge = useMemo(
    () =>
      stage
        ? stageTimeGauge(
            project.stage_entered_at,
            resolveStageNorm(stage, targetDays, dwell),
            new Date(),
          )
        : null,
    [stage, project.stage_entered_at, targetDays, dwell],
  );

  return useMemo(
    () =>
      getDealSignals(
        project,
        {
          gauge,
          phaseGroup: stage?.phase_group ?? null,
          // `?? null` — «ещё не загрузились», а не «ноль участников»:
          // сигнал не должен загораться на спиннере.
          stakeholderCount: stakeholders?.length ?? null,
          lastActivityAt: entries?.[0]?.created_at ?? null,
        },
        thresholds,
      ),
    [project, gauge, stage?.phase_group, stakeholders, entries, thresholds],
  );
}

/**
 * Вердикт отдельным элементом (S-DEAL-RAIL-1): на полной карточке он живёт в
 * рабочей колонке под следующим шагом, а панель сигналов — в рельсе справа.
 * Стили вердикта одни на оба места: разъехавшись, они дали бы «Киснет» двух
 * разных цветов на одном экране.
 */
export function DealVerdictChip({ verdict }: { verdict: DealSignalsResult['verdict'] }) {
  const config = VERDICT_CONFIG[verdict];
  const styles = VERDICT_STYLES[verdict];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        styles.chip,
      )}
    >
      <span aria-hidden className={cn('leading-none', styles.glyph)}>{config.glyph}</span>
      {config.label}
    </span>
  );
}

export interface DealSignalsProps {
  result: DealSignalsResult;
  /** Хост решает, что делать по CTA: навигации внутри компонента нет. */
  onAction?: (key: SignalKey) => void;
  className?: string;
  /**
   * `false` — панель без вердикта и без сворачивания: список сигналов сразу
   * открыт (S-DEAL-RAIL-1, рельса контекста). Вердикт в этом режиме показывает
   * хост рядом со следующим шагом — дубль вердикта на одном экране был F-01.
   */
  showVerdict?: boolean;
}

export function DealSignals({ result, onAction, className, showVerdict = true }: DealSignalsProps) {
  const [open, setOpen] = useState(false);
  const { verdict, signals, top } = result;
  const config = VERDICT_CONFIG[verdict];
  const styles = VERDICT_STYLES[verdict];

  // Терминальная сделка отдаёт пустой список — панели просто нет.
  if (signals.length === 0) return null;

  if (!showVerdict) {
    return (
      <ul className={cn('space-y-1.5', className)}>
        {signals.map((s) => (
          <SignalRow key={s.key} signal={s} onAction={onAction} />
        ))}
      </ul>
    );
  }

  const ariaLabel = top
    ? `Здоровье сделки: ${config.label} — ${top.label}`
    : `Здоровье сделки: ${config.label}`;

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left
                   transition-colors hover:bg-surface-hover"
      >
        <span
          role="img"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            styles.chip,
          )}
        >
          <span aria-hidden className={cn('leading-none', styles.glyph)}>{config.glyph}</span>
          {config.label}
        </span>
        {top && (
          <span className="min-w-0 flex-1 truncate text-xs text-text-dim">{top.label}</span>
        )}
        <ChevronDown
          size={13}
          aria-hidden
          className={cn('shrink-0 text-text-mute transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {signals.map((s) => (
            <SignalRow key={s.key} signal={s} onAction={onAction} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalRow({
  signal,
  onAction,
}: {
  signal: DealSignal;
  onAction?: (key: SignalKey) => void;
}) {
  const state = STATE_STYLES[signal.state as Exclude<SignalState, 'na'>];
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={cn('mt-0.5 w-3 shrink-0 text-center text-xs leading-none', state.color)}>
        {state.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-text-main">{signal.label}</span>
        <span className="block text-meta text-text-mute">{signal.detail}</span>
      </span>
      {signal.cta && onAction && (
        <button
          type="button"
          onClick={() => onAction(signal.key)}
          className="shrink-0 rounded-lg border border-border px-2 py-0.5 text-meta text-text-dim
                     transition-colors hover:bg-surface-hover hover:text-text-main"
        >
          {signal.cta}
        </button>
      )}
    </li>
  );
}

/**
 * Дефолтный обработчик CTA: скролл к уже существующим якорям карточки сделки.
 * Живёт здесь, а не в `ProjectDetail`, потому что панель монтируется из
 * `DealFocusPanel` — но остаётся ЧИСТОЙ функцией над DOM, без рефов сквозь
 * компоненты и без новых порталов.
 */
export const SIGNAL_ANCHORS: Record<SignalKey, string | null> = {
  next_step: 'deal-next-step',
  // S-DEAL-RAIL-1: инфо-грид расформирован, дедлайн живёт строкой «Сводки».
  deadline: 'deal-summary',
  silence: 'deal-activity',
  single_threaded: 'deal-stakeholders',
  // Двигать стадию — решение, а не «починка сигнала»: кнопки у него нет.
  stage_dwell: null,
};

export function scrollToSignalAnchor(key: SignalKey): void {
  const id = SIGNAL_ANCHORS[key];
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
