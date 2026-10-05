// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: модель ленты сделки — раскладка событий по зонам и дням.
//
// Чистые функции без React и Supabase. Время — аргументом `now` (мс), не `Date.now()`
// внутри: тесты фиксируют момент, а не мокают часы. Границы суток — по ЛОКАЛЬНОМУ
// времени, как у `relativeTime` (`lib/utils/relative-time.ts`): «Сегодня» в ленте и
// «5ч назад» в строке обязаны считаться от одних и тех же суток.
//
// Конвейер истории: `splitPlanned` → `groupByDay` → на каждый день `buildDayRows`
// (= `attachStageComments` → `collapseFieldChanges`).
//
// ⚠️ Работает по ЗАГРУЖЕННЫМ страницам ленты (keyset, `useEntityTimeline`): открытая
// задача старше первой страницы в «Запланировано» не попадёт — отдельного запроса
// задач в S-NOTES-2.1 нет (решение — на гейте).
// ═══════════════════════════════════════════════════════

import { describeChange, fieldLabel } from '@/lib/utils/activity-events';
import type { TimelineEvent } from '@/types/timeline';

// ─── Запланировано / история ───

export interface PlannedSplit {
  planned: TimelineEvent[];
  history: TimelineEvent[];
}

/**
 * В `planned`: задачи не в статусе `done` (любая дата, просроченные тоже) и встречи с
 * датой `>= now`. Порядок — по дате по возрастанию, так просроченные идут первыми.
 * Остальное — `history` в исходном порядке (RPC отдаёт `ts desc`).
 *
 * Звонок «завтра» в `history`: у звонка нет понятия «запланирован на дату» в этой зоне,
 * а статус `pending` читается в карточке.
 */
export function splitPlanned(events: readonly TimelineEvent[], now: number): PlannedSplit {
  const planned: TimelineEvent[] = [];
  const history: TimelineEvent[] = [];
  for (const e of events) {
    const open = e.kind === 'task' && e.status !== 'done';
    const upcoming = e.kind === 'meeting' && new Date(e.date).getTime() >= now;
    (open || upcoming ? planned : history).push(e);
  }
  // Сортировка устойчивая (ES2019): события с одной датой остаются в порядке ленты.
  planned.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { planned, history };
}

// ─── Дни ───

export interface DayGroup<T = TimelineEvent> {
  /** `YYYY-MM-DD` по локальному времени — стабильный ключ React. */
  key: string;
  /** «Сегодня, 3 октября» · «Вчера, 2 октября» · «30 сентября» · «30 сентября 2025». */
  label: string;
  items: T[];
}

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(d: Date, now: Date): string {
  const base = `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
  const key = dayKey(d);
  if (key === dayKey(now)) return `Сегодня, ${base}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday)) return `Вчера, ${base}`;
  // Год — только если он не текущий.
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * События → группы по локальным суткам. Порядок групп и элементов — как во входе: лента
 * приходит `ts desc`, и «Сегодня» остаётся сверху без пересортировки.
 */
export function groupByDay(history: readonly TimelineEvent[], now: number): DayGroup[] {
  const nowDate = new Date(now);
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const e of history) {
    const d = new Date(e.date);
    const key = dayKey(d);
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: dayLabel(d, nowDate), items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.items.push(e);
  }
  return groups;
}

// ─── Строки дня ───

export type FeedRow =
  | { type: 'event'; event: TimelineEvent; stageComment?: TimelineEvent }
  | { type: 'fields'; count: number; labels: string[]; items: TimelineEvent[] };

/** Типы журнала, означающие смену стадии: легаси `stage_change` (до 14.07) и `stage_changed`. */
const STAGE_EVENT_TYPES: readonly string[] = ['stage_change', 'stage_changed'];

export function isStageEvent(e: Pick<TimelineEvent, 'kind' | 'eventType'>): boolean {
  return e.kind === 'activity' && e.eventType != null && STAGE_EVENT_TYPES.includes(e.eventType);
}

/**
 * Правка полей сделки (аудит 087, `project_updated`). Не смена стадии и не удаление:
 * у них своё представление и свой фильтр (`stage` / `deleted`).
 */
function isFieldChange(e: TimelineEvent): boolean {
  return e.kind === 'activity' && e.eventType === 'project_updated';
}

/** Окно склейки правок полей: от первой правки группы до последней. */
export const FIELD_GROUP_WINDOW_MS = 10 * 60 * 1000;

/** Окно привязки комментария к смене стадии, когда ids нет (старые заметки без `meta`). */
export const STAGE_COMMENT_WINDOW_MS = 2 * 60 * 1000;

/**
 * Окно привязки, когда id целевой стадии совпал: комментарий пишется через секунду
 * после перехода, но запас на медленную сеть нужен, а старый комментарий в ту же
 * стадию (возврат в неё через неделю) цепляться не должен.
 */
const STAGE_COMMENT_ID_WINDOW_MS = 10 * 60 * 1000;

function time(e: TimelineEvent): number {
  return new Date(e.date).getTime();
}

/** Подписи изменённых полей события: ключи `changes`, иначе готовый заголовок. */
function fieldLabels(e: TimelineEvent): string[] {
  if (!e.changes) return [e.title];
  const keys = Object.keys(e.changes);
  if (keys.length === 0) return [e.title];
  return keys.map((k) => {
    const l = fieldLabel(k);
    return l.charAt(0).toUpperCase() + l.slice(1);
  });
}

/** Строки «Бюджет: 10M → 12M» для раскрытия группы: по ключам `changes`, иначе заголовок. */
export function fieldChangeLines(e: TimelineEvent): string[] {
  if (!e.changes) return [e.title];
  const keys = Object.keys(e.changes);
  if (keys.length === 0) return [e.title];
  return keys.map((k) => describeChange(k, (e.changes as Record<string, Record<string, unknown>>)[k]));
}

/**
 * Подряд идущие правки полей ОДНОГО автора в окне 10 минут → одна группа
 * `{ type: 'fields', count, labels, items }`. Одиночная правка остаётся строкой.
 * Любая другая строка между правками, как и чужая правка, рвёт группу. Смена стадии и
 * удаление в группу не входят.
 *
 * `labels` — по порядку времени (от старой правки к новой), без повторов; `items` — в
 * порядке ленты (новые сверху).
 */
export function collapseFieldChanges(rows: readonly FeedRow[]): FeedRow[] {
  const out: FeedRow[] = [];
  let run: TimelineEvent[] = [];

  const flush = () => {
    if (run.length === 1) {
      out.push({ type: 'event', event: run[0] });
    } else if (run.length > 1) {
      const labels: string[] = [];
      for (const e of [...run].reverse()) {
        for (const l of fieldLabels(e)) if (!labels.includes(l)) labels.push(l);
      }
      out.push({ type: 'fields', count: run.length, labels, items: run });
    }
    run = [];
  };

  for (const row of rows) {
    if (row.type !== 'event' || !isFieldChange(row.event)) {
      flush();
      out.push(row);
      continue;
    }
    const e = row.event;
    const head = run[0];
    const joins =
      head !== undefined &&
      head.actorId === e.actorId &&
      Math.abs(time(head) - time(e)) <= FIELD_GROUP_WINDOW_MS;
    if (!joins) flush();
    run.push(e);
  }
  flush();
  return out;
}

/**
 * Комментарий перехода (`notes.kind = 'stage_comment'`) прикрепляется к своей смене
 * стадии, а из списка уходит. Пара: один автор и совпавший `to_stage_id` (если он есть
 * у обеих сторон; окно 10 минут), иначе — окно ±2 минуты. Без пары заметка остаётся
 * отдельной карточкой.
 *
 * Пары назначаются по возрастанию разрыва во времени, а не «первый подошёл»: два
 * перехода подряд получают каждый свой комментарий.
 */
export function attachStageComments(events: readonly TimelineEvent[]): FeedRow[] {
  type Pair = { stage: TimelineEvent; comment: TimelineEvent; gap: number };
  const stages = events.filter(isStageEvent);
  const comments = events.filter((e) => e.kind === 'note' && e.noteKind === 'stage_comment');

  const pairs: Pair[] = [];
  for (const stage of stages) {
    for (const comment of comments) {
      if (stage.actorId !== comment.actorId) continue;
      const gap = Math.abs(time(stage) - time(comment));
      const stageTo = stage.stage?.toStageId;
      const commentTo = comment.noteMeta?.toStageId;
      const byId = stageTo !== undefined && commentTo !== undefined;
      if (byId ? stageTo !== commentTo || gap > STAGE_COMMENT_ID_WINDOW_MS : gap > STAGE_COMMENT_WINDOW_MS) {
        continue;
      }
      pairs.push({ stage, comment, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap);

  const attached = new Map<TimelineEvent, TimelineEvent>();
  const used = new Set<TimelineEvent>();
  for (const { stage, comment } of pairs) {
    if (attached.has(stage) || used.has(comment)) continue;
    attached.set(stage, comment);
    used.add(comment);
  }

  const rows: FeedRow[] = [];
  for (const e of events) {
    if (used.has(e)) continue;
    const stageComment = attached.get(e);
    rows.push(stageComment ? { type: 'event', event: e, stageComment } : { type: 'event', event: e });
  }
  return rows;
}

// ─── Подписи времени ───

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const;

/** «10:41» — локальное время; день уже назван пилюлей группы. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «2 окт» — для строк вне группы дня (запланированное, закреплённое). Год — только чужой. */
export function formatShortDate(iso: string, now: number): string {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «2 окт, 16:56». */
export function formatShortDateTime(iso: string, now: number): string {
  return `${formatShortDate(iso, now)}, ${formatClock(iso)}`;
}

/** Строки одного дня: привязка комментариев стадий, затем склейка правок полей. */
export function buildDayRows(events: readonly TimelineEvent[]): FeedRow[] {
  return collapseFieldChanges(attachStageComments(events));
}
