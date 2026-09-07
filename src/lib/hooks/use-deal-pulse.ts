'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { TRANSITION_METRIC_EVENT } from '@/lib/domain/stage-transition';

// ═══════════════════════════════════════════════════════
// S-DEAL-PULSE-1 (W8): свой запрос, НЕ `useActivityLog`.
//
// `useActivityLog` берёт `select('*')` с `limit(50)` — за 30 дней активной
// сделки полсотни строк кончатся раньше, чем окно, и пульс молча покажет
// неправду (обрежет начало окна). Здесь нужна одна колонка и без лимита —
// индекс `(project_id, created_at desc)` этот запрос покрывает.
//
// Технический `stage_transition_committed` (S-TL-*) режется тем же `neq`, что
// в `useActivityLog`: он не человеческое касание, а метрика перехода стадии,
// сам переход уже виден как `stage_changed`.
//
// `staleTime` 60с; realtime НЕ подписываем — `activity_log` в publication
// (122) есть, но пульс за 30 дней от одной новой строки не меняется заметно,
// а лишняя подписка на карточке дороже.
// ═══════════════════════════════════════════════════════

export interface DealPulseEvent {
  created_at: string;
}

export function useDealPulse(projectId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['deal-pulse', projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DealPulseEvent[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('activity_log')
        .select('created_at')
        .eq('project_id', projectId)
        .neq('event_type', TRANSITION_METRIC_EVENT)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error) throw error;
      // `created_at` типизирован nullable (генератор типов Supabase не видит
      // NOT NULL по умолчанию столбца) — на живых строках его не бывает, но
      // домен принимает только `string`, и молчаливый `as` здесь был бы ложью.
      return (data ?? []).filter((row): row is DealPulseEvent => row.created_at !== null);
    },
  });
}
