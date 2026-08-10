// ═══════════════════════════════════════════════════════
// S-TL-1: строка RPC `entity_timeline` → TimelineEvent.
//
// Чистая функция, без Supabase — по образцу `ai-run-merge.ts`, чтобы тесты не тянули
// браузерный клиент.
//
// Что делает: сужает `unknown` до строки RPC, восстанавливает форму, которую ждут
// СУЩЕСТВУЮЩИЕ адаптеры (`adapters.ts`, `describeEvent`, `presetTitle`), и зовёт их.
// Ни одного нового заголовка здесь не появляется и появиться не должно: заголовки —
// единственный слой, который спринт не трогает, и именно поэтому лента после переезда
// на сервер совпадает с прежней построчно.
// ═══════════════════════════════════════════════════════

import {
  callToEvent,
  meetingToEvent,
  taskToEvent,
  projectToEvent,
} from '@/lib/timeline/adapters';
import { presetTitle } from '@/lib/constants/ai-presets';
import { describeEvent } from '@/lib/utils/activity-events';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';
import type { ActivityLog } from '@/types/entities';
import type { CallStatus, ProjectType, TaskLane } from '@/types/database';

/** Шесть источников функции — ровно те, что читал клиентский хук до S-TL-1. */
const TIMELINE_KINDS: readonly TimelineKind[] = [
  'call', 'meeting', 'task', 'project', 'activity', 'ai_run',
];

/**
 * Строка RPC `entity_timeline`.
 *
 * Тип ЛОКАЛЬНЫЙ, а не `Returns[number]` из `supabase.gen.ts`. После apply 112 функция
 * в сгенерированных типах есть, но генератор объявил все её колонки НЕ-nullable
 * (`actor_id: string`), а `ref_type`/`ref_id`/`actor_id` у части источников NULL —
 * взять его форму значило бы соврать компилятору. Править сгенерированные типы руками
 * запрещено (правило 2), поэтому форма описана здесь и сужается `isTimelineRpcRow`.
 * Набор колонок 113 не меняет — меняется только сигнатура аргументов.
 */
export interface TimelineRpcRow {
  ts: string;
  id: string;
  source: string;
  kind: TimelineKind;
  actor_id: string | null;
  ref_type: string | null;
  ref_id: string | null;
  /**
   * S-TL-4 (115). ⚠️ ОПЦИОНАЛЬНЫ НАМЕРЕННО: до применения 115 функция отдаёт восемь
   * колонок без них, и жёсткая проверка в `isTimelineRpcRow` отправила бы КАЖДУЮ
   * строку в отсев — лента опустела бы целиком и молча, ровно как в
   * FIX S-TL-1-RPC-THIS. Отсутствие родителя и так законно (у 304 записей журнала
   * из 801 привязки нет), поэтому `undefined` читается как «нет родителя».
   */
  parent_type?: string | null;
  parent_id?: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * Значения `parent_type`, которые клиент умеет резолвить в имя.
 *
 * ⚠️ Список — фильтр, а не документация: `isParentType` отсеивает всё, чего здесь нет,
 * и родитель схлопывается в `null` МОЛЧА, без ошибки. Ровно поэтому `'lead'` (120)
 * добавляется сюда тем же коммитом, что и ветка лида в SQL.
 */
const PARENT_TYPES = ['project', 'company', 'contact', 'lead'] as const;
type ParentType = (typeof PARENT_TYPES)[number];

function isParentType(v: unknown): v is ParentType {
  return typeof v === 'string' && (PARENT_TYPES as readonly string[]).includes(v);
}

/**
 * Сужение `unknown` → строка ленты.
 *
 * `kind` проверяется по списку намеренно: это делает `rpcRowToEvent` тотальной —
 * у каждого пропущенного сюда значения гарантированно есть адаптер, и функции не
 * нужна ветка «не знаю такого вида», которая молча теряла бы события.
 */
export function isTimelineRpcRow(v: unknown): v is TimelineRpcRow {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.ts === 'string' &&
    typeof r.id === 'string' &&
    typeof r.source === 'string' &&
    typeof r.kind === 'string' &&
    TIMELINE_KINDS.includes(r.kind as TimelineKind) &&
    (r.actor_id === null || typeof r.actor_id === 'string') &&
    (r.ref_type === null || typeof r.ref_type === 'string') &&
    (r.ref_id === null || typeof r.ref_id === 'string') &&
    // 115: пара parent_* проверяется мягко — см. комментарий у полей.
    (r.parent_type == null || typeof r.parent_type === 'string') &&
    (r.parent_id == null || typeof r.parent_id === 'string') &&
    (r.payload === null || (typeof r.payload === 'object' && !Array.isArray(r.payload)))
  );
}

// ─── Чтение payload: jsonb приходит как `unknown`, `any` запрещён ───

function text(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  return typeof v === 'string' ? v : null;
}

/**
 * S-COST-TRUTH-1. Вложенный объект payload'а.
 *
 * У `kind='activity'` строка RPC несёт `{ event_type, payload }` — сам payload записи
 * журнала лежит ВНУТРИ (так его ждёт `describeEvent`), поэтому `text(p, 'task_id')`
 * прочитал бы уровнем выше и всегда возвращал null.
 */
function nested(p: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = p[key];
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * `id` строки RPC — уже `${kind}:${uuid}` (его собирает SQL, чтобы ключ был уникален
 * между источниками). Адаптеры собирают тот же префикс сами, поэтому им нужен голый
 * uuid. Правило одно на все шесть видов — ветвлений здесь нет.
 *
 * `ref_type`/`ref_id` (та же ссылка в машинном виде) сейчас не читаются: открытие
 * события идёт по `kind` + `sourceId` (`open-event.ts`), и менять это сверх задачи
 * незачем. Колонки останутся для спринта новых источников, где их станет больше.
 */
function sourceIdOf(row: TimelineRpcRow): string {
  return row.id.slice(row.kind.length + 1);
}

/**
 * Строка RPC → событие ленты.
 *
 * `now` параметром (дефолт `Date.now()`) — `overdue` у задачи остаётся функцией
 * текущего времени и считается на клиенте: в БД ему не место, там он протух бы
 * к следующему запросу.
 */
export function rpcRowToEvent(row: TimelineRpcRow, now: number = Date.now()): TimelineEvent {
  // ⚠️ Родитель проставляется ОДНИМ местом поверх результата вида, а не в каждой из
  // шести веток switch: шесть копий одного присваивания разъехались бы при первой же
  // правке — тот же класс, что дедуп ОПФ в трёх копиях (S-TG-3).
  // Пара согласуется здесь же: `parent_type` без `parent_id` (и наоборот) — не
  // «частично известный родитель», а мусор, и клиент пошёл бы искать имя по null.
  const parentType = isParentType(row.parent_type) ? row.parent_type : null;
  const parentId = typeof row.parent_id === 'string' ? row.parent_id : null;
  const parent =
    parentType && parentId ? { parentType, parentId } : { parentType: null, parentId: null };
  return { ...baseEvent(row, now), ...parent };
}

function baseEvent(row: TimelineRpcRow, now: number): TimelineEvent {
  const p = row.payload ?? {};
  const sourceId = sourceIdOf(row);
  const createdBy = row.actor_id;

  switch (row.kind) {
    case 'call':
      return callToEvent({
        id: sourceId,
        date: row.ts,
        status: (text(p, 'status') ?? 'pending') as CallStatus,
        next_step: text(p, 'next_step'),
        agreements: text(p, 'agreements'),
        created_by: createdBy,
      });

    case 'meeting':
      return meetingToEvent({
        id: sourceId,
        date: row.ts,
        // `meetings.title` в БД NOT NULL, но пустая строка возможна — и это тот же
        // вход, что был у адаптера раньше: он отдаст «Встреча» без двоеточия.
        title: text(p, 'title') ?? '',
        next_step: text(p, 'next_step'),
        notes: text(p, 'notes'),
        created_by: createdBy,
      });

    case 'task':
      return taskToEvent(
        {
          id: sourceId,
          text: text(p, 'text') ?? '',
          lane: (text(p, 'lane') ?? 'now') as TaskLane,
          deadline: text(p, 'deadline'),
          // ⚠️ `created_at` берётся из payload, а НЕ из `ts`: у задачи датой события
          // служит `deadline ?? created_at`, и подстановка `ts` вместо `created_at`
          // сделала бы дату верной ровно для задач без дедлайна.
          created_at: text(p, 'created_at') ?? row.ts,
          created_by: createdBy,
        },
        now,
      );

    case 'project':
      return projectToEvent({
        id: sourceId,
        name: text(p, 'name') ?? '',
        type: (text(p, 'type') ?? 'client') as ProjectType,
        created_at: row.ts,
        created_by: createdBy,
      });

    case 'activity': {
      // S-COST-TRUTH-1. `task_created`/`task_completed` с 2026-08-09 кладут в payload
      // `task_id` — такое событие открывает карточку задачи, и его `sourceId` — id
      // ЗАДАЧИ, а не строки журнала. Ключ строки (`id`) остаётся `activity:<id лога>`,
      // так что уникальность в ленте не страдает.
      //
      // ⚠️ 478 записей, написанных ДО спринта, `task_id` не несут — ветка на них не
      // срабатывает, клик молчит ровно как раньше. Это не недоделка, а цена того, что
      // поле не завели сразу: бэкфилл невозможен — заголовки задач не уникальны
      // (у шаблонов внедрения они повторяются буквально), связать событие с задачей
      // задним числом не по чему.
      const taskId = text(nested(p, 'payload'), 'task_id');
      return {
        id: row.id,
        sourceId: taskId ?? sourceId,
        ...(taskId ? { refType: 'task' as const } : {}),
        kind: 'activity',
        // payload источника лежит ВНУТРИ `row.payload`, рядом с `event_type` —
        // ровно та форма, которую `describeEvent` читает у строки `activity_log`.
        title: describeEvent(p as unknown as ActivityLog),
        date: row.ts,
        icon: 'activity',
        actorId: createdBy ?? undefined,
        eventType: text(p, 'event_type'),
      };
    }

    case 'ai_run':
      return {
        id: row.id,
        sourceId,
        kind: 'ai_run',
        // Человеческое название пресета, а не машинный ключ: в ленте было
        // «AI: analytic_note» — строка из БД, которую владельцу читать незачем.
        title: `AI: ${presetTitle(text(p, 'preset_key') ?? '')}`,
        date: row.ts,
        icon: 'ai_run',
        // S-TL-2: автор прогона проставляется. В 112 сюда приезжал `null` — RPC
        // намеренно не отдавал `created_by`, чтобы лента совпала с прежней построчно.
        // Критерия больше нет, 113 отдаёт `ai_runs.created_by` (NOT NULL).
        actorId: createdBy ?? undefined,
      };
  }
}
