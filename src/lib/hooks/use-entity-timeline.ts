'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { isTimelineRpcRow, rpcRowToEvent } from '@/lib/timeline/rpc-adapter';
import {
  TIMELINE_PAGE_SIZE,
  flattenTimelinePages,
  nextTimelineCursor,
  type TimelineCursor,
} from '@/lib/timeline/cursor';
import type { TimelineEvent, TimelineKindFilter } from '@/types/timeline';
import { useActorMap } from './use-actor';
import { useRealtimeSync } from './use-realtime';
import { useProjects } from './use-projects';
import { useCompanies } from './use-companies';
import { useContacts } from './use-contacts';

// ═══════════════════════════════════════════════════════
// useEntityTimeline — единая лента активности сущности.
//
// S-TL-1: шесть запросов из браузера (calls, meetings, tasks, projects,
// activity_log, ai_runs) плюс два вспомогательных заменены ОДНИМ RPC `entity_timeline`.
//
// S-TL-2: у ленты появилось дно. Лимит переехал С ИСТОЧНИКА НА СТРАНИЦУ, и RPC
// научился keyset-курсору `(ts, id)` — отсюда `useInfiniteQuery` вместо `useQuery`.
// Состав первой страницы при этом НАМЕРЕННО изменился: теперь это честные последние
// 50 событий, а не «до 50 от каждого источника».
//
// S-TL-3: фильтр по видам стал ЗАПРОСОМ, а не срезом загруженного. До этого чип
// «Звонки» показывал звонки только из уже загруженных страниц — с появлением
// пагинации в S-TL-2 это стало прямым враньём. Виды уходят в `p_kinds`, смена
// набора даёт новый `queryKey` и новую ленту с первой страницы.
//
// Заголовки по-прежнему собирает TypeScript (`rpc-adapter.ts` → `adapters.ts` /
// `describeEvent` / `presetTitle`) — слой представления в БД не живёт.
// ═══════════════════════════════════════════════════════

/**
 * S-TL-4: четвёртое значение — `'org'`, уровень организации. Отдельной функции
 * `org_timeline()` не заводится: копия тела разошлась бы с оригиналом при первой
 * же правке веток, и разошлась бы молча — лента просто показала бы другое.
 */
export type TimelineEntityType = 'contact' | 'company' | 'project' | 'org';

const STALE_TIME = 60_000;

/** Ключ org-ленты для realtime-инвалидации: префикс, накрывающий все её срезы. */
const ORG_TIMELINE_KEY = ['timeline', 'org'] as const;

/**
 * Аргументы RPC шестиаргументной `entity_timeline` (миграция 114).
 *
 * ⚠️ Тип ЛОКАЛЬНЫЙ, потому что 114 ещё НЕ ПРИМЕНЕНА: в `supabase.gen.ts` лежит
 * пятиаргументная сигнатура 113 (без `p_kinds`), и вызов с ним не прошёл бы
 * проверку лишних свойств. Править сгенерированные типы руками запрещено
 * (правило 2). После apply + регена этот блок и каст снимаются — больше ничего
 * не меняется.
 *
 * ⚠️ Кастуется КЛИЕНТ, а не метод. `const rpc = supabase.rpc` отрывает метод от
 * объекта: внутри supabase-js он читает `this.rest`, оторванный вызов бросает
 * TypeError ещё ДО сети, а React Query ловит бросок из queryFn молча — так лента
 * и «опустела» в FIX S-TL-1-RPC-THIS при исправном сервере.
 */
interface TimelineRpcArgs {
  p_entity_type: TimelineEntityType;
  /** `null` — только для `'org'`: там идентификатор сущности не нужен. */
  p_entity_id: string | null;
  p_before: string | null;
  p_before_id: string | null;
  p_limit: number;
  /** `null` = все виды. Пустой массив в RPC не уходит — он означал бы пустую ленту. */
  p_kinds: string[] | null;
}

interface TimelineRpcClient {
  rpc(
    fn: 'entity_timeline',
    args: TimelineRpcArgs,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function fetchTimelinePage(
  entityType: TimelineEntityType,
  entityId: string | null,
  cursor: TimelineCursor | null,
  kinds: readonly TimelineKindFilter[] | null,
  limit: number,
): Promise<TimelineEvent[]> {
  const supabase = createClient() as unknown as TimelineRpcClient;
  const { data, error } = await supabase.rpc('entity_timeline', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: cursor?.ts ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
    p_kinds: kinds && kinds.length > 0 ? [...kinds] : null,
  });
  if (error) throw error;

  // `overdue` у задачи — функция текущего времени: одна отсечка на всю страницу,
  // как было в прежнем `fetchTasks`.
  const now = Date.now();
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.filter(isTimelineRpcRow).map((r) => rpcRowToEvent(r, now));
}

export function useEntityTimeline(
  entityType: TimelineEntityType,
  entityId: string | null | undefined,
  /**
   * Виды для серверного фильтра. `undefined` (и пустой массив) = все виды,
   * `p_kinds` уходит как `null`.
   */
  kinds?: readonly TimelineKindFilter[],
  /** Размер страницы. Виджетам org-ленты нужно 5 и 20, карточке — полные 50. */
  limit: number = TIMELINE_PAGE_SIZE,
) {
  // ⚠️ S-TL-4: у `'org'` идентификатора сущности НЕТ, и прежнее `Boolean(entityId)`
  // навсегда оставило бы запрос выключенным — лента молча не загрузилась бы, без
  // ошибки и без спиннера. Тот же класс немого сбоя, что FIX S-TL-1-RPC-THIS.
  const enabled = entityType === 'org' || Boolean(entityId);
  const kindsKey = kinds && kinds.length > 0 ? [...kinds].sort() : 'all';

  // Ключ без курсора: страницы живут внутри одной записи кеша `useInfiniteQuery`.
  // Инвалидации в use-activity-log / use-calls / use-meetings / use-tasks идут
  // префиксом `['timeline']` и продолжают работать без правок — они сбрасывают
  // ленту целиком, к первой странице, и это верно: новое событие приходит сверху.
  //
  // ⚠️ S-TL-3: набор видов ОБЯЗАН быть частью ключа. Без него React Query отдал бы
  // на «Задачи» кеш от «Все» — то есть чужую ленту, молча и мгновенно. Он же даёт
  // сброс пагинации: смена чипа заводит новую запись кеша, а с ней и первую
  // страницу без курсора. Ключ нормализован сортировкой: порядок чипов у родителя
  // — не свойство данных, и ['task','call'] не должен заводить второй кеш.
  //
  // ⚠️ `limit` тоже часть ключа: у виджета дровера страница из 5 событий, у дашборда
  // из 20, и общий кеш отдал бы одному из них чужой размер — а вместе с ним и
  // неверное «есть ещё» (признак дна — НЕПОЛНАЯ страница, то есть функция лимита).
  const timeline = useInfiniteQuery({
    queryKey: ['timeline', entityType, entityId ?? null, kindsKey, limit],
    initialPageParam: null as TimelineCursor | null,
    queryFn: ({ pageParam }) =>
      fetchTimelinePage(entityType, entityId ?? null, pageParam, kinds ?? null, limit),
    getNextPageParam: (lastPage) => nextTimelineCursor(lastPage, limit),
    enabled,
    staleTime: STALE_TIME,
  });

  // Резолв актора id→имя — на сборке (одна Map из useTeamMembers-кеша, не N запросов).
  // ⚠️ Зависимость — `timeline.data?.pages`, а не одна страница: иначе имена
  // проставлялись бы только у первой, и «Показать раньше» добавляло бы события
  // без авторов.
  const actorMap = useActorMap();
  const events = useMemo(() => {
    const all = flattenTimelinePages(timeline.data?.pages);
    // Сортировка не нужна: RPC отдаёт страницу по `ts desc, id desc`, а страницы
    // идут в порядке запросов — то есть уже по убыванию.
    return all.map((e) => (e.actorId ? { ...e, actorName: actorMap.get(e.actorId) } : e));
  }, [timeline.data?.pages, actorMap]);

  // Ошибка отдаётся наружу намеренно: без неё сбой queryFn неотличим от «событий
  // нет» — ровно так дефект S-TL-1 и дожил до владельца.
  return {
    events,
    isLoading: timeline.isLoading,
    error: timeline.error as Error | null,
    hasMore: timeline.hasNextPage,
    loadMore: timeline.fetchNextPage,
    isLoadingMore: timeline.isFetchingNextPage,
  };
}

// ═══════════════════════════════════════════════════════
// useOrgTimeline — та же лента на уровне организации (S-TL-4).
//
// Заменяет `useRecentActivity`, который читал `activity_log` напрямую и питал два
// виджета: «Последние действия» на дашборде (20) и `ActivityWidget` в дровере (5).
// Оба показывали ТОЛЬКО журнал: на 2026-08-09 это 801 событие из 1510 — без звонков,
// встреч, задач, сделок и AI-прогонов.
//
// Резолв родителя живёт ЗДЕСЬ, а не в `useEntityTimeline`: на карточке сущности
// родитель не нужен (карточка и есть ответ), а три списочных хука, поднятые в общем
// хуке, тянули бы `companies`/`contacts` на каждой карточке сделки.
// ═══════════════════════════════════════════════════════

/**
 * Org-лента с резолвом имени родителя.
 *
 * ⚠️ Цена контекста — два списочных запроса на дашборде: `useProjects` там уже
 * поднят, а `useCompanies`/`useContacts` нет (прежний `useRecentActivity` обходился
 * вложенным `project:projects(id,name)`, то есть одним). Списки кешируются на всё
 * приложение (staleTime 60 с, realtime), поэтому платится это один раз за сессию.
 */
export function useOrgTimeline(
  kinds?: readonly TimelineKindFilter[],
  limit: number = 20,
) {
  // ⚠️ ЧАСТИЧНЫЙ realtime, и это записано намеренно. `useRecentActivity` держал
  // `useRealtimeSync('activity_log', ['activity_log'])`, и новая запись журнала
  // обновляла виджет сама. У ленты своей подписки не было — молча потерять то, что
  // работало, хуже, чем честно покрыть половину: журнал приезжает сразу, а новая
  // задача, звонок или встреча — по истечении staleTime или по инвалидации из своих
  // мутаций (они бьют по префиксу `['timeline']`). Подписки на шесть таблиц ради
  // виджета в 20 строк здесь не окупаются.
  useRealtimeSync('activity_log', ORG_TIMELINE_KEY);

  const timeline = useEntityTimeline('org', null, kinds, limit);
  const parentMap = useParentNameMap();

  const events = useMemo(
    () =>
      timeline.events.map((e) =>
        e.parentId ? { ...e, parentName: parentMap.get(e.parentId) } : e,
      ),
    [timeline.events, parentMap],
  );

  return { ...timeline, events };
}

/**
 * `parentId → имя` из трёх уже кешируемых списков.
 *
 * Ключ — голый id без типа: uuid уникален между таблицами (тот же приём, что в
 * `ai-run-sources.ts` и в `scope_children` самой функции), поэтому одной Map хватает
 * и разбор `parentType` на клиенте не нужен. `parentType` при этом остаётся в
 * событии — по нему строится ССЫЛКА, и вот там тип обязателен.
 */
function useParentNameMap(): Map<string, string> {
  const { data: projects } = useProjects();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) map.set(p.id, p.name);
    for (const c of companies ?? []) map.set(c.id, c.name);
    // У контакта имени одной колонкой нет — только `first_name` + `last_name`
    // (второй nullable). Склейка та же, что в ContactDetailHub.
    for (const c of contacts ?? []) {
      map.set(c.id, `${c.first_name} ${c.last_name ?? ''}`.trim());
    }
    return map;
  }, [projects, companies, contacts]);
}
