'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import { fetchInBatches } from '@/lib/utils/query-batching';
import { mskDateKey } from '@/lib/utils/date-helpers';
import {
  TOUCH_EVENT_TYPES,
  touchesFromRows,
  type ActivityTouchRow,
  type DealTouch,
  type NoteTouchRow,
} from '@/lib/domain/deal-touch';

// ═══════════════════════════════════════════════════════
// S-TODAY-V3-SCREEN-1: касания сделок — заметки + журнал, два запроса на пачку.
//
// Логики здесь нет намеренно: что считается касанием, как снимается отскок стадии
// и почему `comment_added` не касание — всё в `touchesFromRows` (`deal-touch.ts`),
// где это видит тест. Хук только запрашивает строки и зовёт чистую функцию.
//
// Заменил `useDealPulse`: тот читал один `activity_log` и с 135 не видел заметок
// (мост заметок в журнал снят), зато считал правки полей.
//
// ⚠️ Лимит PostgREST — 1000 строк на ответ. На 04.10.2026 за 120 дней по всей
// организации: заметок 64, событий журнала 90. Пагинации нет; рост на порядок —
// повод её завести, а не поднять окно.
// ═══════════════════════════════════════════════════════

export const DEAL_TOUCHES_KEY = ['deal-touches'] as const;

/** Одна сделка — окно «Пульса» (30 дней) с запасом в день на границу суток. */
const ONE_DEAL_WINDOW_DAYS = 31;

/** Начало дня `sinceKey` по МСК — граница `gte` для `timestamptz`. */
function sinceIso(sinceKey: string): string {
  return `${sinceKey}T00:00:00+03:00`;
}

async function fetchTouches(ids: readonly string[], sinceKey: string): Promise<Map<string, DealTouch[]>> {
  const supabase = createClient();
  const since = sinceIso(sinceKey);
  const [notes, activity] = await Promise.all([
    fetchInBatches(ids, async (batch): Promise<NoteTouchRow[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('project_id, created_at, kind')
        .in('project_id', batch)
        .is('deleted_at', null)
        .gte('created_at', since);
      if (error) throw error;
      return data ?? [];
    }),
    fetchInBatches(ids, async (batch): Promise<ActivityTouchRow[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('project_id, event_type, created_at, payload')
        .in('project_id', batch)
        .in('event_type', [...TOUCH_EVENT_TYPES])
        .gte('created_at', since);
      if (error) throw error;
      return data ?? [];
    }),
  ]);
  return touchesFromRows(notes, activity);
}

/** Касания пачки сделок с дня `sinceKey` ('YYYY-MM-DD'). */
export function useDealTouches(projectIds: readonly string[], sinceKey: string | null) {
  // Новая заметка или смена стадии где угодно — экран «Сегодня» пересчитывает группы.
  useRealtimeSync('notes', DEAL_TOUCHES_KEY);
  useRealtimeSync('activity_log', DEAL_TOUCHES_KEY);

  // Сортировка — свойство ключа, не данных: тот же набор в другом порядке не заводит
  // второй кэш.
  const ids = [...projectIds].sort();
  return useQuery({
    queryKey: [...DEAL_TOUCHES_KEY, 'bulk', ids.join(','), sinceKey],
    enabled: ids.length > 0 && !!sinceKey,
    staleTime: 60_000,
    queryFn: () => fetchTouches(ids, sinceKey as string),
  });
}

/**
 * Касания одной сделки за 30 дней — для «Пульса» карточки.
 *
 * Realtime нет — как не было у прежнего `useDealPulse`: смена стадии или закрытая
 * задача доедут по `staleTime`, а новую заметку доставляет сброс `DEAL_TOUCHES_KEY`
 * из `use-notes.ts`.
 */
export function useDealTouchesOne(projectId: string) {
  return useQuery({
    queryKey: [...DEAL_TOUCHES_KEY, 'one', projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DealTouch[]> => {
      const sinceKey = mskDateKey(new Date(Date.now() - ONE_DEAL_WINDOW_DAYS * 86_400_000));
      const map = await fetchTouches([projectId], sinceKey);
      return map.get(projectId) ?? [];
    },
  });
}
