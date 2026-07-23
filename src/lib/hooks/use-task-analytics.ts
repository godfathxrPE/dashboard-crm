'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * S-ANALYTICS-1 (миграция 072): чтение серверных task-агрегатов.
 * Три RPC (SECURITY DEFINER, скоуп по роли строится внутри — зеркало SELECT-политик
 * tasks). Без realtime: аналитика низкочастотная, рефетч по смене дэйт-рейнджа.
 */

// ── RPC-контракты ────────────────────────────────────────────────────────────
// summary отдаёт jsonb → gen типизирует как Json (opaque). Здесь именованная
// форма для потребителей; каст `as unknown as AnalyticsSummary` (Json → интерфейс).
// throughput/aging возвращают table → gen даёт структурные row-типы, совместимые
// с интерфейсами ниже (именуем для экспорта в TasksAnalytics).
export interface AnalyticsSummary {
  open_total: number;
  done_total: number;
  completed_period: number;
  created_period: number;
  completion_rate: number | null;      // done / (done+open); null при пустом скоупе
  overdue_count: number;
  cycle_time_median_days: number | null; // медиана дней created→completed за период
}

export interface ThroughputPoint {
  week_start: string;  // date (ISO, начало недели МСК)
  completed: number;
  created: number;
}

export interface AgingBucket {
  bucket: string;      // '<3д' | '3–7д' | '7–30д' | '>30д'
  sort_key: number;
  cnt: number;
}

/** KPI-сводка задач за период [from, to] (даты YYYY-MM-DD). */
export function useAnalyticsSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'summary', from, to],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc('task_analytics_summary', {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data as unknown as AnalyticsSummary; // jsonb → именованная форма
    },
  });
}

/** Понедельный throughput (completed vs created) за период. */
export function useThroughputSeries(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'throughput', from, to],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc('task_throughput_series', {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Aging открытых задач по бакетам возраста (без параметров — snapshot «сейчас»). */
export function useAgingBuckets() {
  return useQuery({
    queryKey: ['analytics', 'aging'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc('task_aging_buckets');
      if (error) throw error;
      return data ?? [];
    },
  });
}
