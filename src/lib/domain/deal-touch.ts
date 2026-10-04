// src/lib/domain/deal-touch.ts — S-TODAY-V3-DOMAIN-1
//
// «Касание» — действие по сделке с нашей стороны. Одно определение на экран
// «Сегодня» (группы, полоса «Было»): до этого спринта оно было размазано —
// «Пульс» считал все строки журнала, включая правки полей, а заметки с 135
// в журнал не пишутся вовсе. Таблица видов — `_analysis/today-v3-spec.md`, п. 2.
//
// Ноль React, ноль запросов, ноль `Date.now()`: `now` — аргумент (урок
// S-LEAD-HUB-2b — leadStaleness читала часы мимо переданного времени).

import { mskDateKey } from '@/lib/utils/date-helpers';

export type TouchKind = 'note' | 'stage' | 'task' | 'call' | 'meeting';

export interface DealTouch {
  /** ISO-таймстамп события. */
  at: string;
  kind: TouchKind;
}

/** Типы `activity_log.event_type`, которые запрашивает пакетный хук (SCREEN-1). */
export const TOUCH_EVENT_TYPES = ['stage_changed', 'task_completed', 'call_logged', 'meeting_scheduled'] as const;

/** Вид касания по типу события журнала; `null` — событие не касание. */
export function touchKindOfActivity(eventType: string): TouchKind | null {
  switch (eventType) {
    case 'stage_changed':
      return 'stage';
    case 'task_completed':
      return 'task';
    case 'call_logged':
      return 'call';
    case 'meeting_scheduled':
      return 'meeting';
    default:
      // ⚠️ `comment_added` — НЕ касание, хотя выглядит как заметка: заметки живут в
      // `notes` с 134 и читаются оттуда, мост в журнал снят в 135. Считать его здесь —
      // дубль старых заметок. Остальное (`project_updated` — правка полей,
      // `task_created`, `entity_deleted`, `automation_fired`,
      // `stage_transition_committed`, `lead_status_changed`) и любой неизвестный тип —
      // тоже не касание: новый тип журнала становится касанием только правкой таблицы.
      return null;
  }
}

/** Строка смены стадии в объёме, нужном для отсева отскоков. */
export interface StageChangeRow {
  at: string;
  fromStageId: string | null;
  toStageId: string | null;
}

export const STAGE_BOUNCE_MINUTES = 30;

const BOUNCE_MS = STAGE_BOUNCE_MINUTES * 60_000;

function isBounce(a: StageChangeRow, b: StageChangeRow): boolean {
  // Пара — только при непустых id: `null` → `null` совпал бы сам с собой и снял бы
  // две ничем не связанные смены.
  if (!a.fromStageId || !a.toStageId || !b.fromStageId || !b.toStageId) return false;
  if (b.fromStageId !== a.toStageId || b.toStageId !== a.fromStageId) return false;
  return new Date(b.at).getTime() - new Date(a.at).getTime() <= BOUNCE_MS;
}

/**
 * Снимает пары «A→B, затем B→A не позже чем через STAGE_BOUNCE_MINUTES».
 * Возвращает оставшиеся строки по возрастанию времени.
 *
 * Строки одной сделки — цепочка, поэтому возврат — всегда СОСЕДНЯЯ строка. Строка
 * участвует не более чем в одной паре: `A→B, B→A, A→B` — снята первая пара, третья
 * остаётся (она и есть итоговое перемещение).
 */
export function dropStageBounces(rows: readonly StageChangeRow[]): StageChangeRow[] {
  const sorted = [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const kept: StageChangeRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    if (i + 1 < sorted.length && isBounce(sorted[i], sorted[i + 1])) {
      i += 2;
      continue;
    }
    kept.push(sorted[i]);
    i += 1;
  }
  return kept;
}

/**
 * ISO последнего касания с днём не позже дня `now`; `null` — таких нет.
 *
 * Отсечка — по ДНЮ, не по времени: заметка, созданная после открытия экрана, обязана
 * учитываться, а `now` экрана старше её на минуты.
 */
export function lastTouchAt(touches: readonly DealTouch[], now: Date): string | null {
  const todayKey = mskDateKey(now);
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const t of touches) {
    if (mskDateKey(t.at) > todayKey) continue;
    const ms = new Date(t.at).getTime();
    if (ms > bestMs) {
      bestMs = ms;
      best = t.at;
    }
  }
  return best;
}

// ── S-TODAY-V3-SCREEN-1: сборка касаний из строк запроса ──
//
// Вход — сырые строки двух запросов (`notes` + `activity_log`), выход — касания по
// сделкам. Хук (`use-deal-touches.ts`) только запрашивает и зовёт эту функцию:
// вся логика отбора живёт здесь, где её видит тест.

export interface NoteTouchRow { project_id: string | null; created_at: string | null; kind: string | null }
export interface ActivityTouchRow {
  project_id: string | null;
  event_type: string;
  created_at: string | null;
  payload: unknown;
}

/** Строковое поле объекта `payload`; всё остальное (не объект, массив, не строка) — `null`. */
function payloadString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  // `Reflect.get` вместо приведения `as Record<…>`: тип значения честно `unknown`.
  const value: unknown = Reflect.get(payload, key);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Касания по сделкам: заметки + события журнала, отскоки стадии сняты. */
export function touchesFromRows(
  notes: readonly NoteTouchRow[],
  activity: readonly ActivityTouchRow[],
): Map<string, DealTouch[]> {
  const out = new Map<string, DealTouch[]>();
  const push = (projectId: string, touch: DealTouch) => {
    const list = out.get(projectId);
    if (list) list.push(touch);
    else out.set(projectId, [touch]);
  };

  for (const n of notes) {
    if (!n.project_id || !n.created_at) continue;
    // `stage_comment` — часть смены стадии, а не отдельное касание: иначе комментарий
    // к отскоку стадии остался бы касанием, когда сам отскок снят.
    if (n.kind !== 'note') continue;
    push(n.project_id, { at: n.created_at, kind: 'note' });
  }

  const stageRows = new Map<string, StageChangeRow[]>();
  for (const a of activity) {
    if (!a.project_id || !a.created_at) continue;
    const kind = touchKindOfActivity(a.event_type);
    if (kind === null) continue;
    if (kind === 'stage') {
      const row: StageChangeRow = {
        at: a.created_at,
        fromStageId: payloadString(a.payload, 'from_stage_id'),
        toStageId: payloadString(a.payload, 'to_stage_id'),
      };
      const list = stageRows.get(a.project_id);
      if (list) list.push(row);
      else stageRows.set(a.project_id, [row]);
      continue;
    }
    push(a.project_id, { at: a.created_at, kind });
  }

  // Отскок снимается по каждой сделке отдельно: пара «A→B, B→A» двух разных сделок —
  // не отскок, а два независимых перемещения.
  for (const [projectId, rows] of stageRows) {
    for (const r of dropStageBounces(rows)) push(projectId, { at: r.at, kind: 'stage' });
  }

  for (const list of out.values()) {
    list.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  }
  return out;
}
