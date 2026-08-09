import type { ChipKind } from '@/components/calendar/EventChip';

// ═══════════════════════════════════════════════════════
// S-CAL-MONTH-1: событие календарного дня — вью-модель месяца.
//
// Раньше этот тип жил внутри `CalendarView` и нёс только `title`/`time?`: панели
// справа хватало. Ячейке с чипами и peek-паспорту нужны минуты (сортировка чипов
// и свободное окно дня), поэтому тип выехал в отдельный модуль — его читают
// `MonthGrid`, `DayPeek` и сам `CalendarView`.
//
// ⚠️ Минуты — МСК (`mskMinutesOfDay`), как вся календарная ось проекта.
// `time` — то, что печатается на чипе; `startMin` — то, по чему он сортируется.
// Хранить одно вместо другого нельзя: у события без времени (дедлайн сделки,
// задача по сроку) есть день, но нет ни того, ни другого.
// ═══════════════════════════════════════════════════════

export type CalEventKind = 'call' | 'meeting' | 'task' | 'deal-step' | 'deal-deadline';

export interface CalEvent {
  id: string;
  kind: CalEventKind;
  title: string;
  /** HH:MM МСК; null — событие без времени. */
  time: string | null;
  /** Минуты от полуночи МСК; null — без времени. */
  startMin: number | null;
  /** Конец события в минутах МСК — для свободного окна дня; null — без времени. */
  endMin: number | null;
  /** Подпись-контекст в карточке peek: компания, место, «дедлайн сделки». */
  sub?: string;
}

/**
 * Вид календаря → вид чипа. Шаг по сделке рисуется видом `project` из `KIND_META`
 * (FolderKanban + акцент) — своей иконки в календаре он не заводит: карта видов
 * в проекте одна.
 */
export function chipKindOf(kind: CalEventKind): ChipKind {
  if (kind === 'deal-deadline') return 'deadline';
  if (kind === 'deal-step') return 'project';
  return kind;
}

/** Подпись времени на чипе. Отдельной функцией — чтобы месяц и peek не разошлись. */
export function chipTimeLabel(ev: CalEvent): string | null {
  return ev.time;
}
