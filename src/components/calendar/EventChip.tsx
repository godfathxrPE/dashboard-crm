'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { Flag } from 'lucide-react';
import { KIND_META } from '@/lib/timeline/kind-meta';

// ═══════════════════════════════════════════════════════
// S-CAL-MONTH-1: чип события — один компонент на неделю и месяц.
//
// Анатомия пришла из `WeekLanes.Chip` (S-CAL-LANES-1) и до этого спринта жила
// только там. Месяц получил такие же чипы — и второй рукописный чип разошёлся бы
// с первым ровно так же, как расходились две карты «вид → иконка» до S-TL-4.
//
// ⚠️ ЦВЕТ ВИДА НЕСЁТ ИКОНКА, А НЕ ТЕКСТ. `KIND_META.fg` подписан «цвет иконки»,
// подобран под графику (≥3:1): время на чипе 11px, ему нужно 4.5:1, а text-green
// давал 3.9:1, text-yellow 3.84:1 — на тинте «сегодня» ещё ниже. Текст берёт
// `--text`: 15:1 во всех семи темах. Урок S-CAL-LANES-1, не «упрощать».
//
// Различаются неделя и месяц ТОЛЬКО раскладкой:
//  • `lane` — пилюля, позиционируется родителем абсолютно (класс `.lane-chip`
//    несёт translateY(-50%) — центрирование на `top: N%`);
//  • `cell` — строка во всю ширину ячейки месяца, название режется ellipsis.
// Поэтому позиционные стили приходят из `style` родителя, а не изнутри.
// ═══════════════════════════════════════════════════════

export type ChipKind = 'call' | 'meeting' | 'task' | 'deadline' | 'project';

export const CHIP_KIND_LABEL: Record<ChipKind, string> = {
  call: 'Звонок',
  meeting: 'Встреча',
  task: 'Задача',
  deadline: 'Дедлайн сделки',
  project: 'Шаг по сделке',
};

// Пара «тинт + иконка» — из KIND_META, единственной карты видов в проекте (её же
// читают лента сущности и виджет дашборда). `deadline` — не TimelineKind (дедлайн
// сделки не событие ленты), поэтому у него одного пара задана явно.
const DEADLINE_META = { icon: Flag, dot: 'bg-danger-l', fg: 'text-danger-text' } as const;

export const chipMeta = (kind: ChipKind) => (kind === 'deadline' ? DEADLINE_META : KIND_META[kind]);

/** Подпись для aria-label и title: «Звонок 10:30, Иванов». */
export function chipAriaLabel(kind: ChipKind, timeLabel: string | null, title: string): string {
  return `${CHIP_KIND_LABEL[kind]}${timeLabel ? ` ${timeLabel}` : ''}, ${title}`;
}

interface EventChipProps {
  kind: ChipKind;
  title: string;
  /** null — событие без времени (дедлайн сделки, встреча без `time`). */
  timeLabel: string | null;
  /** Критичный приоритет задачи — бордер `--danger` поверх тинта вида. */
  critical?: boolean;
  /** Раскладка: пилюля на дорожке недели или строка в ячейке месяца. */
  layout: 'lane' | 'cell';
  /** `lane`: рядов не хватило — чип без названия, оно уходит в title/aria-label. */
  compressed?: boolean;
  /** Позиционные стили от родителя (left/top/maxWidth/zIndex для `lane`). */
  style?: CSSProperties;
  /** Событие клика приходит целиком: в ячейке месяца родитель гасит всплытие,
   *  иначе клик по чипу дополнительно открыл бы peek дня под ним. */
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function EventChip({
  kind, title, timeLabel, critical = false, layout, compressed = false, style, onClick,
}: EventChipProps) {
  const meta = chipMeta(kind);
  const Icon = meta.icon;
  const label = chipAriaLabel(kind, timeLabel, title);
  const lane = layout === 'lane';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // В ячейке месяца название режется ellipsis всегда — подсказка нужна не
      // только сжатому чипу, как на дорожке.
      title={compressed || !lane ? label : undefined}
      className={`${lane ? 'lane-chip' : 'cell-chip'} ${meta.dot}`}
      style={{
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        borderRadius: '999px',
        border: critical ? '1px solid var(--danger)' : '1px solid transparent',
        fontFamily: 'inherit',
        fontWeight: 500,
        cursor: 'pointer',
        ...(lane
          ? {
              padding: '0.25rem 0.6rem 0.25rem 0.45rem',
              fontSize: '0.6875rem',
              whiteSpace: 'nowrap' as const,
            }
          : {
              width: '100%',
              minWidth: 0,
              padding: '0.1rem 0.45rem 0.1rem 0.3rem',
              fontSize: '0.625rem',
              textAlign: 'left' as const,
              overflow: 'hidden',
            }),
        ...style,
      }}
    >
      <Icon
        size={11}
        strokeWidth={2.2}
        className={critical ? 'text-danger-text' : meta.fg}
        style={{ flexShrink: 0 }}
      />
      {timeLabel && (
        <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{timeLabel}</b>
      )}
      {!(lane && compressed) && (
        <span
          style={
            lane
              ? { maxWidth: '11rem', overflow: 'hidden', textOverflow: 'ellipsis' }
              : { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }
        >
          {title}
        </span>
      )}
    </button>
  );
}
