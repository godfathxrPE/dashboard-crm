'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { isTimelineRpcRow, rpcRowToEvent } from '@/lib/timeline/rpc-adapter';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';
import { useActorMap } from './use-actor';

// ═══════════════════════════════════════════════════════
// useEntityTimeline — единая лента активности сущности.
//
// S-TL-1: шесть запросов из браузера (calls, meetings, tasks, projects,
// activity_log, ai_runs) плюс два вспомогательных (проекты сущности, звонки+встречи
// для ai_runs) заменены ОДНИМ RPC `entity_timeline`. Слияние, дедуп и сортировка
// уехали в SQL — здесь остаётся только резолв актора id→имя.
//
// Состав и порядок ленты при этом НЕ изменились: это критерий приёмки спринта,
// а не пожелание. Заголовки по-прежнему собирает TypeScript (`rpc-adapter.ts` →
// `adapters.ts` / `describeEvent` / `presetTitle`) — слой представления в БД не живёт.
// ═══════════════════════════════════════════════════════

export type TimelineEntityType = 'contact' | 'company' | 'project';

const STALE_TIME = 60_000;

/**
 * Лимит НА ИСТОЧНИК, а не на ленту — так было в шести запросах, так осталось в RPC.
 * Глобальный keyset-курсор появится в S-TL-2 вместе с прокруткой «раньше», где смена
 * состава будет намеренной и заметной.
 */
const PER_SOURCE_LIMIT = 50;

export interface UseEntityTimelineOptions {
  /**
   * `activity_log` + `ai_runs` в ленте.
   *
   * @deprecated С S-TL-1 флаг больше не экономит запросы: RPC отдаёт все шесть
   * источников всегда, и `false` теперь просто прячет два вида на клиенте. Все три
   * потребителя (`ProjectDetail`, `CompanyDetail`, `ContactDetailHub`) передают `true`,
   * так что на живых экранах он не меняет ничего. Флаг оставлен, чтобы не трогать
   * публичный контракт трёх компонентов сверх задачи спринта, и снимается в S-TL-2
   * вместе с чипами фильтра. Дефолт (`false`) сохранён прежний — иначе вызов без
   * опций тихо получил бы два новых вида событий.
   */
  includeSystem?: boolean;
}

/** Виды, которые прячет `includeSystem: false`. */
const SYSTEM_KINDS: readonly TimelineKind[] = ['activity', 'ai_run'];

async function fetchTimeline(
  entityType: TimelineEntityType,
  entityId: string,
): Promise<TimelineEvent[]> {
  // ⚠️ `rpc` зовётся ТОЛЬКО методом. До регена типов здесь стояло
  // `const rpc = supabase.rpc as unknown as UntypedRpc` — обход отсутствующей
  // сигнатуры, который отрывал метод от клиента: внутри supabase-js он читает
  // `this.rest`, и оторванный вызов бросал TypeError ещё ДО сети. React Query
  // ловит бросок из queryFn молча — лента рисовала «Пока нет активности» при
  // исправном сервере. Если типа функции опять не окажется, кастовать нужно
  // КЛИЕНТ (`createClient() as unknown as { rpc: F }`), а не метод.
  const supabase = createClient();
  const { data, error } = await supabase.rpc('entity_timeline', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_limit: PER_SOURCE_LIMIT,
  });
  if (error) throw error;

  // `overdue` у задачи — функция текущего времени: одна отсечка на всю выборку,
  // как было в прежнем `fetchTasks`.
  const now = Date.now();
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.filter(isTimelineRpcRow).map((r) => rpcRowToEvent(r, now));
}

export function useEntityTimeline(
  entityType: TimelineEntityType,
  entityId: string | null | undefined,
  opts: UseEntityTimelineOptions = {},
) {
  const enabled = Boolean(entityId);
  const includeSystem = opts.includeSystem ?? false;

  // Ключ без подключа источника: прежние `['timeline', 'call', …]` исчезли вместе
  // с шестью запросами. Инвалидации в use-activity-log / use-calls / use-meetings /
  // use-tasks идут префиксом `['timeline']` и продолжают работать без правок.
  const timeline = useQuery({
    queryKey: ['timeline', entityType, entityId],
    queryFn: () => fetchTimeline(entityType, entityId!),
    enabled,
    staleTime: STALE_TIME,
  });

  // Резолв актора id→имя — на сборке (одна Map из useTeamMembers-кеша, не N запросов).
  const actorMap = useActorMap();
  const events = useMemo(() => {
    const all = timeline.data ?? [];
    const visible = includeSystem ? all : all.filter((e) => !SYSTEM_KINDS.includes(e.kind));
    // Сортировка не нужна: RPC уже отдал по убыванию `ts`, с тем же разрешением
    // (миллисекунды) и тем же разбором ничьих, что давал прежний `Array#sort`.
    return visible.map((e) => (e.actorId ? { ...e, actorName: actorMap.get(e.actorId) } : e));
  }, [timeline.data, includeSystem, actorMap]);

  // Ошибка отдаётся наружу намеренно: без неё сбой queryFn неотличим от «событий
  // нет» — ровно так дефект S-TL-1 и дожил до владельца.
  return { events, isLoading: timeline.isLoading, error: timeline.error as Error | null };
}
