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
import type { TimelineEvent } from '@/types/timeline';
import { useActorMap } from './use-actor';

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
// Заголовки по-прежнему собирает TypeScript (`rpc-adapter.ts` → `adapters.ts` /
// `describeEvent` / `presetTitle`) — слой представления в БД не живёт.
// ═══════════════════════════════════════════════════════

export type TimelineEntityType = 'contact' | 'company' | 'project';

const STALE_TIME = 60_000;

/**
 * Аргументы RPC пятиаргументной `entity_timeline` (миграция 113).
 *
 * ⚠️ Тип ЛОКАЛЬНЫЙ, потому что 113 ещё НЕ ПРИМЕНЕНА: в `supabase.gen.ts` лежит
 * трёхаргументная сигнатура 112 (`p_entity_type, p_entity_id, p_limit`), и вызов
 * с `p_before` не прошёл бы проверку лишних свойств. Править сгенерированные типы
 * руками запрещено (правило 2). После apply + регена этот блок и каст снимаются —
 * больше ничего не меняется.
 *
 * ⚠️ Кастуется КЛИЕНТ, а не метод. `const rpc = supabase.rpc` отрывает метод от
 * объекта: внутри supabase-js он читает `this.rest`, оторванный вызов бросает
 * TypeError ещё ДО сети, а React Query ловит бросок из queryFn молча — так лента
 * и «опустела» в FIX S-TL-1-RPC-THIS при исправном сервере.
 */
interface TimelineRpcArgs {
  p_entity_type: TimelineEntityType;
  p_entity_id: string;
  p_before: string | null;
  p_before_id: string | null;
  p_limit: number;
}

interface TimelineRpcClient {
  rpc(
    fn: 'entity_timeline',
    args: TimelineRpcArgs,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function fetchTimelinePage(
  entityType: TimelineEntityType,
  entityId: string,
  cursor: TimelineCursor | null,
): Promise<TimelineEvent[]> {
  const supabase = createClient() as unknown as TimelineRpcClient;
  const { data, error } = await supabase.rpc('entity_timeline', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: cursor?.ts ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: TIMELINE_PAGE_SIZE,
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
) {
  const enabled = Boolean(entityId);

  // Ключ без подключа источника и без курсора: страницы живут внутри одной записи
  // кеша `useInfiniteQuery`. Инвалидации в use-activity-log / use-calls / use-meetings /
  // use-tasks идут префиксом `['timeline']` и продолжают работать без правок —
  // они сбрасывают ленту целиком, к первой странице, и это верно: новое событие
  // приходит сверху.
  const timeline = useInfiniteQuery({
    queryKey: ['timeline', entityType, entityId],
    initialPageParam: null as TimelineCursor | null,
    queryFn: ({ pageParam }) => fetchTimelinePage(entityType, entityId!, pageParam),
    getNextPageParam: (lastPage) => nextTimelineCursor(lastPage),
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
